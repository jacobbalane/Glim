import { expect, test, type Page } from '@playwright/test';
import { settledBox } from './settle';

const compact = (page: Page) => page.getByRole('button', { name: /^Glim:/ });
const island = (page: Page) => page.getByTestId('island');
async function hold(page: Page, selector = '.compact') {
  const box = (await page.locator(selector).boundingBox())!;
  const pointer = { x: box.x + box.width / 2, y: box.y + 16 };
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.down();
  await expect(island(page)).toHaveAttribute('data-dragging', 'true');
  return pointer;
}
async function centre(page: Page) {
  const box = (await island(page).boundingBox())!;
  return box.x + box.width / 2;
}
// Carries the island to a spot and lets go once the pointer has stopped there, as someone placing
// it would; letting go while still moving throws it.
async function place(page: Page, x: number, y: number, steps = 8) {
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

test('click opens; holding tracks horizontally and release never toggles the notch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(compact(page)).toBeVisible();
  const start = await centre(page);
  const pointer = await hold(page);
  await expect(page.locator('.compact')).toHaveCSS('cursor', 'grabbing');
  await page.mouse.move(pointer.x + 160, pointer.y + 90, { steps: 8 });
  await expect.poll(() => centre(page)).toBeCloseTo(start + 160, 0);
  expect((await island(page).boundingBox())!.y).toBe(0);
  await place(page, pointer.x + 160, pointer.y + 90, 1);
  await expect(island(page)).toHaveAttribute('data-dragging', 'false');
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await compact(page).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await expect.poll(() => centre(page)).toBeCloseTo(start + 160, 0);
  const header = await hold(page, '.bar-toggle');
  await place(page, header.x - 80, header.y, 6);
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await expect.poll(() => centre(page)).toBeCloseTo(start + 80, 0);
  await page.locator('.bar-toggle').click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await expect(page.locator('.frame[aria-hidden]')).toHaveCount(0);
  await expect
    .poll(async () => {
      const surface = (await island(page).boundingBox())!;
      const frame = (await page.locator('.frame:not([aria-hidden])').boundingBox())!;
      return Math.abs(surface.height - frame.height);
    })
    .toBeLessThan(1);
  await page.screenshot({ path: 'test-results/island-dragged.png' });
  expect(errors).toEqual([]);
});

test('moving before the hold cancels the gesture; the next click and keyboard open still work', async ({
  page,
}) => {
  await page.goto('/');
  const box = (await compact(page).boundingBox())!;
  const start = await centre(page);
  await page.mouse.move(box.x + 30, 16);
  await page.mouse.down();
  await page.mouse.move(box.x + 55, 16);
  await page.waitForTimeout(450);
  await expect(island(page)).toHaveAttribute('data-dragging', 'false');
  await page.mouse.up();
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  expect(await centre(page)).toBeCloseTo(start, 0);
  await compact(page).focus();
  await page.keyboard.press('Enter');
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await page.keyboard.press('Escape');
  await compact(page).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
});

test('Escape and a lost window focus cancel a drag without saving or opening', async ({ page }) => {
  await page.goto('/');
  const start = await centre(page);
  for (const cancel of ['escape', 'blur']) {
    const pointer = await hold(page);
    await page.mouse.move(pointer.x + 120, 16);
    await expect.poll(() => centre(page)).toBeCloseTo(start + 120, 0);
    if (cancel === 'escape') await page.keyboard.press('Escape');
    else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    await expect(island(page)).toHaveAttribute('data-dragging', 'false');
    await expect(island(page)).toHaveAttribute('data-expanded', 'false');
    await expect.poll(() => centre(page)).toBeCloseTo(start, 0);
  }
  await compact(page).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
});

test('screen edges keep the expanded notch visible and later settings preserve its position', async ({
  page,
}) => {
  await page.goto('/');
  for (const edge of [1, 1439]) {
    await hold(page);
    await page.mouse.move(edge, 16, { steps: 8 });
    await page.mouse.up();
    await compact(page).click();
    await expect(island(page)).toHaveAttribute('data-expanded', 'true');
    await expect.poll(async () => (await island(page).boundingBox())?.width).toBeCloseTo(440, 0);
    const box = (await island(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(19);
    expect(box.x + box.width).toBeLessThanOrEqual(1421);
    await page.keyboard.press('Escape');
  }
  const before = await centre(page);
  const prefs = await page.evaluate(
    "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences)",
  );
  expect(prefs.islandPosition).toBe(1);
  await page.evaluate(
    "import('/src/api.ts').then(async ({ api }) => { const s = await api.snapshot(); await api.savePreferences({ ...s.preferences, hideFullscreen: false }); })",
  );
  await expect.poll(() => centre(page)).toBeCloseTo(before, 0);
  await page.setViewportSize({ width: 430, height: 800 });
  await compact(page).click();
  await expect.poll(async () => (await island(page).boundingBox())?.width).toBeCloseTo(390, 0);
  expect((await island(page).boundingBox())!.x).toBeCloseTo(20, 0);
});

test('losing capture cannot swallow the next unrelated header action', async ({ page }) => {
  await page.goto('/');
  await hold(page);
  await page.locator('.compact').evaluate((element) => {
    // The active pointer in Playwright's mouse input has ID 1.
    element.releasePointerCapture(1);
  });
  // Chromium says the capture is lost; WebKit does not, and the release outside ends the hold.
  await page.mouse.move(30, 400);
  await page.mouse.up();
  await expect(island(page)).toHaveAttribute('data-dragging', 'false');
  await compact(page).focus();
  await page.keyboard.press('Enter');
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await island(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
});

test('keyboard positioning works with reduced motion and header buttons keep their action', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await compact(page).focus();
  const start = await centre(page);
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => centre(page)).toBeCloseTo(start + 24, 0);
  await page.keyboard.press('Enter');
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  const settings = page
    .getByTestId('island')
    .getByRole('button', { name: 'Settings', exact: true });
  const box = (await settings.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await expect(island(page)).toHaveAttribute('data-dragging', 'false');
  await page.mouse.up();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  const heading = await hold(page, '.sheet-head');
  await place(page, heading.x - 48, heading.y, 4);
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await expect.poll(() => centre(page)).toBeCloseTo(start - 24, 0);
});

test('a held island gives a little, a flick carries it on, and near the middle it centres', async ({
  page,
}) => {
  await page.goto('/');
  await expect(compact(page)).toBeVisible();
  const start = await centre(page);
  const width = (await settledBox(island(page))).width;
  // Held, it presses in from the top edge; let go, it springs back.
  await hold(page);
  await expect.poll(async () => (await island(page).boundingBox())!.width).toBeLessThan(width - 4);
  expect((await island(page).boundingBox())!.y).toBe(0);
  // Thrown to the right, it travels past where the pointer let go and stops inside the screen.
  // A throw is a quick move let go of at once. A runner too slow to make one places the island
  // instead, so the throw is tried again from there, up to three times.
  let thrown = false;
  for (let attempt = 0; attempt < 3 && !thrown; attempt++) {
    const from = await centre(page);
    if (attempt > 0) await hold(page);
    await page.mouse.move(from + 120, 16, { steps: 6 });
    await page.mouse.up();
    await expect(island(page)).toHaveAttribute('data-dragging', 'false');
    const rest = await settledBox(island(page));
    thrown = rest.x + rest.width / 2 > from + 150;
  }
  expect(thrown, 'A flick carries the island past where it was let go.').toBe(true);
  await expect.poll(async () => (await island(page).boundingBox())!.width).toBeCloseTo(width, 0);
  const box = (await island(page).boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(1440);
  // Placed a few pixels from the middle, it settles exactly in it.
  const now = await centre(page);
  const held = await hold(page);
  await place(page, held.x - (now - start) - 10, held.y);
  await expect.poll(() => centre(page)).toBeCloseTo(start, 0);
  const prefs = await page.evaluate(
    "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences)",
  );
  expect(prefs.islandPosition).toBe(0.5);
  // A quick click still just opens it.
  await compact(page).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
});

test('the full message moves to the left when the notch sits at the right edge', async ({
  page,
}) => {
  await page.goto('/');
  await hold(page);
  await page.mouse.move(1439, 16, { steps: 6 });
  await page.mouse.up();
  await compact(page).click();
  await expect(page.locator('.frame[aria-hidden]')).toHaveCount(0);
  await page.getByRole('button', { name: /^design-system · Claude:/ }).click();
  await page.getByRole('button', { name: 'Read what Claude said' }).click();
  const panel = page.getByRole('complementary', { name: 'What Claude said' });
  await expect(page.locator('.island-side')).toHaveClass(/on-left/);
  const box = (await panel.boundingBox())!;
  const notch = (await island(page).boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThan(notch.x);
});
