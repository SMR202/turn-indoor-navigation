import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleVenue, parseVenuePackage } from '@turn/venue-model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = resolve(root, 'work/private/venue.json');
const target = resolve(root, 'apps/mobile/src/config/venue.generated.json');
let venue = sampleVenue;
const source = process.argv[2] ? resolve(process.argv[2]) : local;
try {
  venue = parseVenuePackage(JSON.parse(await readFile(source, 'utf8')));
} catch (error) {
  if (process.argv[2] || error.code !== 'ENOENT') throw error;
}
if (process.argv[2]) {
  await mkdir(dirname(local), { recursive: true });
  await writeFile(local, JSON.stringify(venue, null, 2));
}
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(venue, null, 2) + '\n');
console.log(
  `Bundled ${venue.name} (${venue.venueId}@${venue.revision}); private venue files remain Git-ignored.`,
);
