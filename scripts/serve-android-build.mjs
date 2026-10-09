import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

// Serve only this debug APK, never a workspace directory or private recordings.
const apk = resolve(
  'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk',
);
const size = (await stat(apk)).size;
const host =
  process.env.TURN_LAN_IP ??
  Object.values(networkInterfaces())
    .flat()
    .find(
      (n) =>
        n?.family === 'IPv4' &&
        !n.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
    )?.address;
if (!host)
  throw new Error('Set TURN_LAN_IP to your computer’s LAN IPv4 address.');
const url = `http://${host}:8084/turn-dev.apk`;
await mkdir('work/phone-test', { recursive: true });
await QRCode.toFile('work/phone-test/android-install.png', url, {
  width: 420,
  margin: 4,
});
const server = createServer((req, res) => {
  if (req.url !== '/turn-dev.apk' || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Disposition': 'attachment; filename="turn-dev.apk"',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') res.end();
  else
    createReadStream(apk)
      .on('error', () => res.destroy())
      .pipe(res);
});
server.listen(8084, host, () =>
  console.log(
    `TURN Android debug APK: ${url}\nKeep this terminal and phone:tests running. QR: work/phone-test/android-install.png`,
  ),
);
server.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
