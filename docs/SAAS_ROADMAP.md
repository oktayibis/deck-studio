# Deck Studio — SaaS Architecture, ADLC Plan & Living Roadmap

This document is the **single source of truth** inside the repository for tracking Deck Studio's SaaS architecture, development phases, model-tiered ADLC workflow, and GitHub Issues / Pull Requests.

For the full product vision, user journeys, and architectural specification, see **[docs/PRODUCT_VISION_AND_ARCHITECTURE.md](./PRODUCT_VISION_AND_ARCHITECTURE.md)**.

---

## 1. ADLC (Agentic Development Life Cycle) & Model Routing Strategy

To move fast while preserving `Gemini 4 Argon (High)` quota, all development work is routed across three model tiers via the `swarm` tool and tracked via GitHub Issues & PRs:

| Tier | `swarm` Model | Cost Profile | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Tier 1 (Ultra-Light)** | `gemini-4-hydrogen-low` | **$ (Lowest)** | `gh issue` / `gh pr` management, updating `docs/SAAS_ROADMAP.md`, CI workflows. |
| **Tier 2 (Fast Coder / QA)** | `gemini-4-hydrogen-medium` / `gemini-4-hydrogen-high` | **$$ (Fast)** | Implementing scoped features & TypeScript UI modules, running `npm test` / `tsc` / `npm run check`. |
| **Tier 3 (Deep Engineering)** | `gemini-4-argon-high` | **$$$ (Lead)** | Deep multi-module engineering (`backend-rs/` Rust Axum + SQLx, relational database architecture), system design, and orchestration. |

---

## 2. Completed Baseline & Phase 1 (GitHub Issues #1–#6)

| Issue | Phase | Title | Model Tier | Status |
| :--- | :--- | :--- | :--- | :--- |
| **#1** | Phase 1 (UX & Studio) | Interactive Slide Inspector & Per-Slide Visual Editor | `gemini-4-hydrogen-high` | ✅ Done (`77c8eb3`) |
| **#2** | Phase 1 (UX & Studio) | 3-Step Brand Onboarding Wizard & URL Extractor | `gemini-4-hydrogen-high` | ✅ Done (`77c8eb3`) |
| **#3** | Phase 2 (SaaS Core) | Multi-Tenant SQLite / PostgreSQL Database Adapter (`src/services/db-adapter.js`) | `gemini-4-argon-high` | ✅ Done (`77c8eb3`) |
| **#4** | Phase 2 (SaaS Core) | Quota Paywall & Upgrade Modal UX (`2/4/16` & `4/20/100`) + CSV Cost Export | `gemini-4-hydrogen-high` | ✅ Done (`77c8eb3`) |
| **#5** | Phase 3 (AI & Vision) | Brand Guidelines PDF & Website URL Crawler (`src/services/guidelines-crawler.js`) | `gemini-4-hydrogen-high` | ✅ Done (`77c8eb3`) |
| **#6** | Phase 4 (CI/CD & Ops) | GitHub Actions CI Pipeline (`.github/workflows/adlc-ci.yml`) | `gemini-4-hydrogen-low` | ✅ Done (`77c8eb3`) |

---

## 3. Phase 2 Architecture & CVI Onboarding Backlog (GitHub Issues #7–#10)

| Issue | Phase | Title | Assigned Model Tier | Area | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#7** | Phase 2 (Rust Backend) | Rust Control Plane (`backend-rs/` with Axum + SQLite + Quick-XML `.pptx` CVI Extractor + Quota & MCP API) | `gemini-4-argon-high` | `area:saas`, `area:brand-kit` | ✅ Done |
| **#8** | Phase 2 (Relational DB) | Direct Relational SQLite Persistence in `StorageService` (eliminating `state.json` dependence via `DatabaseAdapter`) | `gemini-4-hydrogen-high` | `area:saas` | ✅ Done |
| **#9** | Phase 2 (Zero-Brand CVI) | Zero-Brand CVI Onboarding Flow (remove hardcoded `DanishCVI` defaults so users create their own CVI from scratch) | `gemini-4-hydrogen-high` | `area:ui`, `area:brand-kit` | ✅ Done |
| **#10** | Phase 2 (TypeScript UI) | Strict TypeScript Frontend Controller (`src/public/app.ts`) + End-to-End Verification | `gemini-4-hydrogen-medium` | `area:ui` | ✅ Done |

---

## 4. Phase 3: Rust Deck Compiler, Zero-Brand CVI Reset & LLM Tester (GitHub Issues #11–#15)

| Issue | Phase | Title | Assigned Model Tier | Area | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **#11** | Phase 3 (UI Backlog) | Tablet & Mobile Responsive Studio Layout & Touch Gestures | `gemini-4-hydrogen-high` | `area:ui` | 📋 Open (Backlog) |
| **#12** | Phase 3 (Rust Compiler) | Native Rust Deck HTML Compiler, Story Synthesizer & Offline ZIP Exporter (`backend-rs/`) | `gemini-4-argon-high` | `area:rust`, `area:saas` | ✅ Done |
| **#13** | Phase 3 (API) | Zero-Brand Onboarding Reset API (`POST /api/brands/clear`) & Live LLM Provider Connection Tester (`POST /api/org/llm-test`) | `gemini-4-hydrogen-medium` | `area:saas`, `area:api` | ✅ Done |
| **#14** | Phase 3 (UI) | Zero-Brand CVI Onboarding Trigger & AI Provider Test Action in Workspace UI | `gemini-4-hydrogen-medium` | `area:ui` | ✅ Done |
| **#15** | Phase 3 (QA / ADLC) | Phase 3 End-to-End Verification (Node + Playwright + Rust Cargo Tests) | `gemini-4-hydrogen-medium` | `area:qa` | ✅ Done |

---

## 5. How to Run the ADLC Workflow

```bash
# 1. Check current GitHub Issues, PRs, and branch state
./.agents/skills/adlc/scripts/adlc-cli.sh status

# 2. Run the full automated quality gate before opening or merging a PR
./.agents/skills/adlc/scripts/adlc-cli.sh verify
```
