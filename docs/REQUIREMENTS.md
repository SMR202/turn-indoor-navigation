# Requirements
Status: baseline scope; numeric acceptance targets require team agreement.

| ID | Requirement | Acceptance evidence |
|---|---|---|
| R01 | Convert floor plans into a scaled, reviewed navigable map | Known dimensions, walls, doors, POIs and floor links validated against ground truth |
| R02 | Route between POIs within/across floors | Reachability tests; no routes through walls; valid stairs/lift links |
| R03 | Evaluate PDR from smartphone IMU | Repeatable walks, timestamped traces and drift/heading metrics |
| R04 | Evaluate magnetic fingerprints and BLE corrections | Held-out walks and device/session separation; compare with PDR baseline |
| R05 | Support Android/iOS capability differences | Device/OS capability matrix and explicit missing-permission behavior |
| R06 | Keep Wi-Fi optional | Core experiment/navigation path can operate without Wi-Fi scans |
| R07 | Apply map constraints to localization | Wall-crossing, floor-error and recovery analysis |
| R08 | Prefer reusable components | Source/license/revision and ADOPT/ADAPT decision before integration |
| R09 | Preserve evidence and context | Every completed task updates state, plan and relevant experiment/decision records |
| R10 | Report uncertainty and failures | Lost-position/relocalization behavior specified and evaluated |

## Proposed evaluation dimensions
Median and p95 horizontal error (m), drift per distance, heading error (degrees), floor accuracy, route completion, time to fix/recover, latency, battery impact and venue survey effort.
Thresholds are TBD, not promises. Offline operation is a design candidate from prior local notes, to confirm before treating as a binding product requirement.
