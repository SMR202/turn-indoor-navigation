# foundation workstream

Last meaningful update: 2026-09-24

## Objective

Reproducible lightweight monorepo and durable context.

## Current state / what changed

Root package.json, lockfile, scripts, CI; ADR-0002/0003. M0 and a working synthetic M1 slice added. Historical audit retained, research-only restriction superseded; nine concise workstreams and one project state support fresh-session handoff. Working branch: codex/product-foundation.

## Validation performed

- Node 24.19.0 / npm 10.9.0 on Windows: fresh `npm ci` passed using committed lockfile.
- `npm run check`: TypeScript core/mobile, 13 tests across 3 files, ESLint, Prettier and 127 local Markdown file/directory targets passed. Link check excludes section anchors/external URL liveness.
- `expo-doctor`: 21/21 checks passed.
- `expo export --platform web`, then `expo export --platform all`: web and Android/iOS Hermes bundles exported successfully. This is not native binary compilation or phone execution.
- Browser preview: initial screen, all three routes (24/19/19 m), clear route, SVG geometry and 390px viewport inspected; no captured console errors/warnings.
- `adb devices`: no devices attached. No native phone, camera/sensor, battery, offline cold-start or real-venue tests performed.
- `npm audit`: 13 moderate transitive findings, zero high/critical. Evidence/disposition in reuse registry; not fixed by unsafe forced major downgrades.
- GitHub workflow configured; no hosted result claimed. No deployed service or recurring automation.

## Important decisions / dependencies

[Architecture](../../ARCHITECTURE.md), [roadmap](../../ROADMAP.md), [reuse registry](../../../research/REUSE_REGISTRY.md), [platform ADR](../../../decisions/0002-product-platform-foundation.md), [venue ADR](../../../decisions/0003-venue-contracts-and-offline-navigation.md).

## Known issues / attempted approaches

No pilot/device measurements. System Node 22.12 and its npm launcher failed engine checks; used available Node 24.19 explicitly. Developers should install the .nvmrc version normally. Expo's automatic peer resolution initially selected incompatible worklets; pinned SDK-recommended Reanimated 4.5.1 / Worklets 0.10.1 and Doctor passed. ESLint 9 was replaced after its deprecation warning. No machine-specific runtime paths are committed. No native source trees or credentials generated.

## Next action

Run `npm ci`, `npm run check`, `npm run mobile` on Node 24; smoke-test M1 on Android/iOS. Next code slice: M2 QR adapter + pure anchor-to-pose resolution and invalid/denied/recovery cases. Keep sensor capture/E001 separate from this product dependency.
