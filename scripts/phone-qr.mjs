import QRCode from 'qrcode';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseVenuePackage } from '@turn/venue-model';
import { anchorPayload } from '@turn/positioning-core';

const url = new URL(process.argv[2] ?? '');
const venue = parseVenuePackage(
  JSON.parse(
    await readFile('apps/mobile/src/config/venue.generated.json', 'utf8'),
  ),
);
if (venue.anchors.some((a) => !/^[a-zA-Z0-9_-]+$/.test(a.id)))
  throw new Error('Marker IDs must be safe filename components.');
if (
  !['exp:', 'exps:'].includes(url.protocol) ||
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
)
  throw new Error('Supply the verified Expo LAN/tunnel URL, not localhost.');
const directory = resolve('work/phone-test');
await mkdir(directory, { recursive: true });
for (const [name, content] of [
  ['expo-launch', url.href],
  ...venue.anchors.map((a) => [a.id, anchorPayload(venue, a.id)]),
]) {
  await QRCode.toFile(resolve(directory, `${name}.png`), content, {
    width: 420,
    margin: 4,
    errorCorrectionLevel: 'M',
  });
}
await writeFile(
  resolve(directory, 'connection.txt'),
  `${url.href}\nGenerated ${new Date().toISOString()}\nKeep Expo running; phone and computer must share reachable LAN for LAN URLs.\n`,
);
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
await writeFile(
  resolve(directory, 'location-markers.html'),
  `<!doctype html><meta charset="utf-8"><title>TURN location markers</title><style>body{font:18px system-ui;margin:32px;color:#183d34}main{display:flex;flex-wrap:wrap;gap:24px}article{break-inside:avoid;border:1px solid #ddd;padding:20px;text-align:center}img{width:280px;height:280px}small{display:block;max-width:280px}</style><h1>${escape(venue.name)} · location markers</h1><p>Scan these inside TURN. Place each at its named, measured start. These are not Expo launch codes.</p><main>${venue.anchors.map((a) => `<article><h2>${escape(a.label)}</h2><img src="${escape(a.id)}.png" alt="Location QR"><small>${escape(venue.revision)} · ${escape(a.id)}</small></article>`).join('')}</main>`,
);
console.log(`Expo launch: ${url.href}\nQR images: ${directory}`);
