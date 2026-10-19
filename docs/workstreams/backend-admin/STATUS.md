# backend-admin workstream

Last meaningful update: 2026-10-19 (multi-floor, beacon health, team)

## Objective

Let venue owners author and publish trusted venue packages, and let TURN staff run onboarding, with persistence and roles.

## Current state / what changed

- `apps/api` (Hono + `node:sqlite`, `npm run api`, port 8090, data in ignored `work/api-data`): organisations, users with roles (staff, owner, editor), venues, draft/published/archived versions, a publish gate (schema, wall crossings, reachability, at least one destination), Floor GeoJSON import, place content, beacon layouts (with a model reference RSSI until calibrated), anonymous visitor events, analytics, an Ops pipeline with accuracy entries, and a public catalog/package with ETag.
- `apps/console` (Vite + React, `npm run console`, port 5173): TURN Studio (go-live checklist, map, import, QR entry markers, places, beacon planner with simulated coverage, publish/history/QR printing, analytics) and TURN Ops (pipeline, accuracy entry, organisations).
- Seed: a fictional demo customer and venue whose analytics are labelled sample data. The private home venue loads only from ignored `work/private/venue.json` and is served on the local network only (`private-lan`).

October 19 additions: multi-floor import (`mergeFloor`, automatic stairs/lift links between neighbouring levels), beacon health reports and per-beacon status, team management (owners add/remove editors and owners), venue settings with a brand colour, and the two-floor fictional demo (existing dev databases upgrade on start). `npm run platform` starts API, Studio and the visitor app's Metro server together.

## Validation performed

`apps/api/src/app.test.ts` (10 tests: roles, catalog/ETag, import → refused publish → valid publish, events → analytics, validation, content-only publish, two-floor import, beacon health, team) and `seed.test.ts` (demo upgrade). Console typecheck and production build. Browser-pane walkthrough of sign-in, overview, map import by drag-and-drop, beacon planner, analytics and the Ops pipeline. No deployment, load or security testing.

## Important decisions / dependencies

[Plan 003](../../../plans/active/003-product-platform.md), [map import format](../../MAP_IMPORT_FORMAT.md), [reuse registry](../../../research/REUSE_REGISTRY.md). Development sign-in is passwordless and must be disabled (`TURN_DEV_AUTH=off`) outside a trusted LAN.

## Known issues / attempted approaches

No real authentication, hosting, backups or migrations. Floors must share one coordinate frame. Beacon health depends on visitors using live guidance with usage sharing on; nothing reports battery yet. Analytics are events, not positions; no retention policy yet.

## Next action

Decide hosting and authentication in an ADR; then on-site beacon calibration upload from the test app (calibratedAt) once the commercial beacons arrive.
