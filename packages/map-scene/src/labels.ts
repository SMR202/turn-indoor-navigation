import type { P, Scene } from './scene';

export type PlacedLabel = {
  id: string;
  text: string;
  /** Map coordinates of the label centre. */
  x: number;
  y: number;
  /** Font size in screen pixels. */
  size: number;
  weight: '500' | '600';
  muted: boolean;
  icon: string | null;
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Chooses which room labels to show at a zoom level, like a maps app: most important first, never
 * overlapping, and only when the room is big enough on screen to hold the text.
 * `scale` is screen pixels per metre. Text width is estimated (0.56 em per character for Inter).
 */
export function placeLabels(
  scene: Scene,
  scale: number,
  options: {
    minSize?: number;
    maxSize?: number;
    viewport?: { center: P; width: number; height: number };
  } = {},
): PlacedLabel[] {
  const minSize = options.minSize ?? 10.5;
  const maxSize = options.maxSize ?? 14;
  const size = Math.max(minSize, Math.min(maxSize, 9 + scale * 0.12));
  const rooms = [...scene.rooms]
    .filter((r) => r.name && r.kind !== 'fixture')
    .sort((a, b) => a.priority - b.priority);
  const placed: PlacedLabel[] = [];
  const boxes: Box[] = [];
  const view = options.viewport;
  for (const r of rooms) {
    const text = r.name;
    const wPx = text.length * size * 0.56 + 6;
    const hPx =
      size * 1.3 + (r.category && r.category !== 'room' ? size * 1.2 : 0);
    // Room must hold the label: compare the room's on-screen width to the text width.
    const xs = r.polygon.map((p) => p.x),
      ys = r.polygon.map((p) => p.y);
    const roomW = (Math.max(...xs) - Math.min(...xs)) * scale;
    const roomH = (Math.max(...ys) - Math.min(...ys)) * scale;
    const tooSmall = roomW < wPx * 0.92 || roomH < hPx;
    if (tooSmall) continue;
    const cx = r.labelAnchor.x * scale,
      cy = -r.labelAnchor.y * scale;
    const box = {
      x0: cx - wPx / 2,
      y0: cy - hPx / 2,
      x1: cx + wPx / 2,
      y1: cy + hPx / 2,
    };
    if (boxes.some((b) => overlaps(b, box))) continue;
    if (view) {
      const vx0 = view.center.x * scale - view.width / 2,
        vy0 = -view.center.y * scale - view.height / 2;
      if (
        box.x1 < vx0 ||
        box.x0 > vx0 + view.width ||
        box.y1 < vy0 ||
        box.y0 > vy0 + view.height
      )
        continue;
    }
    boxes.push(box);
    placed.push({
      id: r.id,
      text,
      x: r.labelAnchor.x,
      y: r.labelAnchor.y,
      size,
      weight: r.kind === 'room' || r.kind === 'stairs' ? '600' : '500',
      muted: r.kind === 'circulation' || r.kind === 'outdoor',
      icon: r.category && r.category !== 'room' ? r.category : null,
    });
  }
  return placed;
}
