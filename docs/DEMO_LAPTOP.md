# Phone demo from another computer

How to run TURN's phone demo from a laptop away from the main computer, for example at a venue where the beacons are set up on site. The phones keep their installed TURN development build; the laptop serves the app's code, the venues and the TURN server.

## 1. Pack a kit on the main computer

```sh
npm run demo:kit
```

It writes `work/demo-kit/TURN-demo-kit.zip` (Git-ignored): the committed code (a Git bundle and a plain zip; uncommitted changes are listed and left out), every private venue of this computer, a consistent copy of the TURN server database (beacon layouts, calibrations, beacon tests, location answers), `location-codes.html` with printable TURN location codes for every private venue, `SETUP.cmd` and a README.

The kit contains private plans. Copy it by USB stick or over the home network only, never through a cloud service or chat app, and delete copies after use.

## 2. Set up the laptop (Windows)

1. Install Node.js 24 (the repository requires `>=24.3 <25`, and npm enforces it): the x64 `.msi` from <https://nodejs.org/dist/latest-v24.x/>. Git is optional.
2. Unzip the kit and double-click `SETUP.cmd`. It copies TURN to `Documents\TURN Indoor Navigation` (a Git clone when Git is installed), copies the private venues and, the first time only, the database, runs `npm ci` (internet needed) and puts a **TURN demo** shortcut on the desktop. Running a newer kit's setup again updates the code and venues but keeps the laptop's database.

On a Mac, the kit README lists the same steps as commands.

## 3. Start the demo

```sh
npm run demo
```

(or the **TURN demo** shortcut). It starts the TURN API (port 8090) and the visitor app's production-mode server (port 8081, no Fast Refresh), builds the iPhone and Android bundles once so the first scan opens quickly, then shows the **Expo launch QR** (also `work/demo/expo-launch-qr.png`). That QR opens the installed TURN app on this laptop's server; it is not a TURN location code. Scan it with the iPhone camera; on Android open the TURN app and scan it from the development launcher. Ctrl+C stops everything. Logs: `work/demo/`.

- `--host <address>` picks the network address (the script prefers a Windows Mobile Hotspot, `192.168.137.1`, and otherwise the first private address; it prints the others).
- Without internet the server starts offline (Expo's online version check is skipped).
- When Windows Firewall asks about Node.js, allow **Private and Public** networks; hotspot networks are often classed as public.

## 4. Networks

The phones must reach the laptop directly. University and company Wi-Fi usually blocks traffic between devices (client isolation), so do not rely on it:

- **Laptop hotspot** (Windows Settings → Network & internet → Mobile hotspot): the phones join the laptop. Windows may need an internet connection to share before it allows the hotspot.
- **Phone hotspot**: the laptop and the other phone join one phone's hotspot. Start `npm run demo` after joining, so the QR carries the new address.

Changing network changes the laptop's address: stop the demo, join the new network, start it again and scan the new QR.

## 5. Beacons at the new venue

Beacon layouts belong to a venue, so beacons that worked at home must be placed again on the venue's map. Give every beacon the same transmit power and interval ([beacon setup](BEACON_SETUP.md)).

1. Open the venue in TURN → **Set up beacons** → **Nearby**: hold the phone at a beacon, tap the top entry (_closest_) → **Add to venue** → move the map under the pin to the beacon's spot → **Set here**. Mount beacons about 2 m high, one per room or area to tell apart.
2. **Test beacons**: stand under each beacon for 10 s. Every row should say the beacon is strongest at its own spot. With three or more spots, **Use measured calibration**.
3. Layouts and calibrations go to the laptop's TURN server, so both phones share them. They stay on the laptop: the main computer's database is separate.

Without calibration TURN still ranks beacons correctly when they all have the same settings.

## 6. Honest claims

Maps made by an automatic tool can have an estimated scale (see each venue's provenance notes; `npm run venue:add` prints them). On an estimated-scale floor, distances and walking estimates may be off by the scale error: show navigation there, but report accuracy only from walks with landmark marks on a measured floor ([evaluation](EVALUATION.md)).
