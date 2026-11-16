import fs from 'node:fs';
import { storage } from '../services/storage.js';
import { compileBrandGalleryHtml } from '../services/gallery-builder.js';
import { buildDeliberatelyBrokenDeckHtml } from '../services/broken-fixture.js';
import { compileDeckToHtml } from '../services/deck-compiler.js';
import { runHeadlessDeckCheck } from '../services/checker.js';
import { closeSharedBrowser } from '../utils/browser.js';

async function main() {
  const args = process.argv.slice(2);
  const orgId = 'default-org';
  await storage.ensureSeedData(orgId);
  const brandKit = storage.getActiveBrandKit(orgId);

  let html = '';
  let targetLabel = 'Brand Component Gallery';

  if (args.includes('--broken')) {
    targetLabel = 'Deliberately Broken Negative Fixture';
    html = buildDeliberatelyBrokenDeckHtml(brandKit);
  } else if (args.includes('--file')) {
    const fileIdx = args.indexOf('--file');
    const filePath = args[fileIdx + 1];
    targetLabel = filePath;
    html = fs.readFileSync(filePath, 'utf8');
  } else if (args.includes('--slug')) {
    const slugIdx = args.indexOf('--slug');
    const slug = args[slugIdx + 1];
    const deck = storage.getDeck(orgId, slug);
    if (!deck) {
      console.error(JSON.stringify({ error: `Deck "${slug}" not found.` }));
      process.exit(2);
    }
    targetLabel = `Deck: ${slug}`;
    html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
  } else {
    html = compileBrandGalleryHtml(brandKit);
  }

  try {
    const report = await runHeadlessDeckCheck({ html, brandKit });
    console.log(JSON.stringify(report, null, 2));
    console.error(`\n=== HUMAN SUMMARY (${targetLabel}) ===`);
    console.error(report.humanSummary);
    for (const s of report.slides) {
      console.error(`  • ${s.humanSummary}`);
    }
    await closeSharedBrowser();
    process.exit(report.passed ? 0 : 1);
  } catch (err) {
    console.error(err);
    await closeSharedBrowser();
    process.exit(2);
  }
}

main();
