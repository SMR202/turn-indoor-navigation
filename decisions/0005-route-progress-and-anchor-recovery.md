# ADR-0005 — One-floor guidance and anchor recovery

Status: ACCEPTED, 2026-10-03.

## Context

Users can walk short test courses but need an end-to-end navigation experience. PDR still has count/stride and heading error. The private plan has inferred wall and door locations; route snapping would hide errors and could imply unsafe confidence. Shared navigation must remain independent of any venue or future positioning technology.

## Decision

Implement `RouteGuidance` in the existing routing package: Pose + Route → estimated remaining geometric distance, next turn, near-destination or recovery state. Reuse pinned Graphlib 4.0.5 (MIT) for graph routes and the existing normalized pose/anchor pipeline. No new dependency or empty package.

Progress follows the current route segment and its successor. The next segment becomes eligible only after reaching within 0.8 m of the shared vertex and moving at least min(0.4 m, half next-segment length) along it, with a closer projection. Turns use signed venue-frame direction changes ≥30°; ≥150° prompts turning around. Guidance does not modify pose. These tolerances are provisional product parameters, not calibrated uncertainty bounds.

An estimate farther than 2 m from its local route segment for at least one native sensor second, a lost pose, wrong venue/revision/floor or reversed clock latches recovery. Recalculate only from a newly scanned or explicitly confirmed known location. Retain destination; require a fresh heading alignment before restarting. Do not reroute from an arbitrary nearest node through unverified walls. Multi-floor routes are explicitly unsupported in this screen.

Near-destination requires being on the final segment, ≤1 m geometric distance remaining and ≤1 m direct distance to its endpoint. Arrival is confirmed by the user, never asserted by PDR alone. Navigation recordings add optional destination/source/guidance-version/completion metadata; old recordings remain readable. Existing native lifecycle/30 m limits still apply. Screens stop capture on loss of navigation focus.

## Consequences

Navigate becomes the home screen; test/calibration/history/sharing live at `/tests`. Core positioning is unchanged and future fusion sources can provide the same pose. Recovery may be frequent when drift is large or a turn is missed. Map matching, obstacle clearance, multi-floor guidance and validated accuracy remain future work. No background tracking, cloud service or recurring analysis is introduced.

Validation includes synthetic left/right turns, sequential progression without jumping to later segments, recovery latch, lost/mismatched poses, same-node and multi-floor cases. All 72 routes in the active private venue reach a near-destination state under synthetic geometry-following input; this is not evidence of physical accuracy or clearance. Phone walk-through is the next acceptance step.
