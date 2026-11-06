// Builds the map's label glyphs (MapLibre signed-distance-field PBF files) from the Inter fonts the
// app already ships, so map labels need no font server and work offline.
//
//   npm run map:glyphs
//
// Output: packages/map-scene/assets/glyphs/<Font stack>/<start>-<end>.pbf, the layout MapLibre
// fetches from a `glyphs` URL template. Glyph metrics follow MapLibre's 24 px SDF convention
// (buffer 3 px, radius 8, cutoff 0.25), the same as its local TinySDF glyphs.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import { PbfWriter } from 'pbf';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const inter = resolve(root, 'node_modules/@expo-google-fonts/inter');
const out = resolve(root, 'packages/map-scene/assets/glyphs');
const FONTS = [
  ['Inter Regular', '400Regular/Inter_400Regular.ttf'],
  ['Inter SemiBold', '600SemiBold/Inter_600SemiBold.ttf'],
  ['Inter Bold', '700Bold/Inter_700Bold.ttf'],
];
// Latin, Latin Extended-A and general punctuation (’ “ ” – — …).
const RANGES = [0, 256, 8192];
const SIZE = 24;
const BUFFER = 3;
const RADIUS = 8;
const CUTOFF = 0.25;
const SUPERSAMPLE = 4;
const INF = 1e20;

/** Flattens an opentype path (pixel units, y down) into closed polygons. */
function polygons(path) {
  const rings = [];
  let ring = [];
  let x = 0;
  let y = 0;
  const steps = 8;
  for (const c of path.commands) {
    if (c.type === 'M') {
      if (ring.length) rings.push(ring);
      ring = [[c.x, c.y]];
    } else if (c.type === 'L') ring.push([c.x, c.y]);
    else if (c.type === 'Q')
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        ring.push([
          u * u * x + 2 * u * t * c.x1 + t * t * c.x,
          u * u * y + 2 * u * t * c.y1 + t * t * c.y,
        ]);
      }
    else if (c.type === 'C')
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const u = 1 - t;
        ring.push([
          u * u * u * x +
            3 * u * u * t * c.x1 +
            3 * u * t * t * c.x2 +
            t * t * t * c.x,
          u * u * u * y +
            3 * u * u * t * c.y1 +
            3 * u * t * t * c.y2 +
            t * t * t * c.y,
        ]);
      }
    else if (c.type === 'Z') {
      if (ring.length) rings.push(ring);
      ring = [];
      continue;
    }
    x = c.x;
    y = c.y;
  }
  if (ring.length) rings.push(ring);
  return rings;
}

/** Coverage (0–1) of each pixel of a w×h grid whose origin is at (ox, oy), non-zero winding. */
function rasterize(rings, ox, oy, w, h) {
  const alpha = new Float32Array(w * h);
  const edges = [];
  for (const r of rings)
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      if (a[1] !== b[1]) edges.push(a[1] < b[1] ? [a, b, 1] : [b, a, -1]);
    }
  const n = SUPERSAMPLE;
  for (let py = 0; py < h; py++)
    for (let sy = 0; sy < n; sy++) {
      const y = oy + py + (sy + 0.5) / n;
      const xs = [];
      for (const [a, b, dir] of edges)
        if (y >= a[1] && y < b[1])
          xs.push([a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]), dir]);
      xs.sort((p, q) => p[0] - q[0]);
      let wind = 0;
      for (let i = 0; i < xs.length - 1; i++) {
        wind += xs[i][1];
        if (!wind) continue;
        // Span [x0, x1) is inside: add coverage of each sub-sample column.
        const x0 = xs[i][0] - ox;
        const x1 = xs[i + 1][0] - ox;
        for (
          let px = Math.max(0, Math.floor(x0));
          px < Math.min(w, Math.ceil(x1));
          px++
        )
          for (let sx = 0; sx < n; sx++) {
            const x = px + (sx + 0.5) / n;
            if (x >= x0 && x < x1) alpha[py * w + px] += 1 / (n * n);
          }
      }
    }
  return alpha;
}

// Felzenszwalb–Huttenlocher squared distance transform (as in MapLibre's TinySDF).
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  f[0] = grid[offset];
  for (let q = 1, k = 0, s; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k];
    const qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(data, x0, y0, width, height, gridSize) {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const v = new Uint16Array(n);
  const z = new Float64Array(n + 1);
  for (let x = x0; x < x0 + width; x++)
    edt1d(data, y0 * gridSize + x, gridSize, height, f, v, z);
  for (let y = y0; y < y0 + height; y++)
    edt1d(data, y * gridSize + x0, 1, width, f, v, z);
}

function glyph(font, code) {
  const scale = SIZE / font.unitsPerEm;
  const g = font.charToGlyph(String.fromCodePoint(code));
  if (!g || (g.index === 0 && code !== 0)) return null;
  const advance = Math.round(g.advanceWidth * scale);
  const path = g.getPath(0, 0, SIZE);
  const bb = path.getBoundingBox();
  const empty = !isFinite(bb.x1) || bb.x2 <= bb.x1 || bb.y2 <= bb.y1;
  if (empty)
    return { id: code, width: 0, height: 0, left: 0, top: -26, advance };
  // Pixel box around the outline: path y grows downwards, baseline at y = 0.
  const left = Math.floor(bb.x1);
  const ascent = Math.ceil(-bb.y1);
  const width = Math.ceil(bb.x2) - left;
  const height = ascent + Math.ceil(bb.y2);
  const w = width + 2 * BUFFER;
  const h = height + 2 * BUFFER;
  const alpha = rasterize(
    polygons(path),
    left - BUFFER,
    -ascent - BUFFER,
    w,
    h,
  );
  const outer = new Float64Array(w * h).fill(INF);
  const inner = new Float64Array(w * h).fill(0);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, alpha[i]);
    if (a === 0) continue;
    if (a >= 0.999) {
      outer[i] = 0;
      inner[i] = INF;
    } else {
      const d = 0.5 - a;
      outer[i] = d > 0 ? d * d : 0;
      inner[i] = d < 0 ? d * d : 0;
    }
  }
  edt(outer, 0, 0, w, h, w);
  edt(inner, BUFFER, BUFFER, width, height, w);
  const bitmap = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
    bitmap[i] = Math.max(
      0,
      Math.min(255, Math.round(255 - 255 * (d / RADIUS + CUTOFF))),
    );
  }
  // MapLibre places a glyph `top` pixels relative to a 24 px line box (see its TinySDF glyphs).
  return { id: code, bitmap, width, height, left, top: ascent - 27, advance };
}

function encode(name, start, glyphs) {
  const pbf = new PbfWriter();
  pbf.writeMessage(1, (_, p) => {
    p.writeStringField(1, name);
    p.writeStringField(2, `${start}-${start + 255}`);
    for (const g of glyphs)
      p.writeMessage(3, (_, q) => {
        q.writeVarintField(1, g.id);
        if (g.bitmap) q.writeBytesField(2, g.bitmap);
        q.writeVarintField(3, g.width);
        q.writeVarintField(4, g.height);
        q.writeSVarintField(5, g.left);
        q.writeSVarintField(6, g.top);
        q.writeVarintField(7, g.advance);
      });
  });
  return pbf.finish();
}

let files = 0;
for (const [name, file] of FONTS) {
  const font = opentype.parse(readFileSync(join(inter, file)).buffer);
  const dir = join(out, name);
  mkdirSync(dir, { recursive: true });
  for (const start of RANGES) {
    const glyphs = [];
    for (let code = start; code < start + 256; code++) {
      const g = glyph(font, code);
      if (g) glyphs.push(g);
    }
    writeFileSync(
      join(dir, `${start}-${start + 255}.pbf`),
      encode(name, start, glyphs),
    );
    files++;
  }
}
copyFileSync(join(inter, 'LICENSE_FONT'), join(out, 'OFL.txt'));
console.log(`${files} glyph files in ${out} (Inter, SIL Open Font License).`);
