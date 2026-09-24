# TURN agent entry point

TURN is an approved indoor-navigation platform in active implementation. Research enough to make good decisions, then build executable, testable vertical slices.

## Start here

Read [README](README.md) → [PROJECT_STATE](docs/PROJECT_STATE.md) → relevant [workstream STATUS](docs/workstreams/README.md), then related code/ADRs. Check [reuse registry](research/REUSE_REGISTRY.md) before a substantial subsystem. The repository—not previous chat memory—is the durable source of context. Never invent missing decisions or results.

## Build rules

- Product implementation is expected. Deliver usable end-to-end slices while scientific evaluation improves accuracy in parallel.
- TURN is independent of Centaurus; client/venue specifics belong in versioned data/configuration.
- Separate acquisition → normalized observations → positioning/fusion → pose → routing → UI. Algorithms never belong in React screens.
- Live and replay share contracts. Replay is engineering tooling, not the product user flow.
- Core navigation works locally with a loaded venue. Feature-detect sensors/permissions; Wi-Fi remains optional Android-only.
- Prefer ADOPT > ADAPT > IMPLEMENT when compatible and licensed; EXPERIMENT when evidence is needed. Time-box research to serious candidates; record exact revision/license and integration risks.
- Use explicit units, coordinate frames, monotonic session time, uncertainty and failure states.
- Add real module boundaries, not empty packages or speculative services. ADRs cover consequential decisions only.
- Label uncertain claims appropriately: FACT, PROPOSED, DECISION, EXPERIMENT RESULT. Synthetic tests never establish venue accuracy.

## Validate and hand off

Run relevant tests/typecheck/lint; root `npm run check` also validates formatting/docs links. `npm run export:web` checks bundling. Native/device validation is separate.
After substantial work update the affected STATUS with current state, changes, actual validation, decisions, issues and exact next action. Update PROJECT_STATE only for global changes; ADR/reuse/experiment records only when relevant. Commit logically related work. See [handoff](docs/HANDOFF.md).

Preserve historical research and clearly supersede old restrictions. Do not commit raw chats, secrets, sensitive partner material, private plans or identifiable movement traces. Raw captures stay immutable outside Git with hashes/manifests. Prior team code/logs remain excluded; licensed external reuse is welcome.

Finish with completed work, validation/limitations, what is actually automated and the next action. Never imply monitoring or physical tests that did not happen.
