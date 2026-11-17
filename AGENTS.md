# Deck Studio — Agentic Development Life Cycle (ADLC) Rules

Whenever working in this repository (`oktayibis/deck-studio`), follow the **ADLC (Agentic Development Life Cycle)** workflow defined in [.agents/skills/adlc/SKILL.md](file:///Users/oktay/Projects/deck-studio/.agents/skills/adlc/SKILL.md) and keep [docs/SAAS_ROADMAP.md](file:///Users/oktay/Projects/deck-studio/docs/SAAS_ROADMAP.md) synchronized with GitHub Issues and Pull Requests.

## 1. Cost & Quota-Optimal Model Routing (`Gemini 4 Hydrogen` via Swarm)

To preserve `Gemini 4 Argon (High)` weekly quota (`56%`), delegate implementation, testing, and GitHub CLI tasks to **Gemini 4 Hydrogen** (`100%` fast-resetting quota) via the `swarm` tool:

| Tier | `swarm` Model Name | Display Name | Tasks Assigned |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Ultra-Light)** | `gemini-4-hydrogen-low` | **Gemini 4 Hydrogen (Low)** | `gh issue` / `gh pr` CLI operations, label & milestone syncing, updating `docs/SAAS_ROADMAP.md`, CI config files. |
| **Tier 2 (Fast Coder / QA)** | `gemini-4-hydrogen-medium` / `gemini-4-hydrogen-high` | **Gemini 4 Hydrogen (Medium / High)** | Implementing scoped GitHub Issues, UI components, backend endpoints, writing & running `npm test` / `npx tsc --noEmit` / `npm run check`. |
| **Tier 3 (Deep Multi-Module Engineering)** | `gemini-4-argon-high` | **Gemini 4 Argon (High)** | Deep multi-module engineering, database adapters (Issue #3), security/auth architecture, complex cross-module refactors, and coordinator orchestration. |

> **Workspace Note**: Always use default `workspace: "inherit"` (do not pass `workspace: "share"`), and assign strictly non-overlapping files to concurrent workers.

## 2. GitHub-Driven Workflow (`gh` CLI)

1. **Every task maps to a GitHub Issue**: Check open issues with `gh issue list` and track status in [docs/SAAS_ROADMAP.md](file:///Users/oktay/Projects/deck-studio/docs/SAAS_ROADMAP.md).
2. **Automated Quality Gate before PR / Commit**:
   - `npx tsc --noEmit` (TypeScript domain schema check)
   - `npm test` (End-to-end test suites)
   - `npm run check` (Headless Chromium 8-point WCAG AA & geometry check)
3. **Pull Request & Roadmap Sync**: Open PRs or link commits with `Closes #<N>`, post test output, and update `docs/SAAS_ROADMAP.md`.
