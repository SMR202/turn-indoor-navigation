# Current state
Updated: 2026-09-12
Phase: first acceleration audit complete; before production implementation.

## Established

- **FACT:** The first sourced [acceleration audit](../research/ACCELERATION_AUDIT.md)
  and pinned [reuse registry](../research/REUSE_REGISTRY.md) cover mapping, rendering,
  routing, acquisition, PDR, heading, radio/magnetic corrections, fusion, map
  constraints, calibration and evaluation.
- **DECISION:** shortest proposed baseline is one legal single-floor metric map,
  deterministic cross-platform acquisition/replay, PDR, then map/radio/magnetic
  ablations. Wi-Fi is optional and Android-only; no production stack is selected.
- **FACT:** official Android/iOS constraints and runtime cloud/connectivity checks are
  recorded in [platform constraints](PLATFORM_CONSTRAINTS.md) and
  [cloud setup](CODEX_CLOUD_SETUP.md). External smart-HTTP clones were blocked by
  GET/HEAD/OPTIONS-only networking, but GitHub REST GET evidence was available.
- **FACT:** no production app, recurring automation, dataset, measurement or third-
  party code was added. No reusable component is a production dependency.
- **PROPOSED:** E001 acquisition integrity, E002 surveyed PDR, and E003 map/correction
  ablation are registered in the [experiment log](../experiments/EXPERIMENT_LOG.md).

## Validation performed for this audit

- Required canonical files and source links were reviewed.
- Relative Markdown links and local file targets were checked programmatically.
- External source URLs were checked with HTTP GET/HEAD where permitted.
- `git diff --check` was run before commit.
- **NOT TESTED:** candidate builds, transitive dependencies, device APIs, sensor/radio
  behavior, venue accuracy, battery, background operation, iOS signing and prior
  local experiments. Repository activity is not TURN validation.

## Exact next steps

1. Team selects a legal, non-sensitive floor plan; records scale/checkpoints/rights;
   supplies device/OS inventory and provisional accuracy, latency, battery and survey
   effort targets.
2. Team runs **E001** on at least one Android phone and one iPhone using a reviewed
   session manifest; raw captures stay immutable outside Git and are referenced by
   SHA-256. Record unavailable permissions/sensors as results.
3. After E001 passes its integrity gates, implement only the deterministic replay and
   simple baselines needed for **E002**. Do not start product UI scaffolding.
4. Revisit MapLibre/native UI, fusion and observation choices only after E002/E003
   evidence. Re-check pinned dependencies, license/transitive terms and minimum OS at
   integration time.

## Blockers / unknowns

Target venue and floor-plan rights/format, team owners, phone models/minimum OS,
background-navigation promise, initial-position UX, accessibility rules, offline
requirement, beacon budget, deadline and numeric acceptance thresholds remain
unconfirmed. Team-reported prior mapping/PDR/magnetic/Wi-Fi work has not been supplied
or verified. These missing physical inputs—not a lack of unattended web research—are
the current bottleneck.

## Execution model recommendation

**PROPOSED:** keep one capable agent accountable for contracts and evidence, and issue
bounded specialist reviews for native acquisition, survey design and statistics when
their inputs exist. Do not schedule a daily loop now. Consider a recurring replay
check only after a versioned dataset and one deterministic replay command exist.
