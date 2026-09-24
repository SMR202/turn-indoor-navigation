# TURN project state

Updated: 2026-09-24.

## Current milestone

M0 foundation and initial synthetic M1 slice implemented and locally checked. Browser demo works; physical native smoke remains pending. No pilot deployment or measured localization.

## Capabilities

npm/TypeScript monorepo; Expo reference app; versioned runtime contracts; synthetic metric floor/POIs/graph/anchors; local destination routing from a fixed entrance; durable workstream context.

## Active workstreams

[Foundation](workstreams/foundation/STATUS.md), [mobile](workstreams/mobile/STATUS.md), [venue packages](workstreams/venue-packages/STATUS.md), [routing](workstreams/routing/STATUS.md).
[Mapping](workstreams/mapping/STATUS.md), [positioning](workstreams/positioning/STATUS.md), [PDR](workstreams/pdr/STATUS.md), [backend/admin](workstreams/backend-admin/STATUS.md) and [Centaurus](workstreams/centaurus-integration/STATUS.md) have explicit dependencies and next actions.

## Gaps

No QR scanning, live acquisition, PDR/fusion, replay command, package updater, real venue, native binary validation, backend/admin or published SDK. Phone OS/capabilities, floor rights, partner app access and numerical targets remain unknown.
Dependency audit: 13 moderate transitive findings, no high/critical; see [reuse registry](../research/REUSE_REGISTRY.md). Compatible remediation is required before shipping/external-input expansion.

## Next goal

Validate M1 on Android/iOS; implement M2: scan a versioned QR anchor ID, resolve against loaded venue/revision, produce anchored pose and reroute. Handle wrong/stale/unknown codes and camera denial. Sensor-integrity work proceeds independently.

## Automation

GitHub Actions runs on push/PR; the Linux run passed for implementation commit a68071e. No recurring agent loop, deployment or monitor. Validation and published branch instructions: [foundation handoff](workstreams/foundation/STATUS.md).
