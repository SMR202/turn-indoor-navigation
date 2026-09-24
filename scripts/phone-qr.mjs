import QRCode from 'qrcode';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { sampleVenue } from '@turn/venue-model';
import { anchorPayload } from '@turn/positioning-core';

const url = new URL(process.argv[2] ?? '');
if (
  !['exp:', 'exps:'].includes(url.protocol) ||
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
)
  throw new Error('Supply the verified Expo LAN/tunnel URL, not localhost.');
const directory = resolve('work/phone-test');
await mkdir(directory, { recursive: true });
for (const [name, content] of [
  ['expo-launch', url.href],
  ...sampleVenue.anchors.map((a) => [a.id, anchorPayload(sampleVenue, a.id)]),
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
console.log(`Expo launch: ${url.href}\nQR images: ${directory}`);
