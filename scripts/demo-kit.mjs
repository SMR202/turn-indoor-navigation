// Packs everything another computer needs to run the phone demo into one Git-ignored folder and
// zip (work/demo-kit): the committed code as a Git bundle and a plain zip, this computer's private
// venues, a consistent copy of the TURN server database (beacon setups, calibrations, surveys),
// printable TURN location codes for every private venue, and a Windows setup script.
//
//   npm run demo:kit
//
// The kit holds private plans: copy it by USB stick or over the home network only, never through
// a cloud service, and delete it from shared places after use.
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { anchorPayload } from '@turn/positioning-core';
import { parseVenuePackage } from '@turn/venue-model';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'work/demo-kit');
const kit = join(out, 'TURN-demo-kit');
const git = (...a) =>
  execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

const branch = git('branch', '--show-current');
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain', '--untracked-files=no');
if (dirty)
  console.warn(
    `Uncommitted changes are NOT in the kit (only commit ${commit}):\n${dirty}`,
  );

rmSync(out, { recursive: true, force: true });
mkdirSync(join(kit, 'private/venues'), { recursive: true });
mkdirSync(join(kit, 'api-data'), { recursive: true });

git('bundle', 'create', join(kit, 'turn.bundle'), branch);
git('archive', '--format=zip', '-o', join(kit, 'source.zip'), 'HEAD');

// Private venues: the home plan and every added venue.
const venueFiles = [];
const home = resolve(root, 'work/private/venue.json');
if (existsSync(home)) {
  copyFileSync(home, join(kit, 'private/venue.json'));
  venueFiles.push(home);
}
const privateDir = resolve(root, 'work/private/venues');
if (existsSync(privateDir))
  for (const f of readdirSync(privateDir).filter((f) => f.endsWith('.json'))) {
    copyFileSync(join(privateDir, f), join(kit, 'private/venues', f));
    venueFiles.push(join(privateDir, f));
  }

// The server database, copied consistently even while the server runs.
const dbPath = resolve(root, 'work/api-data/turn.db');
if (existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  db.exec(
    `VACUUM INTO '${join(kit, 'api-data/turn.db').replaceAll("'", "''")}'`,
  );
  db.close();
}

// TURN location codes (start points), one printable page for all private venues.
const sections = [];
for (const file of venueFiles) {
  const venue = parseVenuePackage(JSON.parse(readFileSync(file, 'utf8')));
  const cards = [];
  for (const a of venue.anchors)
    cards.push(
      `<figure><img src="${await QRCode.toDataURL(anchorPayload(venue, a.id), { width: 300, margin: 4, errorCorrectionLevel: 'M' })}" alt=""><figcaption><b>${escape(a.label ?? a.id)}</b><br>${escape(venue.name)}</figcaption></figure>`,
    );
  const scale = (venue.provenance?.notes ?? []).join('; ');
  sections.push(
    `<section><h2>${escape(venue.name)}</h2>${scale ? `<p>${escape(scale)}</p>` : ''}<div>${cards.join('')}</div></section>`,
  );
}
writeFileSync(
  join(kit, 'location-codes.html'),
  `<!doctype html><meta charset="utf-8"><title>TURN location codes</title><style>body{font:14px system-ui,sans-serif;margin:24px}h1{font-size:20px}h2{font-size:16px;margin:24px 0 4px;break-before:page}div{display:flex;flex-wrap:wrap;gap:16px}figure{margin:0;width:220px;text-align:center;break-inside:avoid}img{width:200px;height:200px}p{color:#555;margin:0 0 8px}</style><h1>TURN location codes</h1><p>Print and stick each code where its label says, or show it on a screen. Scanning one in the TURN app (Scan a TURN code) starts the blue dot at that spot. These are not the Expo launch QR.</p>${sections.join('')}`,
);

function escape(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}

// Windows setup: double-click SETUP.cmd.
writeFileSync(
  join(kit, 'SETUP.cmd'),
  '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-laptop.ps1"\r\npause\r\n',
);
writeFileSync(
  join(kit, 'setup-laptop.ps1'),
  `# Installs or updates the TURN demo on this computer from this kit.
# -Destination and -NoShortcut are for trying the setup somewhere else.
param(
  [string]$Destination = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'TURN Indoor Navigation'),
  [switch]$NoShortcut
)
$ErrorActionPreference = 'Stop'
$kit = $PSScriptRoot
$dest = $Destination
$branch = '${branch}'

$v = $null
try { $v = (& node --version) } catch {}
if (-not $v -or $v -notmatch '^v24\\.([3-9]|[1-9][0-9])\\.') {
  Write-Host "TURN needs Node.js 24 (found: $v). Install the x64 .msi from https://nodejs.org/dist/latest-v24.x/ then run SETUP again." -ForegroundColor Yellow
  exit 1
}
$hasGit = $null -ne (Get-Command git -ErrorAction SilentlyContinue)

if (Test-Path (Join-Path $dest '.git')) {
  if (-not $hasGit) { throw 'Git is needed to update this copy; install Git or delete the folder.' }
  Write-Host 'Updating the existing copy...'
  git -C $dest pull --ff-only (Join-Path $kit 'turn.bundle') $branch
} elseif (Test-Path (Join-Path $dest 'package.json')) {
  Write-Host 'Updating the existing copy from source.zip...'
  Expand-Archive -Force (Join-Path $kit 'source.zip') $dest
} elseif ($hasGit) {
  Write-Host "Copying TURN to $dest ..."
  git clone -b $branch (Join-Path $kit 'turn.bundle') $dest
} else {
  Write-Host "Copying TURN to $dest (no Git found; using source.zip) ..."
  Expand-Archive (Join-Path $kit 'source.zip') $dest
}

New-Item -ItemType Directory -Force (Join-Path $dest 'work\\private\\venues') | Out-Null
New-Item -ItemType Directory -Force (Join-Path $dest 'work\\api-data') | Out-Null
if (Test-Path (Join-Path $kit 'private\\venue.json')) {
  Copy-Item -Force (Join-Path $kit 'private\\venue.json') (Join-Path $dest 'work\\private\\venue.json')
}
Copy-Item -Force (Join-Path $kit 'private\\venues\\*.json') (Join-Path $dest 'work\\private\\venues')
$db = Join-Path $dest 'work\\api-data\\turn.db'
if (Test-Path $db) {
  Write-Host 'Kept this computer''s TURN database (its beacon setups stay). Delete work\\api-data to take the kit''s copy.'
} elseif (Test-Path (Join-Path $kit 'api-data\\turn.db')) {
  Copy-Item (Join-Path $kit 'api-data\\turn.db') $db
}

Write-Host 'Installing packages (needs internet, several minutes)...'
Push-Location $dest
try { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } } finally { Pop-Location }

$shortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'TURN demo.cmd'
if (-not $NoShortcut) {
  Set-Content -Encoding ASCII $shortcut "@echo off\`r\`ncd /d \`"$dest\`"\`r\`nnpm run demo\`r\`npause"
}
Write-Host ''
Write-Host "Done. Start the demo with 'TURN demo' on the desktop (or: cd '$dest'; npm run demo)." -ForegroundColor Green
`,
);

writeFileSync(
  join(kit, 'README.txt'),
  `TURN demo kit (commit ${commit}, branch ${branch}, made ${new Date().toISOString()})

PRIVATE: contains the home plan and the FAST campus maps. Copy only by USB stick or the home
network; never upload it anywhere (Drive, WhatsApp, email). Delete copies after use.

Windows laptop
  1. Install Node.js 24: https://nodejs.org/dist/latest-v24.x/ (the x64 .msi). Git is optional.
  2. Unzip this kit, double-click SETUP.cmd (if Windows warns, More info > Run anyway).
     Needs internet once, for the packages.
  3. Double-click "TURN demo" on the desktop. When Windows Firewall asks about Node.js, tick
     Private AND Public networks and allow.
  4. Scan the QR it shows with the phones (they must be on the same network as the laptop).

Mac (in Terminal, inside this kit folder; needs Node 24 and Git)
    git clone -b ${branch} turn.bundle ~/TURN
    mkdir -p ~/TURN/work/private/venues ~/TURN/work/api-data
    cp private/venue.json ~/TURN/work/private/
    cp private/venues/*.json ~/TURN/work/private/venues/
    cp api-data/turn.db ~/TURN/work/api-data/
    cd ~/TURN && npm ci && npm run demo

location-codes.html: printable TURN location codes (start points) for every venue.
`,
);

// Windows' own tar writes zip files (Git's tar does not).
if (process.platform === 'win32')
  execFileSync(
    join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'),
    ['-a', '-c', '-f', 'TURN-demo-kit.zip', 'TURN-demo-kit'],
    { cwd: out },
  );
else
  execFileSync('zip', ['-qr', 'TURN-demo-kit.zip', 'TURN-demo-kit'], {
    cwd: out,
  });
const size = (p) => `${(readFileSync(p).byteLength / 1e6).toFixed(1)} MB`;
console.log(
  `Kit: ${kit}\nZip: ${join(out, 'TURN-demo-kit.zip')} (${size(join(out, 'TURN-demo-kit.zip'))})\n${venueFiles.length} private venues, commit ${commit}. Private: USB or home network only.`,
);
