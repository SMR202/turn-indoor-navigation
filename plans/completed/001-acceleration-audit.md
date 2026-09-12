# Plan 001 — TURN Acceleration Audit
Status: COMPLETE (2026-09-12)
Scope: research and documentation only; no production scaffolding.

1. Read AGENTS.md and all canonical docs. Preserve unknowns.
2. Research current primary sources and actual open-source repos for floor-plan extraction/onboarding, map rendering/POIs/floors, routing, sensor logging, step detection/PDR, heading, magnetic fingerprints, BLE, optional Android Wi-Fi, fusion, map constraints, cross-device calibration and evaluation.
3. Inspect strongest candidates (including jagsnapuri/positionme-indoor-positioning and ahmadabdelqader/Indoor-Localization-PDR as unverified leads). Verify license files, exact revisions, maintenance, dependencies, platform compatibility, reproducibility and data/weight rights. Do not assume a GitHub demo works.
4. Populate research/REUSE_REGISTRY.md and research/ACCELERATION_AUDIT.md. Classify every subsystem ADOPT/ADAPT/IMPLEMENT/EXPERIMENT with reasons, alternatives, effort ranges and explicit uncertainty.
5. Verify Apple/Android restrictions in docs/PLATFORM_CONSTRAINTS.md using official sources.
6. Recommend shortest credible path to one integrated venue baseline, identify critical dependencies and design the next three measurable experiments with hardware needs and ground truth.
7. Compare a single capable agent, bounded specialist tasks and daily automation. Recommend based on current bottlenecks; do not enable recurring work without a separate request.
8. Update CURRENT_STATE.md and relevant ADRs. Validate local links and git diff --check. Commit findings on an audit branch and open a reviewable PR where supported; record actual checks and untested claims.
9. Move this plan to completed only when findings are recorded. Update links when moving.

Done: sourced recommendations and actionable experiment protocols committed; no invented measurements, no app scaffold.

## Completion record

- Sourced findings and pinned candidates: [audit](../../research/ACCELERATION_AUDIT.md)
  and [reuse registry](../../research/REUSE_REGISTRY.md).
- Official mobile constraints: [platform constraints](../../docs/PLATFORM_CONSTRAINTS.md).
- Proposed (not executed) experiments: [experiment log](../../experiments/EXPERIMENT_LOG.md).
- Runtime checkout/network evidence: [cloud setup](../../docs/CODEX_CLOUD_SETUP.md).
- No architecture decision was accepted: the replay-first path and component choices
  remain proposals until team inputs and measurements exist, so no new ADR was needed.
