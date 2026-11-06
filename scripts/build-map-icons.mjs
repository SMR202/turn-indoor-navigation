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
console.log(`${n} category badges in ${out}`);
