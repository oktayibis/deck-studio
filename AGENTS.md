# Deck Studio — Agentic Development Life Cycle (ADLC) Rules

Whenever working in this repository (`oktayibis/deck-studio`), follow the **ADLC (Agentic Development Life Cycle)** workflow defined in [.agents/skills/adlc/SKILL.md](file:///Users/oktay/Projects/deck-studio/.agents/skills/adlc/SKILL.md) and keep [docs/SAAS_ROADMAP.md](file:///Users/oktay/Projects/deck-studio/docs/SAAS_ROADMAP.md) synchronized with GitHub Issues and Pull Requests.

## 1. Cost-Optimal Subagent Model Routing (Mandatory)

Never use expensive `pro` models for routine tasks that `flash_lite` or `flash` can execute:

| Tier | `invoke_subagent` Model | Subagent Role | Tasks Assigned |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Ultra-Low Cost)** | `Model: "flash_lite"` | `adlc-pm` / `adlc-qa` | `gh issue` / `gh pr` commands, label & milestone syncing, updating `docs/SAAS_ROADMAP.md`, running `npm test` / `npx tsc --noEmit` / `npm run check`, formatting changelogs. |
| **Tier 2 (Fast Builder)** | `Model: "flash"` | `adlc-coder` | Implementing scoped GitHub Issues on `feat/issue-<N>-*` branches (`Workspace: "share"`), writing unit & Playwright tests, UI component updates, opening PRs. |
| **Tier 3 (Lead Architect)** | `Model: "inherit"` / `pro` | Main Coordinator | Architecture design, multi-tenant security & quota modeling, resolving cross-cutting bugs, final PR review before merge. |

## 2. GitHub-Driven Workflow (`gh` CLI)

1. **Every task maps to a GitHub Issue**: Check open issues with `gh issue list` and track status in [docs/SAAS_ROADMAP.md](file:///Users/oktay/Projects/deck-studio/docs/SAAS_ROADMAP.md).
2. **Branch per Issue**: Work on `feat/issue-<N>-<short-slug>` or `fix/issue-<N>-<short-slug>`.
3. **Automated Quality Gate before PR Merge**:
   - `npx tsc --noEmit` (TypeScript domain schema check)
   - `npm test` (7 end-to-end test suites including security, `.pptx` extraction, `2/4/16` & `4/20/100` quotas, and Playwright dock tests)
   - `npm run check` (Headless Chromium 8-point WCAG AA & geometry check)
4. **Pull Request & Roadmap Sync**: Open PRs with `gh pr create`, link `Closes #<N>`, post test output, and update `docs/SAAS_ROADMAP.md`.
