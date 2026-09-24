# Current state
Updated: 2026-09-24
Phase: first acceleration audit complete; before production implementation.

## Repository orientation review — 2026-09-24

- **FACT:** Reviewed tracked files, project requirements, architecture, audit, reuse registry, experiment protocols and device inventory. The checkout contains documentation and templates only; no executable acquisition/replay tools or GitHub Actions workflows exist.
- **FACT:** No device tests, candidate builds or new external-source verification were performed in this review. The audit remains dated 2026-09-12; its former cloud networking restrictions are historical, not established constraints of this local workspace.
- **DECISION:** The fresh-start instruction governs older references to inventorying/importing team code. Corrected the active-plan index accordingly; historical audit text remains an audit record.
- **PROPOSED:** Next engineering task is to prepare a bounded E001 capture/export and integrity-check workflow. Full PDR replay follows real sample/schema verification. E001 is not ready for team execution.
- **FACT:** Outstanding inputs remain installed phone OS versions, venue/map rights and numeric acceptance targets. No automation was configured during this review.

## Established

- **FACT:** The first sourced [acceleration audit](../research/ACCELERATION_AUDIT.md)
  and pinned [reuse registry](../research/REUSE_REGISTRY.md) cover mapping, rendering,
  routing, acquisition, PDR, heading, radio/magnetic corrections, fusion, map
  constraints, calibration and evaluation.
- **PROPOSED:** shortest baseline is one legal single-floor metric map,
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
   confirms installed OS versions from [device inventory](DEVICE_INVENTORY.md) and provisional accuracy, latency, battery and survey
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

Target venue and floor-plan rights/format, team owners, exact team-phone variants/installed OS/minimum supported OS,
background-navigation promise, initial-position UX, accessibility rules, offline
requirement, beacon budget, deadline and numeric acceptance thresholds remain
unconfirmed. The user explicitly directed a fresh start with this repository. Previous local/team implementations and logs are excluded; do not request, inspect or import them. Physical device measurements and venue inputs are still pending.

## Execution model recommendation

**PROPOSED:** keep one capable agent accountable for contracts and evidence, and issue
bounded specialist reviews for native acquisition, survey design and statistics when
their inputs exist. Do not schedule a daily loop now. Consider a recurring replay
check only after a versioned dataset and one deterministic replay command exist.

## Publication and user handoff
The cloud audit is published as https://github.com/SMR202/turn-indoor-navigation/pull/1.
Cloud task: https://chatgpt.com/codex/cloud/tasks/task_e_6aa4fb6dd1348323a283e37c467964f6
Fresh-start instruction (2026-09-12): build from this repository's committed knowledge base and audit; exclude prior implementations and logs. Reuse of suitable licensed external components remains in scope.
User-reported phones are recorded in [device inventory](DEVICE_INVENTORY.md). Next user input: installed OS versions for the three user-owned phones. Engineering must prepare the capture/replay tools before asking the team to run E001; the experiment is not yet ready to execute.
