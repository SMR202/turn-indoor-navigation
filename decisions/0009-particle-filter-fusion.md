# ADR-0009: map-aware particle-filter fusion for assisted navigation

Status: Accepted, 2026-10-16. Supersedes the "shadow mode only" scope of [ADR-0008](0008-ble-proximity-anchors-shadow-mode.md) for the main navigator; shadow logging remains in the classic test screen. Plan: [assisted navigation master plan](../plans/active/2026-10-16-assisted-navigation-master-plan.md).

## Decision

IMPLEMENT a particle filter (`ParticleFusion`, pure TypeScript in positioning-core) as the navigator's position source, with the walking sensors reduced to displacement observations.

- **State per particle:** position, heading bias, step scale. Bias and scale random-walk with distance so persistent walking-sensor drift is estimated, not assumed zero.
- **Motion:** each walking displacement is rotated by the particle's bias, scaled, and noised. A move that crosses a wall or leaves walkable space keeps the particle in place and removes most of its weight. Doors are gaps in the venue wall list.
- **Radio measurement:** every second, per-beacon median RSSI over a 2 s window (at least three packets) scores each particle against a log-distance model (calibrated reference at 1 m, exponent default 2.3, optional per-beacon 4 m refinement) with a Student-t residual (σ 6 dB, 4 degrees of freedom) so shadowed readings are discounted rather than trusted. Readings below −92 dBm are ignored.
- **Proximity and fingerprints:** passing within about 8 dB of a beacon's 1 m reference with a 6 dB lead fixes the position softly (σ 1.6 m). A confirmed fingerprint or a user tap enters as a position measurement; a fix that contradicts the whole cloud restarts it around the fix.
- **Cold start:** with two or more calibrated beacons heard, particles spread over walkable space are weighted by the readings to propose a start; the user confirms or taps the map. Heading still comes from the user holding the phone along the route.
- **Standing still:** repeated evidence is applied at most four times while the user is stationary, so the cloud does not become falsely certain.
- **Recording:** each assisted walk saves raw walking positions, beacon samples, proximity events and the fused path as a `ble-trace` with `mode: assist`; `replayAssistedTrace` re-runs the filter offline.

## Alternatives and limits

REJECT classic trilateration as the sole method (RSSI-to-distance error and non-intersecting circles; see the [review](../research/BLE_BEACON_POSITIONING_2026_10.md)). REJECT an EKF for the first version: the map's wall constraint and multi-modal start make a particle representation simpler and more honest. DEFER learned RSSI correction and per-room offsets until real walks exist.

The filter is deterministic given a seed; hosting 500 particles with wall tests runs at interactive rates in JavaScript but has not been profiled on the phones. Parameters are engineering starting values. Synthetic simulation (20° heading bias, 10% step overestimate, 4 dB shadowing with 10% outliers) reduced mean error from 2.1 m to 1.0 m, with about half of that gain from the map alone; this validates mechanics, not accuracy in this house. Estimated uncertainty is the particle cloud's spread, not a calibrated confidence interval.

## Verification and next action

Tests cover drift cancellation in simulation across seeds, determinism, wall and door behaviour, cold start from radio alone, contradictory fixes, path-loss helpers, the live tracker with injected beacon streams, trace replay, helpers for routing/snapping, and the inbox endpoint. Next: real end-to-end walks with landmark labels, then tuning from replay.
