import { compileDeckToHtml } from './deck-compiler.js';

/**
 * Generates a deliberately broken deck fixture that triggers every check rule in §7:
 * - Overflow outside stage & self-clipping box
 * - Text smaller than 13px minimum
 * - Broken image & missing video
 * - Off-brand neon colours (#FF00FF)
 * - Low WCAG AA contrast (#EAE8E3 on #FAF8F5)
 * - Forbidden effects (blurred drop shadow, linear-gradient, text-shadow)
 * - Content entering footer/progress safe zones + logo on content slide
 * - Unloaded brand font marker
 */
export function buildDeliberatelyBrokenDeckHtml(brandKit) {
  const deck = {
    slug: 'deliberately-broken-fixture',
    title: 'Deliberately Broken Negative Test Fixture',
    classification: 'Internal',
    slides: [
      {
        id: 'broken-slide-1',
        type: 'content',
        eyebrow: 'NEGATIVE TEST FIXTURE · SLIDE 1',
        title: 'Overflow, Small Text, Off-Brand Palette & Low Contrast',
        rawBodyHtml: `
          <div class="ds-card" style="height: 80px; overflow: hidden;">
            <div class="ds-card-title">Clipped Container Box</div>
            <div class="ds-card-body">Line 1 of clipped content.<br/>Line 2 of clipped content.<br/>Line 3 of clipped content.<br/>Line 4 of clipped content.<br/>Line 5 overflowing!</div>
          </div>
          <p style="font-size: 9px; color: #0F172A;">Microscopic 9px disclaimer text violating the 13px minimum stage rule.</p>
          <div style="background-color: #FF00FF; color: #00FF00; padding: 12px;">Neon magenta &amp; lime box outside the Brand Kit palette.</div>
          <div style="background-color: #FAF8F5; color: #EBE8E0; padding: 12px; font-size: 16px;">Almost invisible low-contrast text on light surface (WCAG failure).</div>
          <div style="position: absolute; left: 1450px; top: 200px; width: 400px; height: 90px; background: #1E293B; color: #FFF;">Box extending past 1600px stage right edge</div>
        `
      },
      {
        id: 'broken-slide-2',
        type: 'content',
        eyebrow: 'NEGATIVE TEST FIXTURE · SLIDE 2',
        title: 'Forbidden Shadows, Gradients, Broken Media, Safe Zone & Unloaded Font',
        rawBodyHtml: `
          <div style="box-shadow: 0 20px 35px rgba(0,0,0,0.45); background-image: linear-gradient(90deg, #ff0055, #0055ff); text-shadow: 2px 2px 6px #000; padding: 16px; color: #FFFFFF;">
            Forbidden blurred drop-shadow, multi-colour gradient, and text-shadow.
          </div>
          <img src="data:image/gif;base64,broken" alt="Intentionally broken image" />
          <video src="" data-broken="true"></video>
          <div data-missing-font="true" style="font-family: 'UnlicensedMissingCorpFont'; font-size: 18px;">Text using missing corporate font without fallback</div>
          <img class="ds-frame-logo pos-top-right" src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjMDAwIi8+PC9zdmc+" alt="Forbidden logo on content slide" />
          <div style="position: fixed; left: 100px; top: 875px; height: 40px; background: #1E293B; color: #FFFFFF;">Intruding into bottom footer safe zone</div>
        `
      }
    ]
  };

  return compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
}
