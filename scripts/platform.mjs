// Starts the TURN platform for local testing: API (8090), TURN Studio/Ops console (5173) and the
// visitor app's Metro server (8082, for the installed TURN dev build and the web build). Prints the
// LAN addresses and a phone launch QR. Ctrl+C stops everything.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lan =
  Object.values(networkInterfaces())
    .flat()
    .find(
      (n) =>
        n &&
        n.family === 'IPv4' &&
        !n.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
    )?.address ?? 'localhost';

const services = [
  { name: 'api', color: 36, cmd: 'npm run api' },
  { name: 'studio', color: 35, cmd: 'npm run console' },
  {
    name: 'app',
    color: 34,
    cmd: 'npx expo start apps/navigator --port 8082 --dev-client',
  },
];
// Expo treats any CI value as a boolean, so the variable is removed rather than left empty.
const env = { ...process.env, FORCE_COLOR: '1' };
delete env.CI;
const children = services.map((s) => {
  const child = spawn(s.cmd, { cwd: root, shell: true, env });
  const tag = `\x1b[${s.color}m${s.name.padEnd(6)}\x1b[0m│ `;
  const relay = (data) =>
    process.stdout.write(
      data
        .toString()
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => tag + l)
        .join('\n') + '\n',
    );
  child.stdout.on('data', relay);
  child.stderr.on('data', relay);
  child.on('exit', (code) => relay(`exited (${code})`));
  return child;
});

const launch = `exp+turn-indoor-navigation://expo-development-client/?url=${encodeURIComponent(`http://${lan}:8082`)}`;
mkdirSync(resolve(root, 'work'), { recursive: true });
await QRCode.toFile(resolve(root, 'work/navigator-phone-qr.png'), launch, {
  width: 460,
  margin: 2,
});
console.log(`
TURN platform (local network ${lan})
  Studio / Ops   http://${lan}:5173   (dev sign-in: owner@harbour.demo, ops@turn.local)
  API            http://${lan}:8090
  TURN Lite web  http://${lan}:8082   (phone browser on the same Wi-Fi)
  TURN app       scan the Expo launch QR below with the installed TURN dev build
                 (saved as work/navigator-phone-qr.png; not a TURN location marker)
`);
console.log(await QRCode.toString(launch, { type: 'terminal', small: true }));

const stop = () => {
  for (const c of children) {
    if (process.platform === 'win32' && c.pid)
      spawn('taskkill', ['/pid', String(c.pid), '/T', '/F']);
    else c.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 500);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
