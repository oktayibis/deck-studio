# Deck Studio — Brand-True AI Presentation Builder

An AI-powered, brand-true presentation SaaS that extracts visual identity tokens and geometry from Office templates (`.pptx`, `.potx`, `.thmx`) into versioned **Brand Kits** (e.g. `DanishCVI`), generates interactive `1600×900` HTML slide decks from a brief plus user screenshots and videos, verifies every slide in headless Chromium (WCAG AA contrast, palette compliance, stage overflow, safe zones), and exports offline `.zip` and `.pdf` bundles.

## Quick Start

```bash
npm install
npm run seed   # Seeds DanishCVI & Nordic Grid Brand Kits + sample 9-slide deck
npm start      # Starts Deck Studio at http://127.0.0.1:3456
```

## Scripts

- `npm start` — Run the web app, REST/SSE API, and HTTP MCP endpoint on `http://127.0.0.1:3456`
- `npm test` — Run the 7 end-to-end automated test suites (`node --test tests/*.test.js`)
- `npm run check` — Run the headless Chromium brand & quality checker against the Brand Component Gallery
- `node src/cli/check-deck.js --broken` — Run the headless checker against the deliberately broken negative fixture (exits non-zero)
- `npm run mcp` — Start the stdio JSON-RPC 2.0 MCP server (`src/mcp/server.js`)
