# Lightweight handoff

Git is the durable synchronization mechanism. Read AGENTS → PROJECT_STATE → relevant STATUS → code/ADRs. [Codex capabilities](CODEX_CONTEXT.md) are optional.

Before ending substantial feature work update only its STATUS:

1. Current state, objective and relevant modules.
2. What changed and actual validation commands/results.
3. Important decisions/dependencies and links.
4. Known issues/blockers/meaningful rejected approaches.
5. Exact next action and last meaningful update.

Update PROJECT_STATE only for global changes. ADRs cover consequential decisions. Don't repeat implementation details already clear in code/tests. Commit related changes; publish the branch when authorized. Another computer fetches that branch and runs npm ci. Unpushed work is not synchronized.

Resume prompt: “Read AGENTS.md, docs/PROJECT_STATE.md and docs/workstreams/<feature>/STATUS.md. Inspect related code/ADRs, run relevant checks and implement the recorded next action.”

No raw chats/session databases in Git. Task links are optional; distilled context must suffice.
