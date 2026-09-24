# Optional Codex context

Checked 2026-09-24 using installed CLI help and available desktop tool schemas; [official CLI docs](https://learn.chatgpt.com/docs/codex/cli) corroborate resume support.

| Need                | Capability / boundary                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Continue            | Installed codex resume supports picker, session ID, --last and --all; fork also exists. Help inspected; no task resumed here.      |
| Inspect prior tasks | Desktop exposes list_threads/read_thread with summaries/project context. Host/account/tool availability varies.                    |
| Reference/share     | Desktop supports IDs, navigation and immutable share links. Store optional references beside distilled context, not instead of it. |
| Export summaries    | read_thread can return summaries. No portable automatic export/sync guarantee established; write STATUS/ADRs.                      |
| Multiple devices    | Handoff/remote endpoints exist for connected hosts; universal automatic local-chat synchronization was not verified. Use Git.      |

The official app-features URL redirected to a [general features page](https://learn.chatgpt.com/docs/features) without establishing sync guarantees. No private session files were read, no chats shared, no migrations/automations configured.

New machine: fetch/checkout working branch, npm ci, read AGENTS/PROJECT_STATE/STATUS. A fresh conversation is enough.
