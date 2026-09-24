# TURN — indoor navigation platform

TURN powers its own reference app and future venue apps/SDK integrations. Centaurus is a prospective first pilot, not a core dependency. Product slices and measured positioning research progress together.

## Start and resume

[AGENTS](AGENTS.md) → [project state](docs/PROJECT_STATE.md) → relevant [workstream](docs/workstreams/README.md). See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), [handoff](docs/HANDOFF.md) and [ADRs](decisions/README.md).

## Setup

Use Node **24.19.0** (.nvmrc), npm 10/11 and Git. No secrets/database/services required.

```sh
git clone https://github.com/SMR202/turn-indoor-navigation.git
cd turn-indoor-navigation
npm ci
npm run check
npm run web
```

Existing checkout: pull your working branch, then `npm ci`. Commit the root lockfile after dependency changes; do not create separate app lockfiles. [.env.example](.env.example) documents zero-configuration setup.

| Command              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `npm run mobile`     | Start Expo; open on compatible Expo Go device     |
| `npm run web`        | Browser preview                                   |
| `npm run export:web` | Static bundle in apps/mobile/dist                 |
| `npm run check`      | Types, unit tests, lint, format, local docs links |
| `npm test`           | UI-independent contracts/venue/routing tests      |
| `npm run format`     | Format active code/docs                           |

The app bundles a fictional metric floor and three POIs. Choose a destination to display a local route from a fixed entrance. The marker is a demo start, not live tracking. QR/PDR are not implemented.

## Structure

- apps/mobile: Expo reference client.
- packages/contracts: versioned observations, poses, anchors, routes.
- packages/venue-model: runtime-validated venue and original synthetic fixture.
- packages/routing: pure local routing.
- docs/workstreams: durable feature context.
- research, experiments, decisions, datasets: retained evidence/policies.
- scripts: validation helpers. Other modules are added with executable work.

[Development setup](docs/DEVELOPMENT.md) covers devices, native builds and future migrations. Backend/admin are not implemented and have no run command or required server; see [status](docs/workstreams/backend-admin/STATUS.md). [E001–E003](experiments/EXPERIMENT_LOG.md) remain proposed physical experiments, independent of static product progress. Read [dataset policy](datasets/README.md) before collection. The [original audit](research/ACCELERATION_AUDIT.md) remains historical evidence.
