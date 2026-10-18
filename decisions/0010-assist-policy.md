# ADR-0010: evidence policy for assisted positioning (`assist-v2`)

Status: Accepted, 2026-10-18. Refines [ADR-0009](0009-particle-filter-fusion.md); tracks A1/A2 of [Plan 002](../plans/active/002-turn-masterplan.md).

## Evidence

FACT: five assisted home walks from 16 Oct replayed through the original behaviour show the dot wandering 49.9 m in total while the walker was not stepping (recorded), and estimated paths of 21–27 m for 14–16 m of walking. Three of the five walks had 0–1 walking updates, and radio was applied every second as independent evidence while proximity fixes fired with one beacon heard.

## Decision

IMPLEMENT one shared policy, `AssistFusion`, used by the live tracker and by replay:

- Radio evidence is applied at most every 3 s and only after at least 1 m of walking (three settle updates are allowed after a cold start). The likelihood is tempered (exponent 0.6), uses σ 9 dB with heavy tails, and an innovation gate (2.5σ) skips updates that no hypothesis explains.
- A proximity fix needs at least two beacons heard and uses σ 2.5 m.
- The displayed uncertainty is floored at 1.5 m; the particle spread alone is not a confidence interval.
- The estimate changes only on walking displacement, an applied radio update, a fix or a user correction.

## Result and limits

EXPERIMENT RESULT: replaying the same five walks through the policy gives 1.9 m of standing drift (from 49.9 m) and path lengths within 0.5 m of the walking sensors' path (16.4 vs 16.5 and 14.5 vs 14.0 m). This measures stability, not position accuracy: no landmark-labelled walk exists yet, and the walks with no walking updates only show that the dot no longer wanders. Parameters are engineering values to be tuned through `npm run eval`.

## Next

Landmark-labelled walks (E1/E2), always-on walking sensing (P1–P3) and commercial beacons (B-track) decide accuracy; this ADR only makes the filter honest and stable.
