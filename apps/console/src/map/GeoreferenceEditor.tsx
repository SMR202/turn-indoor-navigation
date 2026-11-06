import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Map as MLMap,
  setWorkerUrl,
  type GeoJSONSource,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildMapStyle,
  sceneData,
  toLngLat,
  zoomForMetresPerPixel,
  type Georeference,
  type Scene,
} from '@turn/map-scene';

setWorkerUrl(`${location.origin}/maplibre/maplibre-gl-worker.mjs`);

type Basemap = 'streets' | 'imagery';
const BASEMAPS: Record<
  Basemap,
  { tiles: string[]; attribution: string; maxzoom: number }
> = {
  streets: {
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '© OpenStreetMap contributors',
    maxzoom: 19,
  },
  imagery: {
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    ],
    attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  },
};

/** The plan's centre, which stays under the middle of the map while staff move the basemap. */
const planCentre = (scene: Scene) => ({
  x: (scene.bounds.minX + scene.bounds.maxX) / 2,
  y: (scene.bounds.minY + scene.bounds.maxY) / 2,
});

/**
 * Lines a venue's floor plan up with the world (ADR-0014): the plan stays in the middle of the
 * view while staff pan and zoom the basemap until the real building sits under it, and turn the
 * plan until the walls match. Saves where the map origin is and the bearing of its +y axis.
 */
export function GeoreferenceEditor({
  scene,
  initial,
  onChange,
}: {
  scene: Scene;
  initial: Georeference | null;
  onChange: (g: Georeference) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [basemap, setBasemap] = useState<Basemap>('imagery');
  const [opacity, setOpacity] = useState(0.7);
  const [bearing, setBearing] = useState(initial?.bearingDeg ?? 0);
  const geo = useRef<Georeference>(
    initial ?? { lat: 33.6561, lon: 73.0153, bearingDeg: 0 },
  );
  const shown = useRef<StyleSpecification | null>(null);
  const bearingRef = useRef(bearing);
  bearingRef.current = bearing;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // The plan drawn for a georeference whose plan centre is at (lon, lat).
  const centred = (lon: number, lat: number, b: number): Georeference => {
    const c = planCentre(scene);
    // Find the origin that puts the plan centre at (lon, lat): place it, then shift.
    const probe = { lat, lon, bearingDeg: b };
    const [cl, ca] = toLngLat(c, probe);
    return { lat: lat - (ca - lat), lon: lon - (cl - lon), bearingDeg: b };
  };
  const style = useMemo((): StyleSpecification => {
    const base = buildMapStyle(scene, {
      georef: geo.current,
      glyphs: `${location.origin}/map/glyphs/{fontstack}/{range}.pbf`,
    });
    const bm = BASEMAPS[basemap];
    return {
      ...base,
      sources: {
        basemap: {
          type: 'raster',
          tiles: bm.tiles,
          tileSize: 256,
          maxzoom: bm.maxzoom,
          attribution: bm.attribution,
        },
        ...base.sources,
      },
      layers: [
        { id: 'basemap', type: 'raster', source: 'basemap' },
        // Without the plan's solid background, so the building shows through.
        ...base.layers.filter((l) => l.id !== 'background'),
      ],
    };
  }, [scene, basemap]);

  const redraw = () => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    const c = m.getCenter();
    geo.current = centred(c.lng, c.lat, bearingRef.current);
    const data = sceneData(scene, geo.current);
    for (const id of ['rooms', 'walls', 'windows', 'labels', 'places'] as const)
      (m.getSource(id) as GeoJSONSource | undefined)?.setData(data[id]);
    onChangeRef.current(geo.current);
  };

  useEffect(() => {
    if (!host.current) return;
    const c = toLngLat(planCentre(scene), geo.current);
    const m = new MLMap({
      container: host.current,
      style,
      center: c,
      zoom: zoomForMetresPerPixel(0.12, geo.current.lat),
      maxZoom: 22,
      attributionControl: { compact: true },
    });
    map.current = m;
    shown.current = style;
    if (import.meta.env.DEV)
      (window as { __studioMap?: MLMap }).__studioMap = m;
    m.on('styleimagemissing', (e) => {
      if (m.hasImage(e.id)) return;
      m.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      m.loadImage(`/map/icons/${e.id}.png`)
        .then((img) => {
          m.removeImage(e.id);
          m.addImage(e.id, img.data, { pixelRatio: 2 });
        })
        .catch(() => undefined);
    });
    m.on('move', redraw);
    m.on('load', redraw);
    return () => {
      m.remove();
      map.current = null;
    };
    // The map is created once per venue floor.
  }, [scene]);

  // A different background: swap the style once the map has loaded its first one.
  useEffect(() => {
    const m = map.current;
    if (!m || shown.current === style) return;
    const swap = () => {
      shown.current = style;
      m.setStyle(style);
      m.once('styledata', redraw);
    };
    if (m.isStyleLoaded()) swap();
    else m.once('load', swap);
  }, [style]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    for (const id of ['room-fill', 'room-outline'])
      if (m.getLayer(id))
        m.setPaintProperty(
          id,
          id === 'room-fill' ? 'fill-opacity' : 'line-opacity',
          opacity,
        );
    if (m.getLayer('walls'))
      m.setPaintProperty(
        'walls',
        'fill-extrusion-opacity',
        Math.min(1, opacity + 0.2),
      );
  }, [opacity, style]);

  useEffect(redraw, [bearing]);

  return (
    <div className="col" style={{ gap: 12 }}>
      <div
        ref={host}
        style={{
          height: 420,
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid var(--line)',
        }}
      />
      <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
        <div className="field" style={{ flex: '1 1 260px' }}>
          <label>
            Turn the plan: {Math.round(bearing)}° (direction the plan&apos;s top
            faces)
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn"
              type="button"
              aria-label="Turn one degree left"
              onClick={() => setBearing((b) => (b + 359) % 360)}
            >
              −1°
            </button>
            <input
              type="range"
              min={0}
              max={359.5}
              step={0.5}
              value={bearing}
              onChange={(e) => setBearing(Number(e.target.value))}
              style={{ flex: 1 }}
              aria-label="Plan bearing"
            />
            <button
              className="btn"
              type="button"
              aria-label="Turn one degree right"
              onClick={() => setBearing((b) => (b + 1) % 360)}
            >
              +1°
            </button>
          </div>
        </div>
        <div className="field" style={{ flex: '0 1 180px' }}>
          <label>Plan opacity</label>
          <input
            type="range"
            min={0.15}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            aria-label="Plan opacity"
          />
        </div>
        <div className="field" style={{ flex: '0 1 180px' }}>
          <label>Background</label>
          <select
            className="input"
            value={basemap}
            onChange={(e) => setBasemap(e.target.value as Basemap)}
          >
            <option value="imagery">Satellite</option>
            <option value="streets">Street map</option>
          </select>
        </div>
      </div>
    </div>
  );
}
