# TURN — indoor navigation
TURN is an early-stage indoor navigation project for malls and buildings, targeting Android and iOS. This repository is its permanent knowledge base and engineering workspace. No production app is scaffolded.

## Start here
1. [Agent instructions](AGENTS.md)
2. [Project brief](docs/PROJECT_BRIEF.md)
3. [Current state and next actions](docs/CURRENT_STATE.md)
4. [Requirements](docs/REQUIREMENTS.md)
5. [Proposed architecture](docs/ARCHITECTURE.md) and [platform constraints](docs/PLATFORM_CONSTRAINTS.md)
6. [Decisions](decisions/README.md), [reuse registry](research/REUSE_REGISTRY.md) and [acceleration audit](research/ACCELERATION_AUDIT.md)
7. [Experiments](experiments/EXPERIMENT_LOG.md), [active plans](plans/active/), [completed acceleration audit](plans/completed/001-acceleration-audit.md)
8. [Dataset policy](datasets/README.md) and [cloud setup](docs/CODEX_CLOUD_SETUP.md)

## Engineering loop
Read current state → choose the biggest uncertainty → research/reuse → run a reproducible experiment → record evidence → decide next action. AI handles research, bounded implementation and replay analysis; the team supplies hardware testing and ground truth. Durable context depends on keeping these files updated, not on perfect chat recall.
