import type { P, Scene } from './scene';

export type PlacedLabel = {
  id: string;
  text: string;
  /** One or two lines; long names wrap when the room is tall enough. */
  lines: string[];
  /** Map coordinates of the label centre. */
  x: number;
  y: number;
  /** Font size in screen pixels. */
  size: number;
  weight: '500' | '600';
  muted: boolean;
  icon: string | null;
  /** True when only the category icon fits (the name appears when zooming in). */
  iconOnly: boolean;
};

type Box = { x0: number; y0: number; x1: number; y1: number };
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const CHAR = 0.56; // average Inter glyph width in em

/** Splits a name into two balanced lines at a space, or returns it unchanged. */
export function wrapLabel(text: string): string[] {
  // Separators such as '·' never start or end a wrapped line.
  const words = text.split(' ');
  if (words.length < 2) return [text];
  let best: string[] = [text];
  let bestWidth = Infinity;
  for (let i = 1; i < words.length; i++) {
    const sep = /^[·•|–-]$/;
    if (sep.test(words[i]!) && i + 1 < words.length) continue;
    const a = words
        .slice(0, i)
        .filter((w, j, all) => !(j === all.length - 1 && sep.test(w)))
        .join(' '),
      b = words.slice(sep.test(words[i]!) ? i + 1 : i).join(' ');
    const w = Math.max(a.length, b.length);
    if (w < bestWidth) {
      bestWidth = w;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Chooses which room labels to show at a zoom level, like a maps app: most important first, never
 * overlapping, and only when the room is big enough on screen to hold the text (on one or two
 * lines). Destinations whose name does not fit still show their category icon.
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
  const icon = 20;
  const tryPlace = (cx: number, cy: number, w: number, h: number) => {
    const box = {
      x0: cx - w / 2,
      y0: cy - h / 2,
      x1: cx + w / 2,
      y1: cy + h / 2,
    };
    if (boxes.some((b) => overlaps(b, box))) return false;
    if (view) {
      const vx0 = view.center.x * scale - view.width / 2,
        vy0 = -view.center.y * scale - view.height / 2;
      if (
        box.x1 < vx0 ||
        box.x0 > vx0 + view.width ||
        box.y1 < vy0 ||
        box.y0 > vy0 + view.height
      )
        return false;
    }
    boxes.push(box);
    return true;
  };
  for (const r of rooms) {
    const muted = r.kind === 'circulation' || r.kind === 'outdoor';
    const fontSize = muted ? size - 2 : size;
    const hasIcon = Boolean(r.category && r.category !== 'room');
    const xs = r.polygon.map((p) => p.x),
      ys = r.polygon.map((p) => p.y);
    const roomW = (Math.max(...xs) - Math.min(...xs)) * scale;
    const roomH = (Math.max(...ys) - Math.min(...ys)) * scale;
    const cx = r.labelAnchor.x * scale,
      cy = -r.labelAnchor.y * scale;
    const candidates: string[][] = [[r.name]];
    const wrapped = wrapLabel(r.name);
    if (!muted && wrapped.length === 2) candidates.push(wrapped);
    let done = false;
    for (const lines of candidates) {
      if (done) break;
      const w = Math.max(...lines.map((l) => l.length)) * fontSize * CHAR + 6;
      const h = lines.length * fontSize * 1.25 + (hasIcon ? icon + 2 : 0);
      if (roomW < w * 0.92 || roomH < h) continue;
      if (!tryPlace(cx, cy, Math.max(w, hasIcon ? icon : 0), h)) continue;
      placed.push({
        id: r.id,
        text: r.name,
        lines,
        x: r.labelAnchor.x,
        y: r.labelAnchor.y,
        size,
        weight: r.kind === 'room' || r.kind === 'stairs' ? '600' : '500',
        muted,
        icon: hasIcon ? r.category : null,
        iconOnly: false,
      });
      done = true;
    }
    if (
      !done &&
      hasIcon &&
      roomW >= icon &&
      roomH >= icon &&
      tryPlace(cx, cy, icon + 4, icon + 4)
    )
      placed.push({
        id: r.id,
        text: r.name,
        lines: [],
        x: r.labelAnchor.x,
        y: r.labelAnchor.y,
        size,
        weight: '600',
        muted: false,
        icon: r.category,
        iconOnly: true,
      });
  }
  return placed;
}
