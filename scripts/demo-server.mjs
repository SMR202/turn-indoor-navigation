// Runs a phone demo from this computer: the TURN API (port 8090) and the visitor app's
// production-mode server (port 8081) for the installed TURN development build. Both phone bundles
// are built before the launch QR is shown, so the first scan opens in seconds. Ctrl+C stops both.
//
//   npm run demo                         (uses this computer's network address)
//   npm run demo -- --host 192.168.137.1 (another address, for example a hotspot)
//   npm run demo -- --no-open            (do not open the QR image)
//
// Phones must join the same network as this computer. Logs: work/demo/api.log, work/demo/metro.log.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'work/demo');
mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const windows = process.platform === 'win32';

// Private IPv4 addresses, skipping virtual adapters that phones can never reach.
const addresses = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
  (list ?? [])
    .filter(
      (n) =>
        n.family === 'IPv4' &&
        !n.internal &&
        /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address) &&
        !/vEthernet|VirtualBox|VMware|WSL|Hyper-V|Docker|Loopback/i.test(name),
    )
    .map((n) => ({ name, address: n.address })),
);
// A Windows Mobile Hotspot is always 192.168.137.1; prefer it, since phones join it directly.
const host =
  option('--host') ??
  addresses.find((a) => a.address === '192.168.137.1')?.address ??
  addresses[0]?.address;
if (!host) {
  console.error(
    'No network address. Join a Wi-Fi network or turn on Mobile Hotspot, then run again.',
  );
  process.exit(1);
}

async function up(url, ms = 1500) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

const listening = (port) =>
  fetch(`http://localhost:${port}/`, {
    signal: AbortSignal.timeout(1500),
  }).then(
    () => true,
    () => false,
  );
for (const [port, what] of [
  [8090, 'TURN API'],
  [8081, 'phone server'],
])
  if (await listening(port)) {
    console.error(
      `Port ${port} (${what}) is already in use. Close the other TURN window first.`,
    );
    process.exit(1);
  }

const children = [];
function start(name, command, env = process.env) {
  const log = openSync(resolve(outDir, `${name}.log`), 'w');
  const child = spawn(command, {
    cwd: root,
    env,
    shell: true,
    stdio: ['ignore', log, log],
  });
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(
        `${name} stopped (exit ${code}). See work/demo/${name}.log.`,
      );
      stop(1);
    }
  });
  children.push(child);
}
let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const c of children)
    if (c.pid)
      if (windows)
        spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], {
          stdio: 'ignore',
        });
      else c.kill('SIGTERM');
  process.exit(code);
}
process.on('SIGINT', () => stop(0));

// Expo checks package versions online; without internet it must start offline.
const online = (await up('https://api.expo.dev/', 4000)) !== null;
const metroEnv = { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: host };
delete metroEnv.CI;
start('api', 'npm run api');
start(
  'metro',
  `npx expo start apps/navigator --port 8081 --dev-client --no-dev --minify${online ? '' : ' --offline'}`,
  metroEnv,
);
console.log(
  `Starting on ${host}${online ? '' : ' (offline)'}${
    addresses.length > 1
      ? `; other addresses: ${addresses
          .filter((a) => a.address !== host)
          .map((a) => `${a.address} (${a.name})`)
          .join(', ')}`
      : ''
  }`,
);

async function waitFor(url, test, seconds) {
  for (let i = 0; i < seconds; i++) {
    const body = await up(url);
    if (body !== null && test(body)) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}
if (!(await waitFor('http://localhost:8090/health', () => true, 60))) {
  console.error('The TURN API did not start. See work/demo/api.log.');
  stop(1);
}
const venues = JSON.parse(
  (await up('http://localhost:8090/public/venues', 5000)) ?? '[]',
);
// Floors of one building share a name prefix ("Campus - C-F4"); list them once.
const groups = new Map();
for (const v of venues) {
  const name = v.name.split(' - ')[0];
  groups.set(name, (groups.get(name) ?? 0) + 1);
}
console.log(
  `TURN API ready: ${venues.length} venues (${[...groups].map(([n, k]) => (k > 1 ? `${n} × ${k} floors` : n)).join(', ')})`,
);
if (
  !(await waitFor(
    'http://localhost:8081/status',
    (b) => b.includes('running'),
    180,
  ))
) {
  console.error('The phone server did not start. See work/demo/metro.log.');
  stop(1);
}

// Build each phone bundle once now (a cold build takes about two minutes).
for (const platform of ['ios', 'android']) {
  const t0 = Date.now();
  process.stdout.write(`Building the ${platform} bundle… `);
  try {
    const manifest = await (
      await fetch(`http://${host}:8081/`, {
        headers: {
          'expo-platform': platform,
          accept: 'application/expo+json,application/json',
        },
        signal: AbortSignal.timeout(30_000),
      })
    ).json();
    const bundle = await fetch(manifest.launchAsset.url, {
      signal: AbortSignal.timeout(400_000),
    });
    const size = (await bundle.arrayBuffer()).byteLength;
    if (!bundle.ok) throw new Error(`HTTP ${bundle.status}`);
    console.log(
      `${(size / 1e6).toFixed(1)} MB in ${Math.round((Date.now() - t0) / 1000)} s`,
    );
  } catch (e) {
    console.log(
      `failed (${e instanceof Error ? e.message : e}); see work/demo/metro.log`,
    );
  }
}

const launch = `exp+turn-indoor-navigation://expo-development-client/?url=${encodeURIComponent(`http://${host}:8081`)}`;
const png = resolve(outDir, 'expo-launch-qr.png');
await QRCode.toFile(png, launch, { width: 480, margin: 4 });
console.log(await QRCode.toString(launch, { type: 'terminal', small: true }));
console.log(`EXPO LAUNCH QR (opens the TURN app; not a TURN location code)
  ${launch}
  Image: ${png}
  Phones: join the same network as this computer, then scan with the iPhone Camera, or in the
  TURN app's development menu on Android. If the app says it cannot connect, allow Node.js in
  Windows Firewall on private AND public networks.

Ready. Keep this window open during the demo; press Ctrl+C to stop.`);
if (!args.includes('--no-open'))
  spawn(windows ? `start "" "${png}"` : `open "${png}"`, {
    shell: true,
    stdio: 'ignore',
  });
