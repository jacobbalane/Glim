import { expect, test, type Page } from '@playwright/test';
import { hasGpu } from './gpu';

// The 3D checks need a GPU; without one, Glim must be flat.
async function needsGpu(page: Page) {
  const gpu = await hasGpu(page);
  if (!gpu)
    await expect(page.locator('.compact .glim-character')).toHaveAttribute(
      'data-renderer',
      'fallback',
    );
  test.skip(!gpu, 'Glim is flat without a GPU');
}

test('3D Glim follows status changes and keeps its compact footprint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?scene=compact-long&motion=1');
  await needsGpu(page);
  const character = page.locator('.compact .glim-character');
  await expect(character).toHaveAttribute('data-renderer', '3d');
  await expect(character).toHaveCSS('width', '28px');
  await expect(character).toHaveAttribute('data-mood', 'scan');
  const painted = await character.locator('canvas').evaluate((canvas) =>
    canvas
      .getContext('2d')!
      .getImageData(0, 0, canvas.width, canvas.height)
      .data.some((n, i) => i % 4 === 3 && n > 0),
  );
  expect(painted).toBe(true);
  for (const [status, mood, tone] of [
    ['waiting', 'wide', 'attention'],
    ['finished', 'happy', 'done'],
    ['error', 'cross', 'error'],
  ]) {
    await page.evaluate(
      (status) =>
        window.postMessage(
          { type: 'glim:preview', sessionId: 'demo-claude', status },
          location.origin,
        ),
      status,
    );
    await expect(character).toHaveAttribute('data-mood', mood);
    await expect(character).toHaveClass(new RegExp(`tone-${tone}`));
  }
  await page.getByRole('button', { name: /^Glim:/ }).click();
  const chip = page.locator('.hero .glim-character');
  await expect(chip).toHaveAttribute('data-renderer', '3d');
  await expect(chip).toHaveCSS('width', '24px');
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.locator('.sheet .glim-character')).toHaveAttribute('data-renderer', '3d');
  expect(errors).toEqual([]);
});

test('3D motion stops for reduced motion and hidden windows, then resumes', async ({ page }) => {
  await page.addInitScript(() => {
    const original = CanvasRenderingContext2D.prototype.drawImage;
    let frames = 0;
    Object.defineProperty(window, '__glimFrames', { get: () => frames });
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof original>) {
      frames++;
      return original.apply(this, args);
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?scene=compact-short&motion=1');
  await needsGpu(page);
  const character = page.locator('.compact .glim-character');
  await expect(character).toHaveAttribute('data-renderer', '3d');
  const frames = () =>
    page.evaluate(() => (window as Window & { __glimFrames: number }).__glimFrames);
  await page.waitForTimeout(300);
  const stopped = await frames();
  await page.waitForTimeout(500);
  expect(await frames()).toBe(stopped);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(frames).toBeGreaterThan(stopped + 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hidden = await frames();
  await page.waitForTimeout(400);
  expect(await frames()).toBe(hidden);
  await page.evaluate(() => {
    delete (document as Document & { hidden?: boolean }).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(frames).toBeGreaterThan(hidden + 2);
});

test('the character falls back when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (type.includes('webgl')) return null;
      return original.call(this, type, options);
    } as typeof original;
  });
  await page.goto('/?scene=compact-short');
  await expect(page.locator('.compact .glim-character')).toHaveAttribute(
    'data-renderer',
    'fallback',
  );
  await expect(page.locator('.compact .eyes')).toBeVisible();
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.locator('.hero .glim-character')).toHaveAttribute('data-renderer', 'fallback');
  await expect(page.getByRole('progressbar', { name: 'Context' })).toBeVisible();
});

test('GPU context loss restores the flat status character', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      const context = original.call(this, type, options);
      if (type === 'webgl2' && context) {
        Object.defineProperty(window, '__loseGlimContext', {
          configurable: true,
          value: () =>
            (context as WebGL2RenderingContext).getExtension('WEBGL_lose_context')?.loseContext(),
        });
      }
      return context;
    } as typeof original;
  });
  await page.goto('/?scene=compact-short');
  await needsGpu(page);
  const character = page.locator('.compact .glim-character');
  await expect(character).toHaveAttribute('data-renderer', '3d');
  await page.evaluate(() =>
    (window as Window & { __loseGlimContext: () => void }).__loseGlimContext(),
  );
  await expect(character).toHaveAttribute('data-renderer', 'fallback');
  await expect(character.locator('.eyes')).toBeVisible();
});
