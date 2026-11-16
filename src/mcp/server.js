import readline from 'node:readline';
import { storage } from '../services/storage.js';
import { runAgentCreateDeck, runAgentEditDeck } from '../services/agent.js';
import { compileDeckToHtml } from '../services/deck-compiler.js';
import { runHeadlessDeckCheck } from '../services/checker.js';
import { exportDeckToPdf, exportDeckToZip } from '../services/exporter.js';

export const MCP_TOOLS = [
  {
    name: 'get_brand_kit',
    description: 'Retrieves the active Brand Kit (colours, fonts, inch geometry, frame rules, WCAG contrast report) and workspace quota status.',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: 'Organisation slug (defaults to default-org)' },
        brandKitId: { type: 'string', description: 'Optional Brand Kit ID (e.g., brand-danish-cvi)' }
      }
    }
  },
  {
    name: 'list_decks',
    description: 'Lists all presentation decks in the organisation library with their check status, version, and Brand Kit reference.',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: 'Organisation slug' }
      }
    }
  },
  {
    name: 'create_deck',
    description: 'Creates an on-brand interactive HTML presentation deck from a brief, media assets, and selected Brand Kit, then runs the automatic headless check-and-fix loop.',
    inputSchema: {
      type: 'object',
      required: ['topic'],
      properties: {
        orgId: { type: 'string' },
        brandKitId: { type: 'string', description: 'Brand Kit ID (e.g., brand-danish-cvi)' },
        slug: { type: 'string', description: 'Optional kebab-case deck name' },
        topic: { type: 'string', description: 'Presentation brief and factual notes' },
        audience: { type: 'string', enum: ['management', 'product', 'developers', 'mixed'] },
        lengthMinutes: { type: 'number' },
        endsWithLiveDemo: { type: 'boolean' },
        language: { type: 'string' },
        sourceText: { type: 'string' },
        mediaFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              category: { type: 'string', enum: ['image', 'video'] },
              caption: { type: 'string' },
              dataUrl: { type: 'string' },
              localPath: { type: 'string' }
            }
          }
        }
      }
    }
  },
  {
    name: 'edit_deck',
    description: 'Refines an existing deck in place (e.g. "make slide 4 simpler", "add a timeline of the outage", "use the second screenshot on the cover"), preserves version history, and re-runs the headless checker.',
    inputSchema: {
      type: 'object',
      required: ['deckSlug', 'prompt'],
      properties: {
        orgId: { type: 'string' },
        deckSlug: { type: 'string' },
        prompt: { type: 'string' }
      }
    }
  },
  {
    name: 'check_deck',
    description: 'Runs the headless Chromium 8-point quality & brand checker on an existing deck and returns machine-readable JSON plus a human summary per slide.',
    inputSchema: {
      type: 'object',
      required: ['deckSlug'],
      properties: {
        orgId: { type: 'string' },
        deckSlug: { type: 'string' }
      }
    }
  },
  {
    name: 'export_deck',
    description: 'Exports a deck as a self-contained offline .zip bundle or a 1-slide-per-page landscape .pdf file.',
    inputSchema: {
      type: 'object',
      required: ['deckSlug', 'format'],
      properties: {
        orgId: { type: 'string' },
        deckSlug: { type: 'string' },
        format: { type: 'string', enum: ['zip', 'pdf'] }
      }
    }
  }
];

/**
 * Executes an MCP tool call using the exact same core services as the Web UI (§9).
 */
export async function executeMcpToolCall(name, args = {}) {
  const orgId = args.orgId || 'default-org';
  await storage.ensureSeedData(orgId);

  switch (name) {
    case 'get_brand_kit': {
      const brandKit = storage.getActiveBrandKit(orgId, args.brandKitId || null);
      const quota = storage.getQuotaStatus(orgId);
      return {
        brandKit,
        allBrandKits: storage.listBrandKits(orgId).map((k) => ({
          id: k.id,
          name: k.name,
          currentVersion: k.currentVersion,
          active: k.active
        })),
        quota
      };
    }

    case 'list_decks': {
      const decks = storage.listDecks(orgId).map((d) => ({
        slug: d.slug,
        title: d.title,
        brandKitId: d.brandKitId,
        brandKitVersion: d.brandKitVersion,
        classification: d.classification,
        slideCount: d.slides?.length || 0,
        version: d.version,
        passedCheck: d.lastCheckReport?.passed ?? true,
        updatedAt: d.updatedAt
      }));
      return { decks, quota: storage.getQuotaStatus(orgId) };
    }

    case 'create_deck': {
      const result = await runAgentCreateDeck({
        orgId,
        brandKitId: args.brandKitId || null,
        brief: {
          slug: args.slug,
          topic: args.topic,
          audience: args.audience || 'management',
          lengthMinutes: args.lengthMinutes || 10,
          endsWithLiveDemo: Boolean(args.endsWithLiveDemo),
          language: args.language || 'en',
          sourceText: args.sourceText || ''
        },
        mediaFiles: args.mediaFiles || []
      });
      return {
        deckSlug: result.deck.slug,
        title: result.deck.title,
        slideCount: result.deck.slides.length,
        brandKitId: result.deck.brandKitId,
        brandKitVersion: result.deck.brandKitVersion,
        checkPassed: result.checkReport.passed,
        checkSummary: result.checkReport.humanSummary,
        jobId: result.job.id
      };
    }

    case 'edit_deck': {
      const result = await runAgentEditDeck({
        orgId,
        deckSlug: args.deckSlug,
        prompt: args.prompt
      });
      return {
        deckSlug: result.deck.slug,
        version: result.deck.version,
        slideCount: result.deck.slides.length,
        checkPassed: result.checkReport.passed,
        checkSummary: result.checkReport.humanSummary,
        jobId: result.job.id
      };
    }

    case 'check_deck': {
      const deck = storage.getDeck(orgId, args.deckSlug);
      if (!deck) {
        throw new Error(`Deck "${args.deckSlug}" not found.`);
      }
      const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
      const html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
      const report = await runHeadlessDeckCheck({ html, brandKit });
      deck.lastCheckReport = report;
      storage.saveDeck(orgId, deck, { createHistorySnapshot: false });
      return report;
    }

    case 'export_deck': {
      if (args.format === 'pdf') {
        const pdfRes = await exportDeckToPdf({ orgId, deckSlug: args.deckSlug });
        return {
          format: 'pdf',
          filename: pdfRes.filename,
          filePath: pdfRes.filePath,
          bytes: pdfRes.buffer.length
        };
      }
      const zipRes = await exportDeckToZip({ orgId, deckSlug: args.deckSlug });
      return {
        format: 'zip',
        filename: zipRes.filename,
        filePath: zipRes.filePath,
        bytes: zipRes.buffer.length
      };
    }

    default:
      throw new Error(`Unknown MCP tool: "${name}"`);
  }
}

/**
 * Handles JSON-RPC 2.0 MCP messages (`initialize`, `tools/list`, `tools/call`).
 */
export async function handleMcpJsonRpc(request) {
  const { id = null, method, params = {} } = request || {};

  try {
    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: 'deck-studio-mcp-server',
            version: '1.0.0'
          }
        }
      };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: MCP_TOOLS
        }
      };
    }

    if (method === 'tools/call') {
      const toolName = params.name;
      const toolArgs = params.arguments || {};
      const resultObj = await executeMcpToolCall(toolName, toolArgs);
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(resultObj, null, 2)
            }
          ],
          structuredContent: resultObj,
          isError: false
        }
      };
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method not found: ${method}`
      }
    };
  } catch (err) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: err.statusCode || -32000,
        message: err.message || 'MCP tool execution failed',
        data: { code: err.code || 'MCP_ERROR' }
      }
    };
  }
}

// If executed directly (`node src/mcp/server.js`), run as a stdio JSON-RPC 2.0 MCP server
const isDirectRun =
  process.argv[1] && process.argv[1].endsWith('src/mcp/server.js');

if (isDirectRun) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const req = JSON.parse(trimmed);
      const res = await handleMcpJsonRpc(req);
      process.stdout.write(JSON.stringify(res) + '\n');
    } catch (err) {
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: `Parse error: ${err.message}` }
        }) + '\n'
      );
    }
  });
}
