# ADR-0001: Repository context and reuse-first workflow
Date: 2026-09-12
Status: ACCEPTED (user-directed setup)

Context: TURN spans mapping, mobile sensing and localization. Chat memory and disconnected agent notes are insufficient for reconstructing state.
Decision: keep a short AGENTS.md as an index and maintain canonical brief, requirements, state, architecture, constraints, reuse, decisions and experiment records. Audit existing implementations before new code. Do not scaffold production code during this phase.
Alternatives: chat-only memory; a single large instruction file; build all components from scratch.
Consequences: changes must include relevant documentation; unknown facts stay explicit; third-party code requires license and compatibility review. This reduces context loss but cannot guarantee perfect memory.
