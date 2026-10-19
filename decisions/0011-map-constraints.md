# ADR-0011: map constraints for the live blue dot

Status: Accepted, 2026-10-19. Refines [ADR-0009](0009-particle-filter-fusion.md) and [ADR-0010](0010-assist-policy.md).

## Problem

FACT (user report, home walks): the blue dot drifted into other rooms and jumped through walls, although people navigating mostly walk along the route line.

FACT (diagnosis on the private home plan and the code):

1. Doorways in imported plans sit in 0.1–0.6 m wall-thick gaps between room polygons, outside every walkable polygon. A particle could only pass a door when one step happened to land beyond the gap, so the cloud piled up in the old room.
2. The display interpolated in straight lines and snapped to the route without checking walls, so a moving estimate was drawn across walls.
3. The start heading was treated as known to ±0.1 rad, while phone heading errors of 15–45° are common; walls then cut the cloud instead of correcting the heading.
4. A step blocked by a wall stopped the particle dead.

## Decision

IMPLEMENT, in the shared positioning packages (live and replay use the same code):

- **Walk graph** (`positioning-core/walk-graph.ts`): the shortest walkable path between two points through venue nodes and doors.
- **Doorway connectors** (`buildFusionMap`): a door-wide strip wherever a walk-graph edge leaves walkable space. Walls still block everything else.
- **Wall sliding** (`ParticleFusion.predict`, `wallSlide`): a step blocked by a wall continues at 20–60° along it, shorter by the cosine and down-weighted by the angle; the particle's heading bias learns part of the turn.
- **Route prior** (`AssistFusion`, σ 2.5 m, floor 0.15, every 2 m walked): a soft pull towards the route being followed, never a constraint.
- **Start heading uncertainty**: 0.5 rad when the walker faces along the route, 0.3 rad when they marked their direction on the map. Tap corrections (`relocate`) keep the learned heading and stride.
- **Path-aware display** (`DisplayPose.setMap`): moves between rooms follow the walk graph through doors; on the route the dot glides along the route's arc length and follows corners; no snapping to a route on the other side of a wall; backward wobbles under 1.2 m on the route are ignored; with no walkable connection (or a path over 25 m) the dot jumps rather than drawing a walk; smoothing τ 0.2 s.
- **Visitor app**: **Set my location** — tap where you are, then optionally tap the way you are facing.

REJECTED (EXPERIMENT RESULT): reporting the mean of the most likely room (with hysteresis and a walking-reachability gate) instead of the cloud mean. On the simulated walks below it raised wrong-room time (18.6% versus 11.9% drawn, unmodified walks) and error; it was removed.

## Evidence

EXPERIMENT RESULT: `scripts/map-constraint-eval.ts` replays 16 recorded home walks (no ground truth) and 22 simulated multi-room walks along real routes on the private home plan, three filter seeds each, with heading and stride distortions applied to the walking sensors. Simulated walks know their true path, so they also measure time shown in the wrong room. Before = commit 76d50e7; after = this change with the shipped start heading uncertainty (0.5 rad). While navigating:

| Scenario            | Drawn wall crossings, before → after | Wrong room (drawn, simulated), before → after |
| ------------------- | ------------------------------------ | --------------------------------------------- |
| as recorded         | 1 → 0                                | 13.8% → 13.3%                                 |
| heading +15° / −15° | 30 / 45 → 0 / 0                      | 22.5% / 19.1% → 14.3% / 13.2%                 |
| heading +30° / −45° | 126 / 134 → 0 / 0                    | 53.2% / 56.7% → 18.7% / 19.4%                 |
| heading +60°        | 187 → 0                              | 71.3% → 39.9%                                 |
| stride +25%         | 13 → 0                               | 11.2% → 12.3%                                 |
| heading +45°        | 289 → 0                              | 66.9% → 23.8%                                 |

Not navigating, drawn crossings fall from 39–299 per scenario to 0, except 2 jumps in one run (stride +25%). Recorded walks alone: 0 drawn crossings after, in every scenario.

The CI test `map-constraints.test.ts` repeats the property on the public synthetic demo centre: walks with a 30° skewed heading draw no wall crossing, while the same walks drawn without map awareness do.

## Limits

These are synthetic and replayed walks on one plan; they establish no venue accuracy. The recorded walks have no labelled positions, simulated heading error is constant, and the wall-thick gaps are specific to that plan. Wrong-room time near doors partly reflects display lag. Accuracy at the user's home needs physical walks with landmark marks.

## Next

Physical home walks starting with **Set my location**, with landmark marks; compare wrong-room time and corrections against this replay.
