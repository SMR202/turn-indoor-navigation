import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { categoryColors, type PlaceCategory } from '@turn/design';
import {
  ICON_PATHS,
  placeLabels,
  pointInPolygon,
  type P,
  type Scene,
} from '@turn/map-scene';
import { placeCategories } from '@turn/design';
import { Icon } from '../ui';

export type MapBeacon = {
  tag: string;
  x: number;
  y: number;
  tone?: 'ok' | 'warn' | 'planned' | 'silent';
};
type Props = {
  scene: Scene;
  height: number;
  selectedRoomId?: string | null;
  onRoomClick?: (roomId: string | null, point: P) => void;
  /** When set, a click on the map calls this instead of selecting rooms (placement tools). */
  onMapClick?: (p: P) => void;
  beacons?: MapBeacon[];
  onBeaconMove?: (tag: string, p: P) => void;
  coverage?: { x: number; y: number; heard: number }[];
  coverageGrid?: number;
  anchors?: { id: string; label: string; x: number; y: number }[];
  route?: P[] | null;
  placeMarkers?: boolean;
  legend?: ReactNode;
  /** Controls drawn over the map, top left (for example the floor picker). */
  toolbar?: ReactNode;
  cursor?: string;
};
type Cam = { cx: number; cy: number; s: number };

const heardColor = (n: number) =>
  n >= 4
    ? '#1F8A5B'
    : n === 3
      ? '#5FAE7E'
      : n === 2
        ? '#D9A441'
        : n === 1
          ? '#E08A4F'
          : '#C2412D';

/** Interactive floor map for the console: same scene model and palette as the visitor app. */
export function MapCanvas(props: Props) {
  const { scene } = props;
  const pal = scene.palette;
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const h = props.height;
  const [cam, setCam] = useState<Cam | null>(null);
  const drag = useRef<{
    x: number;
    y: number;
    cam: Cam;
    moved: boolean;
    beacon?: string;
  } | null>(null);

  const fit = useMemo(() => {
    const b = scene.bounds;
    const s = Math.min(
      (w - 56) / (b.maxX - b.minX || 1),
      (h - 56) / (b.maxY - b.minY || 1),
    );
    return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, s };
  }, [scene, w, h]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => setCam(null), [scene.venueId, scene.floorId]);
  const c = cam ?? fit;
  const toScreen = (p: P) => ({
    x: w / 2 + (p.x - c.cx) * c.s,
    y: h / 2 - (p.y - c.cy) * c.s,
  });
  const toMap = (sx: number, sy: number): P => ({
    x: c.cx + (sx - w / 2) / c.s,
    y: c.cy + (h / 2 - sy) / c.s,
  });

  // Wheel zoom around the pointer (native listener so the page does not scroll).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left,
        sy = e.clientY - r.top;
      setCam((prev) => {
        const p = prev ?? fit;
        const s = Math.max(
          fit.s * 0.5,
          Math.min(fit.s * 12, p.s * Math.exp(-e.deltaY * 0.0016)),
        );
        const mx = p.cx + (sx - w / 2) / p.s,
          my = p.cy + (h / 2 - sy) / p.s;
        return { s, cx: mx - (sx - w / 2) / s, cy: my - (h / 2 - sy) / s };
      });
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [fit, w, h]);

  const polys = useMemo(() => {
    const d = (pts: P[]) =>
      pts
        .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
        .join('') + 'Z';
    return {
      footprint: scene.rooms
        .filter((r) => r.kind !== 'outdoor')
        .map((r) => d(r.polygon))
        .join(''),
      rooms: scene.rooms.map((r) => ({ ...r, d: d(r.polygon) })),
      walls: scene.walls
        .map((x) => `M${x.from.x} ${x.from.y}L${x.to.x} ${x.to.y}`)
        .join(''),
      windows: scene.windows
        .map((x) => `M${x.from.x} ${x.from.y}L${x.to.x} ${x.to.y}`)
        .join(''),
    };
  }, [scene]);
  const labels = useMemo(
    () => placeLabels(scene, c.s, { minSize: 11, maxSize: 13 }),
    [scene, Math.round(Math.log(c.s) * 10)],
  );
  const ext = scene.extrusionMetres;

  const onDown = (e: React.PointerEvent, beacon?: string) => {
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, cam: c, moved: false, beacon };
    e.stopPropagation();
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x,
      dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (!d.moved) return;
    if (d.beacon && props.onBeaconMove) {
      const r = box.current!.getBoundingClientRect();
      props.onBeaconMove(
        d.beacon,
        toMap(e.clientX - r.left, e.clientY - r.top),
      );
      return;
    }
    setCam({
      s: d.cam.s,
      cx: d.cam.cx - dx / d.cam.s,
      cy: d.cam.cy + dy / d.cam.s,
    });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || d.beacon) return;
    const r = box.current!.getBoundingClientRect();
    const p = toMap(e.clientX - r.left, e.clientY - r.top);
    if (props.onMapClick) return props.onMapClick(p);
    const room = scene.rooms
      .filter((x) => pointInPolygon(p, x.polygon))
      .sort((a, b) => a.area - b.area)[0];
    props.onRoomClick?.(room?.id ?? null, p);
  };
  const zoom = (k: number) =>
    setCam({ ...c, s: Math.max(fit.s * 0.5, Math.min(fit.s * 12, c.s * k)) });
  const matrix = `matrix(${c.s} 0 0 ${-c.s} ${w / 2 - c.cx * c.s} ${h / 2 + c.cy * c.s})`;
  const g = props.coverageGrid ?? 1;
  return (
    <div
      className="map-wrap"
      ref={box}
      style={{
        height: h,
        cursor: props.cursor ?? (drag.current ? 'grabbing' : 'grab'),
      }}
    >
      <svg
        width={w}
        height={h}
        onPointerDown={(e) => onDown(e)}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <g transform={matrix}>
          <path
            d={polys.footprint}
            fill={pal.extrusion}
            stroke={pal.extrusion}
            strokeWidth={0.5}
            strokeLinejoin="round"
          />
          {polys.rooms
            .filter((r) => r.kind === 'outdoor' || r.kind === 'circulation')
            .map((r) => (
              <path key={r.id} d={r.d} fill={r.fill} />
            ))}
          <g transform={`translate(0 ${-ext})`}>
            {polys.rooms
              .filter((r) => r.casts)
              .map((r) => (
                <path key={r.id} d={r.d} fill={pal.extrusion} />
              ))}
          </g>
          {polys.rooms
            .filter((r) => r.kind !== 'outdoor' && r.kind !== 'circulation')
            .map((r) => (
              <path
                key={r.id}
                d={r.d}
                fill={r.id === props.selectedRoomId ? pal.roomSelected : r.fill}
                style={{ transition: 'fill 200ms' }}
              />
            ))}
          {props.coverage?.map((p, i) => (
            <rect
              key={i}
              x={p.x - g / 2}
              y={p.y - g / 2}
              width={g}
              height={g}
              fill={heardColor(p.heard)}
              opacity={0.32}
            />
          ))}
          <path
            d={polys.walls}
            stroke={pal.wall}
            strokeWidth={Math.max(0.15, 1.1 / c.s)}
            strokeLinecap="round"
            fill="none"
          />
          {polys.windows && (
            <path
              d={polys.windows}
              stroke={pal.window}
              strokeWidth={Math.max(0.07, 1 / c.s)}
              fill="none"
            />
          )}
          {props.selectedRoomId &&
            polys.rooms
              .filter((r) => r.id === props.selectedRoomId)
              .map((r) => (
                <path
                  key={r.id}
                  d={r.d}
                  fill="none"
                  stroke={pal.route}
                  strokeWidth={2 / c.s}
                  strokeLinejoin="round"
                />
              ))}
          {props.route && props.route.length > 1 && (
            <>
              <path
                d={props.route
                  .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`)
                  .join('')}
                stroke={pal.routeCasing}
                strokeWidth={9 / c.s}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={props.route
                  .map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`)
                  .join('')}
                stroke={pal.route}
                strokeWidth={6 / c.s}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </g>
        {labels.map((l) => {
          const p = toScreen(l);
          const col = l.icon ? categoryColors[l.icon as PlaceCategory] : null;
          const lineH = l.size * 1.2;
          const top =
            p.y - (l.lines.length * lineH) / 2 + (col && !l.iconOnly ? 10 : 0);
          return (
            <g
              key={l.id}
              style={{ opacity: l.id === props.selectedRoomId ? 0.35 : 1 }}
            >
              {col && props.placeMarkers !== false && (
                <g
                  transform={`translate(${p.x - 9} ${l.iconOnly ? p.y - 9 : top - 22})`}
                >
                  <circle cx={9} cy={9} r={9.5} fill="#fff" />
                  <circle cx={9} cy={9} r={8.5} fill={col} />
                  <g transform="translate(3 3) scale(0.5)">
                    {(
                      ICON_PATHS[
                        placeCategories[l.icon as PlaceCategory].icon
                      ] ?? []
                    ).map((d, i) => (
                      <path
                        key={i}
                        d={d}
                        fill="none"
                        stroke="#fff"
                        strokeWidth={2.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </g>
                </g>
              )}
              {!l.iconOnly &&
                l.lines.map((line, i) => (
                  <text
                    key={i}
                    className="map-label"
                    x={p.x}
                    y={top + (i + 0.8) * lineH}
                    textAnchor="middle"
                    fontSize={l.muted ? l.size - 2 : l.size}
                    fontWeight={l.muted ? 600 : l.weight === '600' ? 600 : 500}
                    fill={l.muted ? pal.labelMuted : pal.label}
                    letterSpacing={l.muted ? 1 : -0.1}
                  >
                    {l.muted ? line.toUpperCase() : line}
                  </text>
                ))}
            </g>
          );
        })}
        {props.anchors?.map((a) => {
          const p = toScreen(a);
          return (
            <g key={a.id} transform={`translate(${p.x} ${p.y})`}>
              <rect
                x={-12}
                y={-12}
                width={24}
                height={24}
                rx={7}
                fill="#0B1220"
                stroke="#fff"
                strokeWidth={2}
              />
              <g transform="translate(-7 -7) scale(0.58)">
                {[
                  'M4 4h6v6H4Z',
                  'M14 4h6v6h-6Z',
                  'M4 14h6v6H4Z',
                  'M14 14h2',
                  'M18 18h2',
                ].map((d) => (
                  <path
                    key={d}
                    d={d}
                    fill="none"
                    stroke="#fff"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                ))}
              </g>
            </g>
          );
        })}
        {props.beacons?.map((b) => {
          const p = toScreen(b);
          const fill =
            b.tone === 'silent'
              ? '#C2412D'
              : b.tone === 'planned'
                ? '#fff'
                : pal.beacon;
          return (
            <g
              key={b.tag}
              transform={`translate(${p.x} ${p.y})`}
              onPointerDown={
                props.onBeaconMove ? (e) => onDown(e, b.tag) : undefined
              }
              className={props.onBeaconMove ? 'beacon' : undefined}
            >
              <circle r={16} fill={pal.beacon} opacity={0.14} />
              <circle
                r={9}
                fill={fill}
                stroke={b.tone === 'planned' ? pal.beacon : '#fff'}
                strokeWidth={2.5}
                strokeDasharray={b.tone === 'planned' ? '3 2' : undefined}
              />
              <text
                y={-15}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                className="map-label"
                fill={pal.beacon}
              >
                {b.tag}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-tools">
        <button onClick={() => zoom(1.4)} aria-label="Zoom in">
          <Icon name="plus" size={16} />
        </button>
        <button onClick={() => zoom(1 / 1.4)} aria-label="Zoom out">
          <Icon name="minus" size={16} />
        </button>
        <button onClick={() => setCam(null)} aria-label="Fit floor">
          <Icon name="locate" size={16} />
        </button>
      </div>
      {props.legend && <div className="map-legend">{props.legend}</div>}
      {props.toolbar && (
        <div style={{ position: 'absolute', left: 12, top: 12 }}>
          {props.toolbar}
        </div>
      )}
    </div>
  );
}

export { heardColor };
