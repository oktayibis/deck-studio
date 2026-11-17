---
name: adlc
description: >-
  Agentic Development Life Cycle (ADLC) workflow for developing and maintaining
  Deck Studio SaaS using GitHub CLI (gh), repository-tracked plans (docs/SAAS_ROADMAP.md),
  and Gemini 4 Hydrogen swarm workers (gemini-4-hydrogen-low/medium/high/xhigh).
  Activate this skill whenever planning features, managing GitHub Issues/PRs, or delegating coding/QA tasks.
---

# ADLC — Agentic Development Life Cycle Skill (Hydrogen Swarm Edition)

This skill standardizes how features, UI improvements, and bug fixes are planned, built, verified, and shipped in `oktayibis/deck-studio` while preserving **Gemini 4 Argon** quota by delegating execution to **Gemini 4 Hydrogen** (`gemini-4-hydrogen-low`, `gemini-4-hydrogen-medium`, `gemini-4-hydrogen-high`, `gemini-4-hydrogen-xhigh`) via `swarm`.

---

## 1. Why `swarm` with `Gemini 4 Hydrogen` Instead of `invoke_subagent` (`flash`)

- `invoke_subagent` only exposes legacy enum aliases (`flash_lite`, `flash`, `pro`).
- `swarm` (`action: "add"`) accepts exact model IDs:
  - `gemini-4-hydrogen-low` — Fast CLI, GitHub issues/PRs, CI YAML, docs updates.
  - `gemini-4-hydrogen-medium` — Standard QA & verification runs.
  - `gemini-4-hydrogen-high` — Scoped single-module feature & UI implementation.
  - `gemini-4-argon-high` — Deep multi-module engineering, database & multi-tenant architecture, and coordinator orchestration.
- Always keep `workspace: "inherit"` (the default) and partition work so concurrent workers own strictly disjoint files.

---

## 2. Standard End-to-End ADLC Loop

1. **Plan & Partition (Argon Coordinator)**:
   - Inspect open GitHub Issues (`./.agents/skills/adlc/scripts/adlc-cli.sh status`).
   - Partition work into non-overlapping file slices.
2. **Spawn Hydrogen Swarm Workers**:
   - Set swarm title (`swarm{action:"title", title:"..."}`).
   - Add `monitor` worker (`swarm_monitor` skill).
   - Add Hydrogen workers (`model: "gemini-4-hydrogen-low"` or `"gemini-4-hydrogen-high"`) with clear file ownership and completion criteria.
3. **Automated Quality Gate (`adlc-cli.sh verify`)**:
   - `npx tsc --noEmit`
   - `npm test`
   - `npm run check`
4. **GitHub Issue / PR & Roadmap Sync**:
   - Close/link GitHub Issues (`Closes #<N>`), push to `origin`, and update `docs/SAAS_ROADMAP.md`.
