# Commercial beacon setup

How to bring a venue's BLE beacons into TURN. Phone beacons (the TURN test app's Beacons tab) keep working alongside. Decision record: [ADR-0012](../decisions/0012-ibeacon-and-always-on-live.md).

## 1. What TURN hears

| Beacon frame                                 | Android                      | iPhone                                                                                                    | TURN ID                             |
| -------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **iBeacon** (April Brother and most vendors) | yes (build 7)                | yes (new IPA): ranged through Core Location by UUID, about once a second; asks for location "While Using" | `IB` + major + minor (hex)          |
| **Eddystone-UID**                            | yes (build 6)                | yes                                                                                                       | the 6-byte instance (12 hex digits) |
| Beacons that share one iBeacon ID            | by Bluetooth address (`MC…`) | only by advertised name (`NM…`), otherwise not at all                                                     | address or name                     |

- iPhones only range iBeacon UUIDs they know. TURN includes common factory UUIDs (the AirLocate sample UUID that April Brother and many others ship with, plus Estimote, Kontakt, Radius and others) and any UUID saved with a beacon in the layout.
- If several beacons broadcast the **same iBeacon ID** (a factory default such as major 1 / minor 1), give each its own **Minor** in the maker's app before relying on iPhones. Android tells them apart by address meanwhile.
- Advertising interval about **100–300 ms** and the highest transmit power the maker allows give the steadiest signal. Mains/USB power or a large battery.

## 2. Set up with a phone (visitor app)

1. Open the venue → under its name, **Set up beacons** (or **Beacons · N set up**).
2. **Nearby** lists every beacon this phone hears, strongest first, with live dBm bars. Hold the phone next to a beacon: it jumps to the top (marked _closest_). **Show other devices** reveals non-beacon Bluetooth devices, for beacons that only advertise a name.
3. Tap it → **Add to venue** → drag and zoom the map until the fixed pin points at the beacon → **Set here** (taps never move it). TURN picks the right ID (frame ID; when IDs are shared, a unique Bluetooth name that both platforms read, else the Android-only address) and explains why.
4. **Calibrate 1 m**: hold the phone one metre from the beacon at chest height for 12 seconds; save the median. Until then TURN uses the beacon's advertised 1 m power or −59 dBm.
5. Mount beacons about 2 m high, in a zigzag through the rooms, never in one line; aim for three or more heard everywhere.
6. **See all beacons on the map** shows every placed beacon (a dot marks the exact spot); tap one to open it.
7. **Test beacons**: stand under each beacon (phone at chest height, still) and record 10 s. Each row says whether that beacon is the strongest at its own spot, which room-level positioning needs; a beacon that loses at its own spot is too weak, set differently or placed wrong on the map. With three or more spots TURN fits this building's radio model (each beacon's 1 m level and how fast signals fall through the walls); **Use measured calibration** replaces the hand calibrations. Results of private LAN venues go to the TURN server (`GET /public/venues/:id/beacon-survey` on the LAN) for analysis on the computer.

### Beacon settings (maker's app)

Set every beacon the same way: same transmit power, same interval, its own Major/Minor.

- **Transmit power: the highest level** (often +4 dBm). In a published study of beacon parameters the highest power gave the best location accuracy, at a battery cost.
- **Advertising interval: 100–200 ms.** iPhones report each beacon about once a second, but they average the packets received in that second; faster advertising makes each reading steadier, and Android gets more readings.
- **Measured power** (the 1 m value in the beacon's packet): leave it; TURN calibrates.
- Replace old coin cells: a beacon that reads far below the others at 1 m usually has a low battery or a lower power setting.
- **Broadcast Eddystone-UID as well as iBeacon** when the beacon can do both at once. FACT: iPhones only deliver iBeacon through Core Location, about one averaged reading per beacon per second; Eddystone frames arrive through Core Bluetooth, one reading per packet while the app is open (TURN's iPhone module already reads them). At 100 ms that is several times more evidence per second. Keep iBeacon on for background detection.

### April Brother beacons (AprilBeacon app, iPhone)

FACT (home beacons, 2026-10-22): they shipped at **Tx Power 0 dBm** and **Advertising Freq 9** (×100 ms = 900 ms), iBeacon, and can broadcast iBeacon _or_ Eddystone (not both). Configured: **4 dBm** and **Freq 1** (100 ms), still iBeacon so TURN's beacon IDs stay the same. At 900 ms an iPhone reading averaged barely one packet; at 100 ms about ten.

1. AprilBeacon → **Bluetooth** tab. If the list is empty, ••• → Filter by RSSI → switch it off (it hides beacons weaker than -70 dBm).
2. Stand near a beacon and tap the strongest **AprilBeacon_XXXX** (the last four characters of its address). Check **Minor** to know which beacon it is.
3. **Tx Power** → **4dBm**. **Advertising Freq** → delete the number, type **1**. Change nothing else (Broadcast Type, UUID, Major, Minor, Measured Power, New Password).
4. **Save** → type the beacon password (default ; some models ) → ok. The app returns to the list; reopen to check.
5. Then run **Test beacons** again for every beacon and **Use measured calibration**: each beacon's 1 m level rises by about 4 dB.

At 100 ms and 4 dBm a coin cell lasts months rather than years; Freq 2 (200 ms) is the compromise.

### Buying beacons (PROPOSED)

Candidates the owner shortlisted, from Minew's product pages (vendor figures, not measured here):

|                | [Minew E5 Location Beacon](https://www.minew.com/product/e5-location-beacon/) | [Minew E7 Plus](https://www.minew.com/product/e7-plus-beacon/) |
| -------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Formats        | iBeacon and Eddystone at the same time                                        | iBeacon and Eddystone                                          |
| Transmit power | adjustable up to +4 dBm (default 0 dBm)                                       | not stated on the page                                         |
| Battery        | replaceable 2400 mAh lithium                                                  | replaceable coin cell, 1000 mAh, about 2 years                 |
| Build          | nRF52, 39 g                                                                   | 20 g, IP67 waterproof                                          |

PROPOSED: the **E5** for indoor venues (twice the battery for 100 ms and +4 dBm, both formats at once); the E7 Plus where water or dust matters. Before buying in bulk, check the datasheet for the advertising-interval range and buy two to run **Test beacons** with.

How many: at least **one per room** people need to tell apart, mounted mid-room or mid-wall about 2 m high (not on metal, not behind furniture), and in corridors and open areas one every 6–10 m so two or three are heard everywhere. Room-level positioning needs each beacon to be the strongest in its own room (the beacon test checks this); finer positions need more beacons heard at once.

For **private LAN venues** (a home or test site) the setup is shared through the TURN server: every edit is uploaded, and phones fetch changes when the venue opens and every 15 s. A phone that set up beacons before sharing existed uploads them on its first sync, united with what other phones already shared. Calibrations are shared too, although phones hear the same beacon a few dB apart. Public venues keep phone edits on that phone; their shared layout is set up in TURN Studio.

## 3. Set up in TURN Studio (shared with every phone)

1. Venue → **Beacons**: pick the floor, choose the hardware preset, **Suggest sites** (or add by clicking the map), drag to adjust.
2. For each beacon press **Set ID** and enter its TURN ID from the table above (the phone's beacon screen shows it as _TURN ID_).
3. **Save layout**, optionally **Calibrate** with a measured 1 m RSSI, then publish.

## 4. Live position

With two or more beacons set up, the visitor app **finds you automatically** when the venue opens and the blue dot follows you while browsing, previewing routes and navigating. Without beacons, start it with **Set my location** (map pin) or a TURN code. Marking your direction once with **Set my location** teaches that phone how the venue's map is turned against its compass (walking refines it), so later starts know which way you face.

**How the beacons are used** (not trilateration): a particle filter keeps a few hundred guesses of where you are. Steps move them, walls stop them, and every few seconds each guess is scored by how well it explains the signal of every beacon heard, one or many, using each beacon's measured 1 m level. On top, the **nearest beacon** rule: beacons are ranked by how far above their own 1 m level they are heard (a distance, not loudness, so a quiet beacon close by beats a loud one through a wall); the leader, within 12 dB of its 1 m level and 4 dB ahead of the next for 2 s, pulls the guesses into its room, on arrival and every 4 s while it leads. Changing room needs a 6 dB lead held for 4 s, so a reflection or an opening door does not hop you between rooms.

**The blue dot** moves with your steps. A jump no step explains is shown only when a second estimate agrees; while you stand still, small corrections and uncertainty widen the accuracy circle instead of moving the dot. **Not here?** Tap the dot (or the _Location rough_ chip): pick your room from the likeliest few, **Find me again**, or point on the map. On private LAN venues each answer, with the beacon readings at that moment, is kept on the TURN server as a labelled example (`/public/venues/:id/location-feedback`).

Check the result with walks that use landmark marks ([evaluation](EVALUATION.md)) before claiming any accuracy. Native parsers: `TurnBleModule.kt` and `TurnBleModule.swift` under `apps/mobile/modules/turn-motion`; format reference and tests: [`beacon-ids.ts`](../packages/positioning-core/src/beacon-ids.ts).
