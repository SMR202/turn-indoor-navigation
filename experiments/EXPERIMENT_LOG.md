# Experiment log
Updated: 2026-09-12

No measured TURN results have been imported or verified. Team reports early mapping,
PDR/magnetic and Wi-Fi experiments; record provenance before drawing conclusions.
The rows below are **PROPOSED protocols**, not scheduled work or experiment results.
Detailed protocols and gates are in the [acceleration audit](../research/ACCELERATION_AUDIT.md#next-three-reproducible-team-experiments).

| ID / status | Question | Required hardware and ground truth | Frozen comparison | Metrics / gate before progression |
|---|---|---|---|---|
| E001 — PROPOSED, acquisition integrity | Are timestamps, frames, units, rates and denial/degradation observable and replayable on target Android/iOS phones? | ≥1 phone/platform (prefer ≥2), table, orientation/rotation script, external video/time cue; optional known beacon | Two replays of one hashed 60 s stationary + orientation/rotation + repeat capture | Rates/jitter/gaps, timestamp reversals/duplicates, axis/gravity sanity, deterministic result, explicit capability/permission state. Zero unexplained reversals and identical replay output; set device-specific numeric bounds from observed data. |
| E002 — PROPOSED, PDR baseline | Which simple step/stride/heading baseline survives device, user and carrying-mode changes? | E001 phones, ≥2 walkers, hand/pocket/bag, measured 30–100 m route, ≥6 surveyed checkpoints, video step count | Held-out repeats of counted-step/fixed-stride/gyro, threshold steps, and Fusion/platform attitude variants; ≥3 repeats/direction | Step precision/recall, endpoint/checkpoint median and p95, drift/distance, turn heading error, stratified failures and intervals. Team pre-registers acceptance target; published numbers are not gates. |
| E003 — PROPOSED, constraint/correction ablation | Do map constraints plus magnetic or BLE correction improve held-out localization and recovery? | E002 setup, reviewed metric map; separate survey/test sessions; beacon coordinates if BLE | Same held-out walks: PDR, PDR+map, PDR+observation, full; wrong-start and corridor-ambiguity cases | Median/p95 checkpoint error, wall/floor errors, completion, recovery time, lost-state calibration, latency. Advance only on pre-set, cross-device held-out improvement with explicit failures. |

Raw recordings remain immutable and outside Git. Each execution must use the session
manifest template, record rights and SHA-256, pin algorithm/config revisions, separate
survey from test sessions, and append results without overwriting this preregistration.
