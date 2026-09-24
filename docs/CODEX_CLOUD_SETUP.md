# Codex cloud setup record
Historical environment record. Current local setup: [DEVELOPMENT.md](DEVELOPMENT.md). The old network restrictions and no-dependencies status below are not current workspace requirements.
Environment configuration observed in saved cloud UI: 2026-09-12.

Repository: <https://github.com/SMR202/turn-indoor-navigation>

Environment: TURN Research

Environment URL: <https://chatgpt.com/codex/cloud/settings/environment/6aa4fa3ec1388191a2c973744f990d09>

Runtime: universal; automatic setup; caching enabled.

Configured checkout directory: `/workspace/turn-indoor-navigation`.
Agent internet: ON; Common dependencies plus `github.com`, `api.github.com`,
`raw.githubusercontent.com`, `codeload.github.com`, `developer.apple.com`,
`developer.android.com`, `source.android.com`, `arxiv.org`, `export.arxiv.org`,
`doi.org`, `maplibre.org`, `networkx.org`, `readthedocs.io`,
`developers.openai.com`, and `learn.chatgpt.com`.

Allowed methods: GET, HEAD, OPTIONS.
Environment variables/secrets: none configured. No custom setup/maintenance script
or production dependencies. Automatic code reviews were disabled in the form.

Another same-repository environment was visible; TURN Research at the exact URL
above is intended. No other environment was deleted.

## First-task runtime verification — 2026-09-12 UTC

| Check | Actual result |
|---|---|
| Checkout | `pwd` returned `/workspace/turn-indoor-navigation`; `git status --short --branch` returned `## work` (clean); no remotes were printed by `git remote -v`. The audit then created `audit/first-acceleration-audit`. |
| GitHub HTTPS | `curl -LIsS --max-time 20 https://github.com` returned HTTP 200. GitHub REST API GETs returned repository metadata, commit, README and license data. |
| Android official docs | The same curl check for `https://developer.android.com` returned HTTP 200; GETs for sensors, Wi-Fi and Bluetooth pages returned HTTP 200. |
| Apple official docs | The same curl check for `https://developer.apple.com` returned HTTP 200; documentation pages and Apple documentation JSON were retrievable with GET. |
| External Git checkout limitation | Smart-HTTP `git clone --filter=blob:none --no-checkout` attempts returned HTTP 403 at ref discovery for all inspected candidates. This is consistent with the configured GET/HEAD/OPTIONS-only environment because Git smart HTTP requires POST. The audit used GitHub REST GET endpoints and pinned web trees instead; external builds/transitive scans were not performed. |
| Credentials/private data | None used or found. No raw recordings, private maps or external code were copied into the repository. |

**FACT:** bootstrap commit `dc47d5b88b38329ff3f534bcbc014ef099df5128`
was the documented starting revision. **FACT:** this runtime checkout has no Git
remote configured, so GitHub publication cannot be inferred from local commits.

The official cloud-configuration references checked at bootstrap were
[cloud environments](https://learn.chatgpt.com/docs/environments/cloud-environment)
and [internet access](https://learn.chatgpt.com/docs/cloud/internet-access).
The first task, [Acceleration Audit](../plans/completed/001-acceleration-audit.md),
completed its desk-research scope; physical experiments remain proposed.

## Publication follow-up
Cloud task: https://chatgpt.com/codex/cloud/tasks/task_e_6aa4fb6dd1348323a283e37c467964f6
Published review: https://github.com/SMR202/turn-indoor-navigation/pull/1
Bootstrap clone checks verified 22 files and internal links. Subsequent main-branch setup/status commits through 6f124525183daa2198883737d320c5a1f574163e recorded successful GitHub GET research and the transport limitation; this audit supplies the completed runtime evidence above.
