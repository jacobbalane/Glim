import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const scenes = JSON.parse(
  readFileSync(new URL('../../src/preview-scenes.json', import.meta.url), 'utf8'),
) as { id: string; width: number; height: number }[];

test('preview includes every view and logo, with isolated interactive scenes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/preview');
  await expect(page.getByRole('heading', { name: 'Preview', exact: true })).toBeVisible();
  await expect(page.locator('.preview-card')).toHaveCount(scenes.length);
  await page.getByRole('button', { name: 'Brand', exact: true }).click();
  await expect(page.locator('.preview-card')).toHaveCount(4);
  const mascot = page.frameLocator('iframe[title="Interactive mascot"]');
  await mascot.getByRole('button', { name: 'Say hello to Glim' }).click();
  await expect(mascot.getByRole('button', { name: 'Say hello to Glim' })).toContainText('Hello.');
  await page.screenshot({ path: 'test-results/preview-brand.png' });
  await page
    .getByRole('navigation', { name: 'View groups' })
    .getByRole('button', { name: 'Setup', exact: true })
    .click();
  const agents = page.frameLocator('iframe[title="Connect agents"]');
  const welcome = page.frameLocator('iframe[title="Welcome"]');
  await expect(welcome.getByRole('button', { name: 'Get started' })).toBeVisible();
  await agents.getByRole('button', { name: /Claude Code.*Connect/ }).click();
  await agents.getByRole('button', { name: 'Connect Claude', exact: true }).click();
  await expect(agents.getByRole('status')).toContainText('connected');
  await expect(welcome.getByRole('button', { name: 'Get started' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('screenshot gallery stays usable on a narrow screen', async ({ page }) => {
  await page.route('**/__preview_shots/manifest.json', (route) =>
    route.fulfill({
      json: {
        capturedAt: '2026-10-08T00:00:00Z',
        scenes: scenes.map((scene) => ({ id: scene.id, width: scene.width, height: scene.height })),
      },
    }),
  );
  await page.route('**/__preview_shots/*.png?*', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Mk4AAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto('/preview/');
  await page.getByRole('button', { name: 'Brand', exact: true }).click();
  await page.getByRole('button', { name: 'Screenshots', exact: true }).click();
  await expect(page.locator('.preview-card img')).toHaveCount(4);
  await expect(
    page.getByRole('link', { name: 'Download Logo · white screenshot' }),
  ).toHaveAttribute('download', 'glim-logo-light.png');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

test('interactive notch keeps one surface and animates working activity', async ({ page }) => {
  await page.goto('/preview');
  await page
    .getByRole('navigation', { name: 'View groups' })
    .getByRole('button', { name: 'Brand', exact: true })
    .click();
  const controls = page.getByRole('region', { name: 'Interactive notch preview' });
  const frame = await page.locator('iframe[title="Interactive notch"]').contentFrame();
  const island = frame.getByTestId('island');
  await controls.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'glim-desktop', exact: true })).toBeVisible();
  await island.evaluate((node) => node.setAttribute('data-persistence-check', 'same'));
  await controls.getByRole('button', { name: 'Collapse', exact: true }).click();
  await expect.poll(async () => (await island.boundingBox())?.height).toBeCloseTo(101, 0);
  const samples = frame.locator('html').evaluate(
    () =>
      new Promise<{ width: number; center: number }[]>((resolve) => {
        const values: { width: number; center: number }[] = [];
        const start = performance.now();
        function sample() {
          const box = document.querySelector('[data-testid="island"]')!.getBoundingClientRect();
          values.push({ width: box.width, center: box.left + box.width / 2 });
          if (performance.now() - start < 900) requestAnimationFrame(sample);
          else resolve(values);
        }
        requestAnimationFrame(sample);
      }),
  );
  await controls.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(frame.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  const geometry = await samples;
  expect(geometry.some((box) => box.width > 302 && box.width < 430)).toBeTruthy();
  expect(geometry.every((box) => Math.abs(box.center - 340) < 1)).toBeTruthy();
  await expect(island).toHaveAttribute('data-persistence-check', 'same');
  await expect
    .poll(async () => {
      const surface = await island.boundingBox();
      const stage = await page.locator('.flow-preview-stage').boundingBox();
      return Math.abs(stage!.height - surface!.height - 28);
    })
    .toBeLessThan(2);
  await frame.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(frame.getByRole('progressbar', { name: 'Context' })).toBeVisible();
  await frame.getByRole('button', { name: /glim-desktop, Claude Code/ }).click();
  await expect.poll(async () => (await island.boundingBox())?.height).toBeLessThan(400);
  const character = frame.locator('.glim-character[data-mood="scan"]').first();
  await expect(character).toHaveAttribute('data-renderer', '3d');
  await expect(character).toHaveAttribute('data-motion', 'true');
  const firstFrame = await character.locator('canvas').evaluate((node) => node.toDataURL());
  await expect
    .poll(() => character.locator('canvas').evaluate((node) => node.toDataURL()))
    .not.toBe(firstFrame);
  await page.mouse.click(24, 220);
  await expect(frame.getByRole('button', { name: /^Glim:/ })).toBeVisible();
  await expect(island).toHaveAttribute('data-expanded', 'false');
  await controls.getByRole('button', { name: 'Expand', exact: true }).click();
  await frame.getByRole('button', { name: /glim-desktop, Claude Code/ }).click();
  await controls.getByLabel('Agent activity').selectOption('finished');
  await expect(frame.locator('.hero .chip')).toHaveText('Done');
  await expect(island).toHaveAttribute('data-persistence-check', 'same');
});
