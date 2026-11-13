// Builds the map's place-category badges (PNG) from the app's icon paths, so map icons match the
// rest of TURN's interface. Output: packages/map-scene/assets/icons/cat-<category>@2x.png (96 px, drawn at 48).
//
//   npm run map:icons
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  categoryColors,
  placeCategories,
} from '../packages/design/src/tokens.ts';
import { ICON_PATHS } from '../packages/map-scene/src/icons.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'packages/map-scene/assets/icons');
mkdirSync(out, { recursive: true });

const SIZE = 96;
let n = 0;
for (const [category, { icon }] of Object.entries(placeCategories)) {
  const paths = (ICON_PATHS[icon] ?? ICON_PATHS.pin ?? [])
    .map((d) => `<path d="${d}"/>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <circle cx="48" cy="50" r="40" fill="#000" opacity="0.18"/>
  <circle cx="48" cy="47" r="40" fill="#fff"/>
  <circle cx="48" cy="47" r="34" fill="${categoryColors[category]}"/>
  <g transform="translate(26 25) scale(1.833)" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>
</svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(out, `cat-${category}@2x.png`));
  n++;
}
// The chevron drawn along a route (points along the line, +x): white with a soft dark edge so it
// reads on the accent line in both themes.
const arrow = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M17 11 L31 24 L17 37" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await sharp(Buffer.from(arrow)).png().toFile(join(out, 'route-arrow@2x.png'));
// The destination pin (drawn at 36 x 44): dark with a white edge, so it reads on both themes and
// beside any venue accent colour.
const pin = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="88" viewBox="0 0 72 88">
  <ellipse cx="36" cy="82" rx="9" ry="3.2" fill="#000" opacity="0.22"/>
  <path d="M36 80 C36 80 11 53 11 33 a25 25 0 1 1 50 0 C61 53 36 80 36 80 Z" fill="#0B1220" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="36" cy="33" r="9.5" fill="#fff"/>
</svg>`;
await sharp(Buffer.from(pin)).png().toFile(join(out, 'pin-dest@2x.png'));
console.log(`${n} category badges, the route arrow and the pin in ${out}`);
