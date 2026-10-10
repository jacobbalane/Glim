import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';

const baseURL = process.env.GLIM_PREVIEW_URL ?? 'http://127.0.0.1:1420';
const scenes = JSON.parse(await readFile('src/preview-scenes.json', 'utf8'));
const output = resolve('.cache/preview-screenshots');
await mkdir(output, { recursive: true });
try {
  const response = await fetch(`${baseURL}/preview`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch {
  throw new Error(`Start npm run dev first, then run npm run preview:capture (${baseURL}).`);
}

const browser = await chromium.launch({
  channel: process.env.GLIM_TEST_BROWSER === 'chromium' ? undefined : 'chrome',
});
const context = await browser.newContext({ reducedMotion: 'reduce', deviceScaleFactor: 1 });
const page = await context.newPage();
const captures = [];
try {
  for (const scene of scenes) {
    await page.setViewportSize({ width: scene.width, height: scene.brand ? scene.height : 640 });
    await page.goto(`${baseURL}/?scene=${scene.id}`);
    await page.waitForFunction(() => document.documentElement.dataset.previewReady === 'true');
    await page.evaluate(() => document.fonts.ready);
    // The fallback is replaced only after the first 3D frame has painted.
    await page.waitForFunction(
      () => !document.querySelector('.glim-character[data-renderer="loading"]'),
    );
    // Compact text waits for the width spring before it appears. Capture its settled
    // state rather than the intentional blank frame at the start of the morph.
    await page.waitForFunction(() => {
      const frame = document.querySelector('.frame:not([aria-hidden])');
      const line = frame?.querySelector('.compact-text:not([aria-hidden]) .compact-line');
      return (
        (!frame || Number(getComputedStyle(frame).opacity) >= 0.99) &&
        (!line || Number(getComputedStyle(line).opacity) >= 0.99)
      );
    });
    const surface = page.locator(
      scene.brand ? '[data-preview-surface="brand"]' : '[data-testid="island"]',
    );
    await surface.waitFor({ state: 'visible' });
    const bounds = await surface.boundingBox();
    if (!bounds) throw new Error(`No visible surface: ${scene.id}`);
    const height =
      Math.ceil(bounds.y + bounds.height) + (scene.brand ? 0 : scene.group === 'Island' ? 24 : 16);
    await page.screenshot({
      path: join(output, `${scene.id}.png`),
      omitBackground: true,
      animations: 'disabled',
      clip: { x: 0, y: 0, width: scene.width, height },
    });
    captures.push({ id: scene.id, width: scene.width, height });
    console.log(`Captured ${scene.title}`);
  }
  await writeFile(
    join(output, 'manifest.json'),
    JSON.stringify({ capturedAt: new Date().toISOString(), scenes: captures }, null, 2),
  );
  console.log(
    `Saved ${captures.length} screenshots. Open ${baseURL}/preview and choose Screenshots.`,
  );
} finally {
  await browser.close();
}
