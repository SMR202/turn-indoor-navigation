# Implementation roadmap

Updated: 2026-09-25. Product progress and accuracy evidence proceed together.

| Milestone | Outcome / acceptance                                                    | Dependencies / state                                             |
| --------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| M0        | Reproducible setup, app boot where feasible, contracts/tests/CI/handoff | Foundation implemented; native smoke pending                     |
| M1        | One-floor map/POIs, destination and local displayed route               | Initial synthetic slice implemented                              |
| M2        | QR ID → known pose → route; invalid/denied/recovery states              | Implemented; native use reported                                 |
| M3        | PDR steps/heading drive one pose; record/replay                         | Baseline + diagnostic comparison implemented; accuracy gate open |
| M4        | Map constraints improve motion/recovery                                 | M3 + reviewed geometry; E003                                     |
| M5        | Magnetic OR BLE measured correction                                     | M3 and held-out device/session data                              |
| M6        | Multi-floor routes/UI and measured transitions                          | Connector contract exists; UI/inference pending                  |
| M7        | Human upload/calibrate/trace/review/publish workflow                    | Begin model/fixture now; admin persistence later                 |
| M8        | Download/cache/versioning/atomic update                                 | Offline core starts M0; updater follows authoring                |
| M9        | Reusable SDK/module proven in second client                             | Shared boundaries now; inspect Centaurus stack/access            |
| M10       | CV/OCR reduces measured authoring effort                                | Canonical authoring path and licensed data                       |

Research: [E001 acquisition](../experiments/EXPERIMENT_LOG.md), E002 PDR/heading, E003 constraints/corrections, then cross-device/carry modes, floor inference, battery and accuracy. Initial user captures reveal count and heading errors; general accuracy remains unvalidated.

Static UI/routing, contracts, manual authoring and partner discovery do not depend on E001. PDR claims need acquisition; correction claims need held-out walks. QR can establish location before inertial tracking.

Current slice: native pedometer comparison, labelled phone-handling controls and richer inertial capture. Next: use phone evidence to select walking recognition, then direction/stride validation and known-reference/map corrections. See [market review and execution plan](../research/MARKET_DIRECTION_2026_09.md). Camera-assisted positioning is an experiment for free-hand robustness; magnetic/BLE correction remains M5.
