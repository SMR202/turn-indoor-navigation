import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MLMap,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapStyleImageMissingEvent,
  type PaddingOptions,
  setWorkerUrl,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  blockData,
  buildMapStyle,
  categoryImageId,
  composeStyle,
  DESTINATION_PIN_IMAGE,
  endpointData,
  fromLngLat,
  markerData,
  metresPerPixel,
  MAP_CATEGORIES,
  ROUTE_ARROW_IMAGE,
  routeData,
  sceneLngLatBounds,
  selectionData,
  stepBearing,
  stepTowards,
  toLngLat,
  userData,
  zoomForMetresPerPixel,
  type DynamicSource,
} from '@turn/map-scene';
import { apiBase } from '../lib/api';
import {
  bearingFor,
  DOT_TAP_PX,
  DotAnimator,
  FOLLOW_PITCH,
  followPadding,
  MAX_ZOOM,
  OVERVIEW_PITCH,
  PICK_NEAR_LAYERS,
  PICK_PX,
  PICK_ROOM_LAYERS,
  pickPlace,
  type Map3DProps,
} from './map3d-shared';

// The bundler cannot emit MapLibre's worker; a copy is served from public/ (same origin).
if (globalThis.location)
  setWorkerUrl(`${globalThis.location.origin}/maplibre/maplibre-gl-worker.mjs`);

/** Where map labels and icons come from: the TURN server, else this web app's own copy. */
function assetBase() {
  return (apiBase() ?? `${globalThis.location?.origin ?? ''}`) + '/map';
}

/**
 * The venue map on the web (TURN Lite, browser preview): MapLibre GL draws the floor on the GPU
 * with extruded walls, collision-free labels and smooth zoom, rotate and tilt (ADR-0013).
 */
export const VenueMap3D = memo(function VenueMap3D(props: Map3DProps) {
  const host = useRef<View>(null);
  const map = useRef<MLMap | null>(null);
  const loaded = useRef(false);
  const latest = useRef(props);
  latest.current = props;
  const dot = useRef<{ x: number; y: number; heading: number | null } | null>(
    null,
  );
  const following = useRef(false);
  const bearing = useRef<number | null>(null);
  const g = props.georef;
  const base = useMemo(
    () =>
      buildMapStyle(props.scene, {
        georef: g,
        glyphs: `${assetBase()}/glyphs/{fontstack}/{range}.pbf`,
      }),
    [props.scene, g],
  );

  // The style the map shows now (set when the map is created, then on each swap).
  const shownBase = useRef(base);

  const padding = (): PaddingOptions => ({
    top: latest.current.insets.top,
    bottom: latest.current.insets.bottom,
    left: 0,
    right: 0,
  });
  const fitZoom = () => {
    const m = map.current;
    if (!m) return 18;
    const cam = m.cameraForBounds(sceneLngLatBounds(props.scene, g), {
      padding: { ...padding(), left: 28, right: 28 },
      bearing: g.bearingDeg,
    });
    return cam?.zoom ?? 18;
  };
  const overviewPitch = () => (latest.current.flat ? 0 : OVERVIEW_PITCH);
  const setData = (id: DynamicSource | 'blocks', data: FeatureCollection) => {
    const m = map.current;
    if (!m || !loaded.current) return;
    (m.getSource(id) as GeoJSONSource | undefined)?.setData(data);
  };

  // Create the map once.
  useEffect(() => {
    const parent = host.current as unknown as HTMLElement | null;
    if (!parent) return;
    // MapLibre's stylesheet makes its container position: relative; give it its own full-size box.
    const el = document.createElement('div');
    el.style.cssText = 'width:100%;height:100%';
    parent.appendChild(el);
    shownBase.current = base;
    const m = new MLMap({
      container: el,
      style: composeStyle(base, props.scene.palette),
      bounds: sceneLngLatBounds(props.scene, g),
      fitBoundsOptions: { padding: 24 },
      bearing: g.bearingDeg,
      pitch: overviewPitch(),
      maxZoom: MAX_ZOOM,
      maxPitch: 68,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      fadeDuration: 150,
    });
    map.current = m;
    // Inspectable from the browser console while developing.
    if (__DEV__) (globalThis as { __turnMap?: MLMap }).__turnMap = m;
    const loading = new Set<string>();
    const loadIcon = (id: string, placeholder: boolean) => {
      if (loading.has(id)) return;
      loading.add(id);
      // Reserve the id at once so repeated misses do not start more downloads.
      if (placeholder && !m.hasImage(id))
        m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      m.loadImage(`${assetBase()}/icons/${id}.png`)
        .then((img: { data: HTMLImageElement | ImageBitmap }) => {
          if (m.hasImage(id)) m.removeImage(id);
          m.addImage(id, img.data, { pixelRatio: 2 });
        })
        .catch(() => undefined);
    };
    // Fetch the badges before the style asks for them, so they do not pop in late.
    for (const id of [
      ...MAP_CATEGORIES.map(categoryImageId),
      ROUTE_ARROW_IMAGE,
      DESTINATION_PIN_IMAGE,
    ])
      loadIcon(id, false);
    m.on('styleimagemissing', (e: MapStyleImageMissingEvent) => {
      if (!m.hasImage(e.id)) loadIcon(e.id, true);
    });
    m.on('load', () => {
      loaded.current = true;
      const p = latest.current;
      m.setPadding(padding());
      m.fitBounds(sceneLngLatBounds(p.scene, g), {
        padding: { ...padding(), left: 28, right: 28 },
        bearing: g.bearingDeg,
        pitch: overviewPitch(),
        duration: 0,
      });
      m.setMinZoom(Math.max(0, fitZoom() - 2));
      pushDynamic();
    });
    // A gesture by the person ends following.
    const userMoved = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) latest.current.onGesture?.();
    };
    m.on('dragstart', userMoved);
    m.on('rotatestart', userMoved);
    m.on('pitchstart', userMoved);
    m.on('zoomstart', userMoved);
    m.on('moveend', () => {
      const c = m.getCenter();
      latest.current.onCenterChange?.(fromLngLat([c.lng, c.lat], g));
    });
    m.on('click', (e: MapMouseEvent) => {
      const p = latest.current;
      const at = fromLngLat([e.lngLat.lng, e.lngLat.lat], g);
      const d = dot.current;
      if (p.onDotTap && d) {
        const s = m.project(toLngLat(d, g));
        if (Math.hypot(s.x - e.point.x, s.y - e.point.y) <= DOT_TAP_PX) {
          p.onDotTap();
          return;
        }
      }
      if (p.onMapTap) {
        const mpp = metresPerPixel(m.getZoom(), e.lngLat.lat);
        p.onMapTap(at, 1 / mpp);
        return;
      }
      const box: [[number, number], [number, number]] = [
        [e.point.x - PICK_PX, e.point.y - PICK_PX],
        [e.point.x + PICK_PX, e.point.y + PICK_PX],
      ];
      const hits = m.queryRenderedFeatures(box, {
        layers: PICK_NEAR_LAYERS,
      });
      const inside = m.queryRenderedFeatures(e.point, {
        layers: PICK_ROOM_LAYERS,
      });
      p.onSelect(pickPlace([...hits, ...inside]).placeId);
    });
    m.getCanvas().style.cursor = 'default';
    m.on('mousemove', ['place-icons', 'blocks', 'room-fill'], () => {
      m.getCanvas().style.cursor = 'pointer';
    });
    m.on('mouseleave', ['place-icons', 'blocks', 'room-fill'], () => {
      m.getCanvas().style.cursor = 'default';
    });
    return () => {
      loaded.current = false;
      m.remove();
      el.remove();
      map.current = null;
    };
    // The map is created once; later changes are applied by the effects below.
  }, []);

  // A new floor or venue: swap the style (MapLibre diffs it) once the map has its first style.
  useEffect(() => {
    const m = map.current;
    if (!m || shownBase.current === base) return;
    const swap = () => {
      shownBase.current = base;
      m.setStyle(composeStyle(base, latest.current.scene.palette));
      m.once('styledata', () => pushDynamic());
    };
    if (loaded.current) swap();
    else m.once('load', swap);
  }, [base]);

  function pushDynamic() {
    const p = latest.current;
    const selected = p.selectedPlace?.roomId ?? null;
    const style = p.selectionStyle ?? 'lift';
    setData('selection', selectionData(p.scene, selected, g, style));
    setData(
      'blocks',
      blockData(
        p.scene,
        g,
        style === 'floor' && selected
          ? [...(p.openRooms ?? []), selected]
          : (p.openRooms ?? []),
        style === 'lift' ? selected : null,
      ),
    );
    setData('route', routeData(p.route, p.walked ?? 0, g));
    setData(
      'endpoints',
      endpointData(
        p.routeStart ?? null,
        p.route?.length ? p.route[p.route.length - 1]! : null,
        g,
      ),
    );
    setData(
      'markers',
      markerData(
        (p.markers ?? []).map((m) => ({ ...m, text: m.text })),
        g,
      ),
    );
    if (!p.liveDot || !p.liveVisible) setData('user', userData(p.user, g));
  }
  useEffect(pushDynamic, [
    props.selectedPlace,
    props.route,
    props.walked,
    props.routeStart,
    props.markers,
    props.user,
    props.liveVisible,
    props.scene,
    props.openRooms?.join('|'),
    props.selectionStyle,
  ]);

  useEffect(() => {
    map.current?.setPadding(padding());
  }, [props.insets.top, props.insets.bottom]);

  // The live dot: interpolated every frame; the camera follows it heading-up when asked.
  useEffect(() => {
    const live = props.liveDot;
    if (!live || !props.liveVisible) {
      dot.current = null;
      return;
    }
    let lastFrame = performance.now();
    const animator = new DotAnimator((f) => {
      const m = map.current;
      dot.current = f ? { x: f.x, y: f.y, heading: f.heading } : null;
      setData('user', userData(f, g));
      const now = performance.now();
      const dt = now - lastFrame;
      lastFrame = now;
      if (!m || !f || !following.current) return;
      // The camera director says where to look; each frame eases a little of the way there.
      const want = latest.current.followCamera;
      const course = want?.courseRad ?? f.heading;
      const cur = bearing.current ?? m.getBearing();
      const next =
        course !== null && course !== undefined
          ? stepBearing(cur, bearingFor(course, g), dt)
          : cur;
      bearing.current = next;
      const pitch = latest.current.flat ? 0 : (want?.pitchDeg ?? FOLLOW_PITCH);
      const zoom = zoomForMetresPerPixel(want?.metresPerPixel ?? 0.045, g.lat);
      m.jumpTo({
        center: toLngLat(f, g),
        bearing: next,
        pitch: stepTowards(m.getPitch(), pitch, dt, 520),
        zoom: stepTowards(m.getZoom(), zoom, dt, 620),
        padding: followPadding(
          m.getContainer().clientHeight,
          latest.current.insets,
          want?.dotAt,
        ),
      });
    });
    animator.attach(live);
    return () => animator.detach();
  }, [props.liveDot, props.liveVisible, g]);

  // Following is driven frame by frame above; leaving it settles back to the overview tilt.
  useEffect(() => {
    const m = map.current;
    following.current = !!props.follow && !!props.liveVisible;
    bearing.current = null;
    if (!m || !loaded.current || following.current) return;
    m.easeTo({ pitch: overviewPitch(), padding: padding(), duration: 500 });
  }, [props.follow, props.liveVisible, props.flat]);

  // Camera commands from the screen.
  useEffect(() => {
    const m = map.current;
    const c = props.command;
    if (!m || !c) return;
    const run = () => {
      if (c.kind === 'fit')
        m.fitBounds(sceneLngLatBounds(props.scene, g), {
          padding: { ...padding(), left: 28, right: 28 },
          bearing: g.bearingDeg,
          pitch: overviewPitch(),
          duration: 600,
        });
      else if (c.kind === 'reset-bearing')
        m.easeTo({
          bearing: g.bearingDeg,
          pitch: overviewPitch(),
          duration: 500,
        });
      else if (c.kind === 'point')
        m.easeTo({
          center: toLngLat(c, g),
          zoom: c.zoom
            ? zoomForMetresPerPixel(1 / c.zoom, g.lat)
            : Math.max(m.getZoom(), fitZoom() + 1.2),
          padding: padding(),
          duration: 600,
        });
      else if (c.points.length) {
        const ll = c.points.map((p) => toLngLat(p, g));
        const lngs = ll.map((l) => l[0]);
        const lats = ll.map((l) => l[1]);
        m.fitBounds(
          [
            [Math.min(...lngs), Math.min(...lats)],
            [Math.max(...lngs), Math.max(...lats)],
          ],
          {
            padding: {
              top: props.insets.top + 48,
              bottom: props.insets.bottom + 48,
              left: 48,
              right: 48,
            },
            maxZoom: fitZoom() + 2.5,
            bearing:
              c.courseRad !== undefined && c.courseRad !== null
                ? bearingFor(c.courseRad, g)
                : m.getBearing(),
            pitch: overviewPitch(),
            duration: 650,
          },
        );
      }
    };
    if (loaded.current) run();
    else m.once('load', run);
  }, [props.command?.id]);

  return <View ref={host} style={StyleSheet.absoluteFill} />;
});

/** The web always has MapLibre GL. */
export const mapEngine = 'maplibre' as const;
