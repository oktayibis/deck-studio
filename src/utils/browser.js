import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright-core';

let sharedBrowserPromise = null;

export function findChromiumExecutable() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) {
    return process.env.CHROMIUM_PATH;
  }

  const home = os.homedir();
  const candidates = [
    path.join(
      home,
      'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    ),
    path.join(
      home,
      'Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell'
    ),
    path.join(
      home,
      'Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell'
    ),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome'
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return undefined;
}

export async function getSharedBrowser() {
  if (!sharedBrowserPromise) {
    const executablePath = findChromiumExecutable();
    sharedBrowserPromise = chromium
      .launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none']
      })
      .catch((err) => {
        sharedBrowserPromise = null;
        throw err;
      });
  }
  return sharedBrowserPromise;
}

export async function closeSharedBrowser() {
  if (sharedBrowserPromise) {
    try {
      const browser = await sharedBrowserPromise;
      await browser.close();
    } catch {
      // ignore
    } finally {
      sharedBrowserPromise = null;
    }
  }
}
