import type { FeatureCollection } from 'geojson';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  TurboModuleRegistry,
  type NativeSyntheticEvent,
} from 'react-native';
import type * as MapLibre from '@maplibre/maplibre-react-native';
import {
  buildMapStyle,
  dynamicLayers,
  endpointData,
  fromLngLat,
  markerData,
  metresPerPixel,
  routeData,
  sceneLngLatBounds,
  selectionData,
  toLngLat,
  userData,
  zoomForMetresPerPixel,
} from '@turn/map-scene';
import { apiBase } from '../lib/api';
import { CATEGORY_IMAGES } from './category-images';
import {
  bearingFor,
  DOT_TAP_PX,
  DotAnimator,
  FOLLOW_PITCH,
  followPadding,
  MAX_ZOOM,
  OVERVIEW_PITCH,
  PICK_PX,
  pickPlace,
  type Map3DProps,
} from './map3d-shared';
import { VenueMap } from './VenueMap';

/**
 * Builds made before MapLibre was added do not contain its native code: they keep the SVG map
 * (feature-detected, so one JavaScript bundle serves old and new builds).
 */
const ML: typeof MapLibre | null =
  TurboModuleRegistry.get('MLRNMapViewModule') != null
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('@maplibre/maplibre-react-native') as typeof MapLibre)
    : null;
export const mapEngine: 'maplibre' | 'svg' = ML ? 'maplibre' : 'svg';

export const VenueMap3D = memo(function VenueMap3D(props: Map3DProps) {
  if (!ML) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { georef, ...svg } = props;
    return <VenueMap {...svg} />;
  }
  return <NativeMap {...props} ml={ML} />;
});

function NativeMap(props: Map3DProps & { ml: typeof MapLibre }) {
  const { Map, Camera, GeoJSONSource, Layer, Images } = props.ml;
  const g = props.georef;
  const map = useRef<MapLibre.MapRef>(null);
  const camera = useRef<MapLibre.CameraRef>(null);
  const latest = useRef(props);
  latest.current = props;
  const size = useRef({ height: 800 });
  const zoom = useRef(18);
  const following = useRef(false);
  const bearing = useRef<number | null>(null);
  const dot = useRef<{ x: number; y: number } | null>(null);
  const [userGeo, setUserGeo] = useState<FeatureCollection>(() =>
    userData(props.user, g),
  );
  const glyphs = `${apiBase() ?? 'http://localhost:8090'}/map/glyphs/{fontstack}/{range}.pbf`;
  const style = useMemo(
    () => buildMapStyle(props.scene, { georef: g, glyphs }),
    [props.scene, g, glyphs],
  );
  const layers = useMemo(
    () => dynamicLayers(props.scene.palette),
    [props.scene],
  );
  const bounds = sceneLngLatBounds(props.scene, g);
  const lngLatBounds: MapLibre.LngLatBounds = [
    bounds[0][0],
    bounds[0][1],
    bounds[1][0],
    bounds[1][1],
  ];
  const padding = () => ({
    top: latest.current.insets.top,
    bottom: latest.current.insets.bottom,
    left: 16,
    right: 16,
  });

  const selection = useMemo(
    () => selectionData(props.scene, props.selectedPlace?.roomId ?? null, g),
    [props.scene, props.selectedPlace, g],
  );
  const route = useMemo(
    () => routeData(props.route, props.walked ?? 0, g),
    [props.route, props.walked, g],
  );
  const endpoints = useMemo(
    () =>
      endpointData(
        props.routeStart ?? null,
        props.route?.length ? props.route[props.route.length - 1]! : null,
        g,
      ),
    [props.routeStart, props.route, g],
  );
  const markers = useMemo(
    () => markerData(props.markers ?? [], g),
    [props.markers, g],
  );
  // A static dot (tap, preview) when there is no live one.
  useEffect(() => {
    if (!props.liveDot || !props.liveVisible)
      setUserGeo(userData(props.user, g));
  }, [props.user, props.liveDot, props.liveVisible, g]);

  // The live dot glides at frame rate; following moves the camera with it, heading-up.
  useEffect(() => {
    const live = props.liveDot;
    if (!live || !props.liveVisible) {
      dot.current = null;
      return;
    }
    let lastCamera = 0;
    const animator = new DotAnimator((f) => {
      dot.current = f;
      setUserGeo(userData(f, g));
      if (!f || !following.current) return;
      const now = Date.now();
      // The native camera animates itself between our steps.
      if (now - lastCamera < 100) return;
      lastCamera = now;
      const target =
        f.heading !== null ? bearingFor(f.heading, g) : bearing.current;
      if (target !== null) {
        const cur = bearing.current ?? target;
        const diff = ((target - cur + 540) % 360) - 180;
        bearing.current = cur + Math.max(-12, Math.min(12, diff * 0.5));
      }
      camera.current?.easeTo({
        center: toLngLat(f, g),
        ...(bearing.current !== null ? { bearing: bearing.current } : {}),
        padding: followPadding(size.current.height, latest.current.insets),
        duration: 120,
        easing: 'linear',
      });
    });
    animator.attach(live);
    return () => animator.detach();
  }, [props.liveDot, props.liveVisible, g]);

  useEffect(() => {
    following.current = !!props.follow && !!props.liveVisible;
    bearing.current = null;
    const d = dot.current;
    if (following.current && d)
      camera.current?.easeTo({
        center: toLngLat(d, g),
        pitch: FOLLOW_PITCH,
        zoom: Math.max(zoom.current, zoomForMetresPerPixel(0.045, g.lat)),
        padding: followPadding(size.current.height, latest.current.insets),
        duration: 700,
      });
    else if (!following.current)
      camera.current?.easeTo({
        center: toLngLat(
          d ?? {
            x: (props.scene.bounds.minX + props.scene.bounds.maxX) / 2,
            y: (props.scene.bounds.minY + props.scene.bounds.maxY) / 2,
          },
          g,
        ),
        pitch: OVERVIEW_PITCH,
        padding: padding(),
        duration: 500,
      });
  }, [props.follow, props.liveVisible]);

  // Camera commands from the screen.
  useEffect(() => {
    const c = props.command;
    const cam = camera.current;
    if (!c || !cam) return;
    if (c.kind === 'fit')
      cam.fitBounds(lngLatBounds, {
        padding: padding(),
        bearing: g.bearingDeg,
        pitch: OVERVIEW_PITCH,
        duration: 600,
      });
    else if (c.kind === 'point')
      cam.easeTo({
        center: toLngLat(c, g),
        zoom: c.zoom
          ? zoomForMetresPerPixel(1 / c.zoom, g.lat)
          : Math.max(zoom.current, zoom.current + 0.8),
        padding: padding(),
        duration: 600,
      });
    else if (c.points.length) {
      const ll = c.points.map((p) => toLngLat(p, g));
      cam.fitBounds(
        [
          Math.min(...ll.map((l) => l[0])),
          Math.min(...ll.map((l) => l[1])),
          Math.max(...ll.map((l) => l[0])),
          Math.max(...ll.map((l) => l[1])),
        ],
        {
          padding: {
            top: props.insets.top + 48,
            bottom: props.insets.bottom + 48,
            left: 48,
            right: 48,
          },
          duration: 650,
        },
      );
    }
  }, [props.command?.id]);

  const onPress = async (
    e: NativeSyntheticEvent<
      MapLibre.PressEvent | MapLibre.PressEventWithFeatures
    >,
  ) => {
    const p = latest.current;
    const { lngLat, point } = e.nativeEvent;
    const at = fromLngLat(lngLat, g);
    const d = dot.current;
    if (p.onDotTap && d && map.current) {
      const s = await map.current.project(toLngLat(d, g));
      if (Math.hypot(s[0] - point[0], s[1] - point[1]) <= DOT_TAP_PX) {
        p.onDotTap();
        return;
      }
    }
    if (p.onMapTap) {
      p.onMapTap(at, 1 / metresPerPixel(zoom.current, lngLat[1]));
      return;
    }
    const m = map.current;
    if (!m) return;
    const near = await m.queryRenderedFeatures(
      [
        [point[0] - PICK_PX, point[1] - PICK_PX],
        [point[0] + PICK_PX, point[1] + PICK_PX],
      ],
      { layers: ['place-icons', 'room-labels'] },
    );
    const inside = await m.queryRenderedFeatures(point, {
      layers: ['room-fill'],
    });
    p.onSelect(pickPlace([...near, ...inside]).placeId);
  };

  return (
    <Map
      ref={map}
      style={StyleSheet.absoluteFill}
      mapStyle={style}
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchPitch
      touchRotate
      onLayout={(e) => {
        size.current = { height: e.nativeEvent.layout.height };
      }}
      onPress={onPress}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) latest.current.onGesture?.();
      }}
      onRegionDidChange={(e) => {
        zoom.current = e.nativeEvent.zoom;
        latest.current.onCenterChange?.(fromLngLat(e.nativeEvent.center, g));
      }}
    >
      <Camera
        ref={camera}
        initialViewState={{
          bounds: lngLatBounds,
          padding: padding(),
          bearing: g.bearingDeg,
          pitch: OVERVIEW_PITCH,
        }}
        maxZoom={MAX_ZOOM}
      />
      <Images images={CATEGORY_IMAGES} />
      <GeoJSONSource id="selection" data={selection}>
        {layers.under
          .filter((l) => 'source' in l && l.source === 'selection')
          .map((l) => (
            <Layer
              key={l.id}
              {...(l as unknown as MapLibre.LayerProps)}
              beforeId={layers.beforeId}
            />
          ))}
      </GeoJSONSource>
      <GeoJSONSource id="route" data={route}>
        {layers.under
          .filter((l) => 'source' in l && l.source === 'route')
          .map((l) => (
            <Layer
              key={l.id}
              {...(l as unknown as MapLibre.LayerProps)}
              beforeId={layers.beforeId}
            />
          ))}
      </GeoJSONSource>
      <GeoJSONSource id="markers" data={markers}>
        {layers.over
          .filter((l) => 'source' in l && l.source === 'markers')
          .map((l) => (
            <Layer key={l.id} {...(l as unknown as MapLibre.LayerProps)} />
          ))}
      </GeoJSONSource>
      <GeoJSONSource id="endpoints" data={endpoints}>
        {layers.over
          .filter((l) => 'source' in l && l.source === 'endpoints')
          .map((l) => (
            <Layer key={l.id} {...(l as unknown as MapLibre.LayerProps)} />
          ))}
      </GeoJSONSource>
      <GeoJSONSource id="user" data={userGeo}>
        {layers.over
          .filter((l) => 'source' in l && l.source === 'user')
          .map((l) => (
            <Layer key={l.id} {...(l as unknown as MapLibre.LayerProps)} />
          ))}
      </GeoJSONSource>
    </Map>
  );
}
