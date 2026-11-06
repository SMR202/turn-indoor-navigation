// Copies what web maps load at run time into each web app's public folder (Git-ignored copies):
// MapLibre's worker (browsers only start same-origin workers) and the map's glyphs and icons (so a
// web map works without the TURN server). Runs after `npm install`.
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const worker = resolve(
  root,
  'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
);
const assets = resolve(root, 'packages/map-scene/assets');
for (const app of ['apps/navigator', 'apps/console']) {
  const pub = resolve(root, app, 'public');
  if (existsSync(worker)) {
    mkdirSync(join(pub, 'maplibre'), { recursive: true });
    cpSync(worker, join(pub, 'maplibre', 'maplibre-gl-worker.mjs'));
  }
  mkdirSync(join(pub, 'map'), { recursive: true });
  cpSync(join(assets, 'glyphs'), join(pub, 'map', 'glyphs'), {
    recursive: true,
  });
  // Served without the @2x suffix, as the TURN server does.
  mkdirSync(join(pub, 'map', 'icons'), { recursive: true });
  for (const f of readdirSync(join(assets, 'icons')))
    copyFileSync(
      join(assets, 'icons', f),
      join(pub, 'map', 'icons', f.replace('@2x', '')),
    );
}
console.log('Web map assets copied (MapLibre worker, glyphs, icons).');
