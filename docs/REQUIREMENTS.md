# Product requirements

Updated: 2026-09-24. Product implementation and scientific evaluation proceed in parallel.

| ID  | Requirement                                                  | Evidence                                                                    |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| R01 | Reviewed metric floors, walls, doors, POIs, graph/connectors | Scale/checkpoints/topology reviewed against ground truth                    |
| R02 | Local within/across-floor routing/accessibility              | Directed/blocked/unreachable/connector tests                                |
| R03 | Reusable platform, TURN reference client                     | UI-independent core; second client before claiming SDK readiness            |
| R04 | Android/iOS capability detection                             | Explicit unavailable/denied/degraded states on devices                      |
| R05 | Offline navigation with loaded venue                         | Native offline test; pinned package/assets                                  |
| R06 | QR initial positioning/recovery                              | Trusted local ID resolution; invalid/stale/permission tests                 |
| R07 | Modular PDR/magnetic/BLE/pressure/map corrections            | Common observations and one authoritative pose; Wi-Fi optional Android-only |
| R08 | Deterministic replay                                         | Repeatable output from hashed input/config/revision                         |
| R09 | Uncertainty/lost/recovery behavior                           | Typed states and measured recovery                                          |
| R10 | Reuse-first                                                  | Pinned version/license and ADOPT/ADAPT/IMPLEMENT/EXPERIMENT                 |
| R11 | Versioned venue data, no Centaurus coupling                  | Same engine for multiple venues; migration policy                           |
| R12 | Human authoring with AI assistance later                     | Correct/validate/publish canonical model                                    |
| R13 | Reproducible environment/context                             | Lockfile, CI, commands, handoff without chat                                |
| R14 | Privacy/authorization                                        | No private traces/plans/secrets in Git; admin auth before deployment        |

Numerical pilot targets remain TBD: median/p95 position error, drift/distance, heading/floor errors, recovery, completion, latency, battery and survey effort. Synthetic tests/upstream papers are not TURN accuracy. Background navigation is not promised before measurement.
