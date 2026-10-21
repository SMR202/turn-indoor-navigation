// Remote screenshots and touches on the test phones from this computer, so a developer (or an
// agent) can see and drive TURN on real devices. iPhone: go-ios + WebDriverAgent (iOS 17+ through
// go-ios's userspace tunnel); Android: adb (USB, emulator or wireless debugging).
//
//   npm run phone -- ios start              tunnel, developer image, WebDriverAgent, port 8100
//   npm run phone -- ios|android shot [file]  screenshot (default work/phone-shots/<os>-<time>.png)
//   npm run phone -- ios|android tap X Y      tap at screenshot pixel X,Y
//   npm run phone -- ios|android swipe X1 Y1 X2 Y2 [ms]
//   npm run phone -- ios pinch X Y SCALE [ms]    two-finger zoom around X,Y (SCALE > 1 zooms in)
//   npm run phone -- ios|android home | launch [bundle/package] | status
//
// Tools are not in Git: go-ios in work/tools/go-ios/bin (IOS_BIN overrides), WebDriverAgent
// sideloaded as com.smr202.turnwda.xctrunner[.team] (WDA_BUNDLE overrides the prefix), adb from the
// Android SDK (ADB overrides). See docs/PHONE_REMOTE.md.
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IOS =
  process.env.IOS_BIN ?? resolve(root, 'work/tools/go-ios/bin/ios.exe');
// Sideloadly appends the signing team to bundle ids (com.turn.navigation.dev.UZPRC7UX69), so
// installed apps are found by prefix.
const WDA_PREFIX = process.env.WDA_BUNDLE ?? 'com.smr202.turnwda.xctrunner';
// WebDriverAgent listens on the iPhone's Wi-Fi address too: `ios start` saves it, so commands work
// over the cable's port forward or, unplugged, straight over Wi-Fi (IPHONE_WDA overrides).
const WDA_USB = 'http://127.0.0.1:8100';
const WIFI_FILE = resolve(root, 'work/tools/iphone-wda-url.txt');
let WDA = WDA_USB;
async function pickWda() {
  const candidates = [
    process.env.IPHONE_WDA,
    WDA_USB,
    existsSync(WIFI_FILE) ? readFileSync(WIFI_FILE, 'utf8').trim() : null,
  ].filter(Boolean);
  for (const url of candidates)
    try {
      const r = await fetch(`${url}/status`, {
        signal: AbortSignal.timeout(2500),
      });
      if (r.ok) return (WDA = url);
    } catch {
      // try the next route
    }
  return WDA;
}
const ADB =
  process.env.ADB ??
  resolve(process.env.LOCALAPPDATA ?? '', 'Android/Sdk/platform-tools/adb.exe');
const TURN_APP = {
  ios: 'com.turn.navigation.dev',
  android: 'com.turn.navigation.dev',
};
const logs = resolve(root, 'work/tools/logs');

const [os, cmd, ...args] = process.argv.slice(2);
const num = (i) => {
  const v = Number(args[i]);
  if (!Number.isFinite(v))
    throw new Error(`Argument ${i + 1} must be a number.`);
  return v;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- iPhone (go-ios + WebDriverAgent) ------------------------------------------------------
function ios(...a) {
  const r = spawnSync(IOS, a, { encoding: 'utf8' });
  return (r.stdout ?? '') + (r.stderr ?? '');
}
/** Installed iPhone app whose bundle id is `prefix` or `prefix.<team>`. */
function iosApp(prefix) {
  const r = spawnSync(IOS, ['apps'], { encoding: 'utf8' });
  try {
    const j = JSON.parse((r.stdout ?? '').trim().split('\n').pop() ?? '[]');
    const ids = (Array.isArray(j) ? j : (j.apps ?? [])).map(
      (a) => a.CFBundleIdentifier ?? a,
    );
    return (
      ids.find((id) => id === prefix || id.startsWith(`${prefix}.`)) ?? null
    );
  } catch {
    return null;
  }
}
/** Long-running go-ios command, detached, output in work/tools/logs/<name>.log. */
function iosDetached(name, ...a) {
  mkdirSync(logs, { recursive: true });
  const out = openSync(resolve(logs, `${name}.log`), 'a');
  spawn(IOS, a, { detached: true, stdio: ['ignore', out, out] }).unref();
}
async function wda(path, body) {
  const res = await fetch(WDA + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const j = await res.json();
  if (j.value?.error) throw new Error(`${j.value.error}: ${j.value.message}`);
  return j;
}
let session = null;
async function iosSession() {
  if (session) return session;
  const s = await wda('/session', { capabilities: { alwaysMatch: {} } });
  session = s.sessionId ?? s.value?.sessionId;
  return session;
}
/** Screenshot pixels per WebDriverAgent point (3 on an iPhone 15 Pro). */
async function iosScale() {
  const sid = await iosSession();
  const size = (await wda(`/session/${sid}/window/size`)).value;
  const shot = Buffer.from((await wda('/screenshot')).value, 'base64');
  const width = shot.readUInt32BE(16); // PNG IHDR
  return width / size.width;
}
async function iosPointer(points, holdMs) {
  const sid = await iosSession();
  const k = await iosScale();
  const [first, ...rest] = points;
  const actions = [
    {
      type: 'pointerMove',
      duration: 0,
      x: Math.round(first.x / k),
      y: Math.round(first.y / k),
    },
    { type: 'pointerDown', button: 0 },
    { type: 'pause', duration: holdMs },
    ...rest.map((p) => ({
      type: 'pointerMove',
      duration: p.ms,
      x: Math.round(p.x / k),
      y: Math.round(p.y / k),
    })),
    { type: 'pointerUp', button: 0 },
  ];
  await wda(`/session/${sid}/actions`, {
    actions: [
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions,
      },
    ],
  });
}
/** Two fingers from `r` pixels either side of (x, y) to `r * scale`: zoom in (> 1) or out. */
async function iosPinch(x, y, scale, ms) {
  const sid = await iosSession();
  const k = await iosScale();
  const r0 = 120,
    r1 = Math.max(20, 120 * scale);
  const finger = (id, dir) => ({
    type: 'pointer',
    id,
    parameters: { pointerType: 'touch' },
    actions: [
      {
        type: 'pointerMove',
        duration: 0,
        x: Math.round((x + dir * r0) / k),
        y: Math.round(y / k),
      },
      { type: 'pointerDown', button: 0 },
      {
        type: 'pointerMove',
        duration: ms,
        x: Math.round((x + dir * r1) / k),
        y: Math.round(y / k),
      },
      { type: 'pointerUp', button: 0 },
    ],
  });
  await wda(`/session/${sid}/actions`, {
    actions: [finger('finger1', -1), finger('finger2', 1)],
  });
}
const iosCommands = {
  pinch: iosPinch,
  async start() {
    if (!existsSync(IOS)) throw new Error(`go-ios not found at ${IOS}.`);
    // iOS 17+: a userspace tunnel (USB or Wi-Fi) that the other commands use through go-ios's agent.
    const tunnels = () => {
      const out = spawnSync(IOS, ['tunnel', 'ls'], { encoding: 'utf8' }).stdout;
      try {
        return JSON.parse(out.trim().split('\n').pop() ?? '[]').length;
      } catch {
        return 0;
      }
    };
    if (!tunnels()) {
      iosDetached('ios-tunnel', 'tunnel', 'start', '--userspace');
      for (let i = 0; i < 20 && !tunnels(); i++) await sleep(1000);
      if (!tunnels())
        throw new Error(
          'No tunnel to the iPhone (USB, or Wi-Fi with "Show this iPhone when on Wi-Fi"); see work/tools/logs/ios-tunnel.log.',
        );
    }
    const mounted = ios('image', 'list');
    if (
      !/\.dmg|signature|"images":\[\{/i.test(mounted) ||
      /"none"/.test(mounted)
    ) {
      const r = ios(
        'image',
        'auto',
        `--basedir=${resolve(root, 'work/tools/go-ios/ddi')}`,
      );
      if (/ERROR/.test(r))
        throw new Error(
          `Developer image not mounted:\n${r
            .split('\n')
            .filter((l) => /ERROR/.test(l))
            .join('\n')}`,
        );
    }
    const wdaId = iosApp(WDA_PREFIX);
    if (!wdaId)
      throw new Error(
        'WebDriverAgent is not on the iPhone: sideload work/tools/wda/TURN-WDA-unsigned.ipa with Sideloadly.',
      );
    iosDetached(
      'ios-wda',
      'runwda',
      `--bundleid=${wdaId}`,
      `--testrunnerbundleid=${wdaId}`,
      '--xctestconfig=WebDriverAgentRunner.xctest',
    );
    iosDetached('ios-forward', 'forward', '8100', '8100');
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      try {
        const s = await wda('/status');
        const ip = s.value?.ios?.ip;
        if (ip) writeFileSync(WIFI_FILE, `http://${ip}:8100`);
        return console.log(
          `WebDriverAgent ready (${s.value?.os?.name ?? 'iOS'} ${s.value?.os?.version ?? ''}${ip ? `, also on Wi-Fi at ${ip}:8100` : ''}).`,
        );
      } catch {
        // still starting
      }
    }
    throw new Error(
      'WebDriverAgent did not answer on port 8100; see work/tools/logs/ios-wda.log.',
    );
  },
  async status() {
    console.log(JSON.stringify((await wda('/status')).value, null, 1));
  },
  async shot() {
    const png = Buffer.from((await wda('/screenshot')).value, 'base64');
    return png;
  },
  tap: (x, y) => iosPointer([{ x, y }], 60),
  swipe: (x1, y1, x2, y2, ms) =>
    iosPointer(
      [
        { x: x1, y: y1 },
        { x: x2, y: y2, ms },
      ],
      40,
    ),
  home: () => wda('/wda/homescreen', {}),
  async launch(bundle) {
    const sid = await iosSession();
    await wda(`/session/${sid}/wda/apps/launch`, {
      bundleId: bundle ?? iosApp(TURN_APP.ios) ?? TURN_APP.ios,
    });
  },
};

// ---- Android (adb) -----------------------------------------------------------------------------
function adb(...a) {
  const r = spawnSync(ADB, a, { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0)
    throw new Error(`adb ${a.join(' ')}: ${r.stderr?.toString() || r.error}`);
  return r.stdout;
}
const androidCommands = {
  async start() {
    console.log(adb('devices').toString());
  },
  async status() {
    console.log(adb('devices', '-l').toString());
  },
  async shot() {
    return adb('exec-out', 'screencap', '-p');
  },
  async tap(x, y) {
    adb('shell', 'input', 'tap', String(x), String(y));
  },
  async swipe(x1, y1, x2, y2, ms) {
    adb('shell', 'input', 'swipe', ...[x1, y1, x2, y2, ms].map(String));
  },
  async home() {
    adb('shell', 'input', 'keyevent', 'KEYCODE_HOME');
  },
  async launch(pkg) {
    adb(
      'shell',
      'monkey',
      '-p',
      pkg ?? TURN_APP.android,
      '-c',
      'android.intent.category.LAUNCHER',
      '1',
    );
  },
};

const table =
  os === 'ios' ? iosCommands : os === 'android' ? androidCommands : null;
if (!table || !table[cmd]) {
  console.log(
    'Usage: npm run phone -- <ios|android> <start|status|shot [file]|tap X Y|swipe X1 Y1 X2 Y2 [ms]|pinch X Y SCALE [ms] (iOS)|home|launch [id]>',
  );
  process.exit(1);
}
try {
  if (os === 'ios' && cmd !== 'start') await pickWda();
  if (cmd === 'shot') {
    const png = await table.shot();
    const file =
      args[0] ??
      resolve(
        root,
        'work/phone-shots',
        `${os}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
      );
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png);
    console.log(file);
  } else if (cmd === 'tap') await table.tap(num(0), num(1));
  else if (cmd === 'swipe')
    await table.swipe(num(0), num(1), num(2), num(3), args[4] ? num(4) : 300);
  else if (cmd === 'pinch')
    await table.pinch(num(0), num(1), num(2), args[3] ? num(3) : 500);
  else await table[cmd](args[0]);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
