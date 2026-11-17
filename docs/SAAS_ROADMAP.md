# Deck Studio — SaaS Architecture, ADLC Plan & Living Roadmap

This document is the **single source of truth** inside the repository for tracking Deck Studio's SaaS architecture, development phases, model-tiered ADLC workflow, and GitHub Issues / Pull Requests.

---

## 1. ADLC (Agentic Development Life Cycle) & Cost Strategy

To move fast while keeping AI/LLM token costs low, all development work is split across three model tiers and tracked via GitHub Issues & PRs:

| Tier | Model | Subagent | Cost Profile | Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | `flash_lite` | `adlc-pm`, `adlc-qa` | **$ (Lowest)** | `gh issue` / `gh pr` management, updating `docs/SAAS_ROADMAP.md`, running `npm test` / `tsc` / `npm run check`. |
| **Tier 2** | `flash` | `adlc-coder` | **$$ (Fast)** | Implementing scoped features & UI improvements on `feat/issue-<N>-*` branches, writing unit & Playwright tests. |
| **Tier 3** | `pro` / `inherit` | Coordinator | **$$$ (Lead)** | System architecture, multi-tenant data modeling, UX direction, and final PR review before merge. |

---

## 2. Completed Baseline (Milestone 0 — Core MVP)

| Component | Status | Key Files |
| :--- | :--- | :--- |
| **Office `.pptx` / `.potx` / `.thmx` Brand Extractor (`DanishCVI`)** | ✅ Done | `src/services/brand-extractor.js` |
| **Dependency-Free `1600×900` Deck Engine & Presenting Tools** | ✅ Done | `src/engine/deck-engine.css`, `src/engine/deck-engine.js` |
| **Headless Chromium 8-Point Brand & WCAG Checker (+ Negative Fixture)** | ✅ Done | `src/services/checker.js`, `src/services/broken-fixture.js` |
| **Story-First AI Agent Loop + Self-Healing Check-and-Fix** | ✅ Done | `src/services/agent.js`, `src/services/llm-gateway.js` |
| **Configurable SaaS Quotas (`2/4/16` Brands · `4/20/100` Daily Decks) & Cost Lab** | ✅ Done | `src/services/storage.js` |
| **Offline `.zip` & Landscape `.pdf` Exporter + MCP Server** | ✅ Done | `src/services/exporter.js`, `src/mcp/server.js` |
| **Warm Nordic Creative Studio UI Redesign** | ✅ Done | `src/public/index.html`, `src/public/styles.css`, `src/public/app.js` |

---

## 3. Active SaaS Backlog (Tracked via GitHub Issues)

| Issue | Phase | Title | Assigned Model Tier | Area | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#1** | Phase 1 (UX & Studio) | Interactive Slide Inspector & Per-Slide Visual Editor (change slide layout type, edit headline/notes inline without full rebuild) | `model:flash` | `area:ui` | ✅ Done |
| **#2** | Phase 1 (UX & Studio) | Step-by-Step Brand Onboarding Wizard for new brands (e.g. `DanishCVI` 3-step guided setup: Upload → Swatches & Fonts → Live Preview) | `model:flash` | `area:ui`, `area:brand-kit` | ✅ Done |
| **#3** | Phase 2 (SaaS Core) | Database Adapter (SQLite / PostgreSQL via Drizzle) replacing local JSON state while preserving 1-command local mode | `model:flash` | `area:saas` | ✅ Done |
| **#4** | Phase 2 (SaaS Core) | Quota Paywall & Upgrade Modal UX when hitting `2/4/16` Brand limit or `4/20/100` Daily Deck limit + CSV Cost Export | `model:flash-lite` | `area:saas`, `area:ui` | ✅ Done |
| **#5** | Phase 3 (AI & Vision) | Brand Guidelines PDF & Website URL Crawler (extract colour palette, typography, and brand tone from URLs/PDFs) | `model:flash` | `area:brand-kit`, `area:agent` | ✅ Done |
| **#6** | Phase 4 (CI/CD & Ops) | GitHub Actions CI Pipeline running `adlc-cli.sh verify` (`tsc` + `npm test` + Playwright checker) on every Pull Request | `model:flash-lite` | `area:saas` | ✅ Done |

---

## 4. How to Run the ADLC Workflow

```bash
# 1. Check current GitHub Issues, PRs, and branch state
./.agents/skills/adlc/scripts/adlc-cli.sh status

# 2. Run the full automated quality gate before opening or merging a PR
./.agents/skills/adlc/scripts/adlc-cli.sh verify
```
