// Adds private venue packages (for example TURN-Mapper exports) to this computer's TURN server
// without replacing the home venue: each package is validated and stored as
// work/private/venues/<venueId>.json (Git-ignored); the API loads every file there on start.
//
//   npm run venue:add -- <venue.package.json | folder> [...]
//   (a folder is searched for floors/*/venue.package.json, else for any venue.package.json)
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculateRoute } from '@turn/routing';
import { parseVenuePackage, wallCrossings } from '@turn/venue-model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'work/private/venues');

async function findPackages(path) {
  const full = resolve(path);
  if (full.endsWith('.json')) return [full];
  const floors = join(full, 'floors');
  if (existsSync(floors)) {
    const out = [];
    for (const d of (await readdir(floors)).sort()) {
      const f = join(floors, d, 'venue.package.json');
      if (existsSync(f)) out.push(f);
    }
    return out;
  }
  const out = [];
  for (const entry of await readdir(full, { withFileTypes: true }))
    if (entry.isDirectory())
      out.push(...(await findPackages(join(full, entry.name))));
    else if (entry.name === 'venue.package.json')
      out.push(join(full, entry.name));
  return out;
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error(
    'Usage: npm run venue:add -- <venue.package.json | folder> [...]',
  );
  process.exit(1);
}
const files = (await Promise.all(args.map(findPackages))).flat();
await mkdir(outDir, { recursive: true });
let failed = 0;
for (const file of files) {
  try {
    const venue = parseVenuePackage(JSON.parse(await readFile(file, 'utf8')));
    const crossings = wallCrossings(venue);
    if (crossings.length)
      throw new Error(
        `graph crosses walls: ${crossings.slice(0, 3).join(', ')}`,
      );
    let routes = 0;
    for (const anchor of venue.anchors)
      for (const poi of venue.pois) {
        if (calculateRoute(venue, anchor.nodeId, poi.nodeId).status !== 'ok')
          throw new Error(`no route from ${anchor.id} to ${poi.id}`);
        routes++;
      }
    await writeFile(
      join(outDir, `${venue.venueId}.json`),
      JSON.stringify(venue) + '\n',
    );
    const scale = (venue.provenance?.notes ?? []).join('; ');
    console.log(
      `added ${venue.venueId} (${venue.name}, ${venue.floors.length} floor, ${venue.pois.length} places, ${routes} routes checked)${scale ? ` · ${scale}` : ''}`,
    );
  } catch (e) {
    failed++;
    console.error(
      `skipped ${basename(dirname(file))}/${basename(file)}: ${e instanceof Error ? e.message : e}`,
    );
  }
}
console.log(
  `${files.length - failed} of ${files.length} venues stored in work/private/venues (Git-ignored). Restart the TURN API to serve them.`,
);
process.exit(failed ? 1 : 0);
