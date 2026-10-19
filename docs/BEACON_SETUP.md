# Commercial beacon setup

How to bring a venue's BLE beacons into TURN. Phone beacons (the TURN test app's Beacons tab) keep working alongside.

## 1. Choose and configure the hardware

- **Eddystone-UID** frames must be enabled (iBeacon alone does not work: iOS hides iBeacon from normal Bluetooth scans).
- Advertising interval about **100 ms**, transmit power about **+4 dBm**, mains/USB power or a large battery.
- Note each beacon's **instance ID** (6 bytes, shown by the vendor app as 12 hex digits, for example `0A0B0C0D0E0F`). The namespace is not used for matching.

## 2. Plan and name them in TURN Studio

1. Venue → **Beacons**: pick the floor, choose the hardware preset, **Suggest sites** (or add by clicking the map), drag to adjust. Aim for most of the floor hearing three or more.
2. For each planned beacon press **Set ID** and enter that beacon's instance ID.
3. **Save layout**. Uncalibrated beacons carry the preset's model 1 m RSSI (−59 dBm for +4 dBm hardware). This is a starting value, not a measurement.
4. Mount at about 2 m, in a zigzag rather than a straight line, matching the plan.

## 3. Phones

Scanning Eddystone-UID needs the **next native build** of the TURN app (Android build 6 / iPhone IPA from CI); the current builds see phone beacons only. Format reference and tests: [`beacon-ids.ts`](../packages/positioning-core/src/beacon-ids.ts). Native parsers: `TurnBleModule.kt` and `TurnBleModule.swift` under `apps/mobile/modules/turn-motion`.

## 4. Check they work

- Walk with live guidance in the visitor app (usage sharing on). Studio's beacon list then shows **Heard today**, reports per 24 h and the median RSSI per beacon; **Never heard** means check power, ID and placement.
- Calibrate per phone family with the test app's 1 m calibration, then record walks with landmark marks and evaluate them ([evaluation](EVALUATION.md)) before claiming any accuracy.
