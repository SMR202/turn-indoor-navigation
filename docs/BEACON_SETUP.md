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
3. Tap it → **Add to venue** → tap where it is mounted on the map → **Save**. TURN picks the right ID (frame ID, or address/name when IDs are shared) and explains why.
4. **Calibrate 1 m**: hold the phone one metre from the beacon at chest height for 12 seconds; save the median. Calibrations are per phone (phones hear the same beacon several dB apart). Until then TURN uses the beacon's advertised 1 m power or −59 dBm.
5. Mount beacons about 2 m high, in a zigzag through the rooms, never in one line; aim for three or more heard everywhere.

Placements and calibrations are stored on that phone, layered over the venue's published layout (**Use venue layout** discards them). Publishing a layout for every phone still goes through TURN Studio.

## 3. Set up in TURN Studio (shared with every phone)

1. Venue → **Beacons**: pick the floor, choose the hardware preset, **Suggest sites** (or add by clicking the map), drag to adjust.
2. For each beacon press **Set ID** and enter its TURN ID from the table above (the phone's beacon screen shows it as _TURN ID_).
3. **Save layout**, optionally **Calibrate** with a measured 1 m RSSI, then publish.

## 4. Live position

With two or more beacons set up, the visitor app **finds you automatically** when the venue opens and the blue dot follows you while browsing, previewing routes and navigating. Without beacons, start it with **Set my location** (map pin) or a TURN code. The phone also learns how the venue's map is turned against its compass after some walking, so later starts know which way you face.

Check the result with walks that use landmark marks ([evaluation](EVALUATION.md)) before claiming any accuracy. Native parsers: `TurnBleModule.kt` and `TurnBleModule.swift` under `apps/mobile/modules/turn-motion`; format reference and tests: [`beacon-ids.ts`](../packages/positioning-core/src/beacon-ids.ts).
