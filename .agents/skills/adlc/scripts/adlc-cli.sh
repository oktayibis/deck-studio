#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-status}"

case "$CMD" in
  init-labels)
    echo "==> Syncing ADLC & Model-Tiering Labels on GitHub..."
    gh label create "model:flash-lite" --color "0E8A16" --description "Tier 1 (Lowest Cost): CLI ops, docs, QA runs, issue/PR updates" --force
    gh label create "model:flash"      --color "1D76DB" --description "Tier 2 (Fast Coder): Feature implementation, UI components, tests" --force
    gh label create "model:pro"        --color "5319E7" --description "Tier 3 (Lead Architect): Complex architecture, security, review" --force
    gh label create "area:ui"          --color "C84B31" --description "Frontend Studio, Brand Setup, Library & Design System" --force
    gh label create "area:engine"      --color "0F766E" --description "1600x900 Deck Engine, Animations & Presenting Tools" --force
    gh label create "area:saas"        --color "B45309" --description "Plans, Quotas (2/4/16 & 4/20/100), Auth, Multi-tenancy & Billing" --force
    gh label create "area:agent"       --color "2563EB" --description "LLM Gateway, Storyline Agent, Check-and-Fix Loop & MCP" --force
    gh label create "area:brand-kit"   --color "7C3AED" --description "Office .pptx/.thmx Extractor, DanishCVI Tokens & WCAG" --force
    gh label create "priority:p0"      --color "B91C1C" --description "Critical path / Immediate milestone" --force
    gh label create "priority:p1"      --color "D97706" --description "High priority SaaS roadmap item" --force
    gh label create "priority:p2"      --color "64748B" --description "Nice-to-have / Future enhancement" --force
    echo "==> All ADLC labels synced."
    ;;

  status)
    echo "========================================================"
    echo "  DECK STUDIO — ADLC GITHUB STATUS"
    echo "========================================================"
    echo "--- Git Branch ---"
    git status -sb
    echo ""
    echo "--- Open GitHub Issues ---"
    gh issue list --limit 20
    echo ""
    echo "--- Open Pull Requests ---"
    gh pr list --limit 10
    ;;

  verify)
    echo "==> [ADLC QA Gate 1/3] TypeScript Schema Check..."
    npx tsc --noEmit
    echo "==> [ADLC QA Gate 2/3] Automated Test Suite (7 Suites)..."
    npm test
    echo "==> [ADLC QA Gate 3/3] Headless Chromium Brand & Quality Check..."
    npm run check
    echo "==> ALL ADLC QUALITY GATES PASSED."
    ;;

  *)
    echo "Usage: $0 {init-labels|status|verify}"
    exit 1
    ;;
esac
