import { expect, test, type Page } from '@playwright/test';

const island = (page: Page) => page.getByTestId('island');
const compact = (page: Page) => page.getByRole('button', { name: /^Glim:/ });
const options = (page: Page) => page.getByRole('menu', { name: 'Glim options' });
const centre = async (page: Page) => {
  const box = (await island(page).boundingBox())!;
  return box.x + box.width / 2;
};
const trigger = (page: Page) => page.getByRole('button', { name: 'Glim options', exact: true });
async function gotoWithOptions(page: Page, url = '/') {
  await page.goto(url);
  await expect(compact(page)).toBeVisible();
  await page.evaluate(
    "import('/src/api.ts').then(async ({ api }) => { const s = await api.snapshot(); await api.savePreferences({ ...s.preferences, quickOptionsEnabled: true }); })",
  );
}
async function openOptions(page: Page) {
  await compact(page).hover();
  await trigger(page).click();
  await expect(options(page)).toBeVisible();
}

test('the options button reveals icons in the same pill without changing the notch', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await gotoWithOptions(page);
  await expect(compact(page)).toBeVisible();
  await expect(page.locator('.frame:not([aria-hidden])')).toHaveCSS('opacity', '1');
  const before = (await island(page).boundingBox())!;
  await openOptions(page);
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await expect(options(page).getByRole('menuitem')).toHaveCount(2);
  await expect(options(page).getByRole('menuitem', { name: 'Centre horizontally' })).toBeFocused();
  await expect(options(page).getByRole('menuitem', { name: 'Quit Glim' })).toBeDisabled();
  await expect(page.locator('.frame[aria-hidden]')).toHaveCount(0);
  const after = (await island(page).boundingBox())!;
  // The island still fits its own text, which the sample sessions keep updating.
  const text = (await page.locator('.frame:not([aria-hidden])').boundingBox())!;
  expect(Math.abs(after.width - text.width)).toBeLessThanOrEqual(2);
  // The initial spring can still settle by a fraction of a screen pixel.
  expect(after.height).toBeCloseTo(before.height, 0);
  await expect(page.locator('.island-options-pill')).toHaveCSS('width', '88px');
  await expect(page.locator('.island-options-pill')).toHaveCSS('height', '28px');
  const button = (await trigger(page).boundingBox())!;
  const menu = (await options(page).boundingBox())!;
  expect(menu.y).toBeCloseTo(button.y, 0);
  expect(menu.x).toBeCloseTo(button.x + button.width, 0);
  await expect(options(page)).toHaveText('');
  await expect(options(page)).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(page.locator('.island-shell [title]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/island-options.png' });
  await page.keyboard.press('Escape');
  await expect(options(page)).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await expect(trigger(page)).toBeFocused();
  await compact(page).click();
  await expect(
    page.getByRole('heading', { name: 'glim-desktop · Claude', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('centring from a dragged position saves the middle and returns to the original preview', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await compact(page).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => centre(page)).toBeCloseTo(744, 0);
  await openOptions(page);
  await options(page).getByRole('menuitem', { name: 'Centre horizontally' }).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await expect.poll(() => centre(page)).toBeCloseTo(720, 0);
  expect(
    await page.evaluate(
      "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences.islandPosition)",
    ),
  ).toBe(0.5);
});

test('expanded headers, right click and keyboard open options while other controls keep their action', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await compact(page).click();
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await expect(trigger(page)).toHaveCount(0);
  await page.locator('.bar-toggle').click({ button: 'right' });
  await expect(options(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(options(page)).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await expect(
    page.getByRole('heading', { name: 'glim-desktop · Claude', exact: true }),
  ).toBeVisible();
  await island(page).getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await compact(page).click({ button: 'right' });
  await expect(options(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await compact(page).focus();
  await page.keyboard.press('Shift+F10');
  await expect(options(page)).toBeVisible();
  await page.mouse.click(40, 200);
  await expect(options(page)).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
});

test('a single click during centring still opens and lets the return to centre finish', async ({
  page,
}) => {
  // Motion captures requestAnimationFrame when its module loads.
  await page.clock.install();
  await gotoWithOptions(page);
  await page.evaluate("import('/src/api.ts').then(({ api }) => api.islandPosition(0.9))");
  await expect.poll(() => centre(page)).toBeCloseTo(1104, 0);
  await compact(page).click({ button: 'right' });
  await expect(page.locator('.island-options-pill')).toHaveCSS('width', '88px');
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const action = (await options(page)
    .getByRole('menuitem', { name: 'Centre horizontally' })
    .boundingBox())!;
  await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2);
  await expect(options(page)).toHaveCount(0);
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await page.clock.runFor(80);
  // Coordinate input can interrupt moving UI; locator.click waits for it to settle.
  const box = (await compact(page).boundingBox())!;
  expect(await centre(page)).toBeGreaterThan(740);
  expect(await centre(page)).toBeLessThan(1104);
  await page.mouse.click(box.x + box.width / 2, box.y + 16);
  await expect(island(page)).toHaveAttribute('data-expanded', 'true');
  await page.clock.runFor(1000);
  await expect.poll(() => centre(page)).toBeCloseTo(720, 0);
});

test('a long press interrupts centring and release keeps the newly dragged position', async ({
  page,
}) => {
  await page.clock.install();
  await gotoWithOptions(page);
  await page.evaluate("import('/src/api.ts').then(({ api }) => api.islandPosition(0.9))");
  await expect.poll(() => centre(page)).toBeCloseTo(1104, 0);
  await compact(page).click({ button: 'right' });
  await expect(page.locator('.island-options-pill')).toHaveCSS('width', '88px');
  await page.clock.pauseAt(new Date(Date.now() + 100));
  const action = (await options(page)
    .getByRole('menuitem', { name: 'Centre horizontally' })
    .boundingBox())!;
  await page.mouse.click(action.x + action.width / 2, action.y + action.height / 2);
  await expect(options(page)).toHaveCount(0);
  await page.clock.runFor(120);
  const preview = (await compact(page).boundingBox())!;
  const pointerX = preview.x + preview.width / 2;
  await page.mouse.move(pointerX, 16);
  await page.mouse.down();
  await page.clock.runFor(360);
  await expect(island(page)).toHaveAttribute('data-dragging', 'true');
  const stopped = await centre(page);
  await page.clock.runFor(100);
  expect(await centre(page)).toBeCloseTo(stopped, 0);
  await page.mouse.move(pointerX + 100, 16);
  await page.mouse.up();
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await page.clock.runFor(1000);
  expect(await centre(page)).toBeCloseTo(stopped + 100, 0);
  expect(
    await page.evaluate(
      "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences.islandPosition)",
    ),
  ).toBeGreaterThan(0.5);
});

test('reduced motion centres immediately', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await gotoWithOptions(page);
  await compact(page).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await page.keyboard.press('Shift+F10');
  await options(page).getByRole('menuitem', { name: 'Centre horizontally' }).click();
  expect(await centre(page)).toBe(720);
});

test('hover stays continuous across the gap, hides on leaving and supports keyboard access', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await expect(trigger(page)).toHaveCount(0);
  await compact(page).hover();
  const before = (await island(page).boundingBox())!;
  await expect(trigger(page)).toBeVisible();
  await expect
    .poll(async () => {
      const b = (await trigger(page).boundingBox())!;
      const body = (await island(page).boundingBox())!;
      return b.x - (body.x + body.width);
    })
    .toBeCloseTo(4, 0);
  const settled = (await trigger(page).boundingBox())!;
  // A 28-pixel circle centred on the 34-pixel island.
  expect(settled.y).toBeCloseTo(3, 0);
  expect(settled.width).toBeCloseTo(settled.height, 0);
  expect(settled.y + settled.height).toBeLessThanOrEqual(31.5);
  expect((await island(page).boundingBox())!.width).toBe(before.width);
  await page.mouse.move(before.x + before.width - 8, 17);
  await page.mouse.move(settled.x + settled.width / 2, 17, { steps: 12 });
  await expect(trigger(page)).toBeVisible();
  await page.mouse.move(40, 200);
  await expect(trigger(page)).toHaveCount(0);
  await page.mouse.click(40, 200);
  await page.keyboard.press('Tab');
  await expect(compact(page)).toBeFocused();
  await expect(trigger(page)).toBeVisible();
  // The notices have their own buttons, so focus the newly revealed action directly.
  await trigger(page).focus();
  await page.keyboard.press('Enter');
  await expect(options(page)).toBeVisible();
});

test('brief pointer crossings cancel the hover delay', async ({ page }) => {
  await gotoWithOptions(page);
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 100));
  await compact(page).hover({ force: true });
  await page.clock.runFor(300);
  await expect(trigger(page)).toHaveCount(0);
  await page.mouse.move(40, 200);
  // Advance past the cancelled timer without waiting in real time.
  await page.clock.runFor(1000);
  await expect(trigger(page)).toHaveCount(0);
  await compact(page).hover({ force: true });
  await page.clock.runFor(300);
  await expect(trigger(page)).toHaveCount(0);
  await page.clock.runFor(250);
  await expect(trigger(page)).toBeVisible();
});

test('double click no longer opens options, and the hover control stays hidden during a drag', async ({
  page,
}) => {
  await gotoWithOptions(page);
  const box = (await compact(page).boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + 16, { delay: 90 });
  await expect(options(page)).toHaveCount(0);
  if ((await island(page).getAttribute('data-expanded')) === 'true') {
    await page.keyboard.press('Escape');
  }
  await compact(page).hover();
  await expect(trigger(page)).toBeVisible();
  const start = (await compact(page).boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, 16);
  await page.mouse.down();
  await expect(island(page)).toHaveAttribute('data-dragging', 'true');
  await expect(trigger(page)).toHaveCount(0);
  await page.mouse.move(start.x + start.width / 2 + 100, 16, { steps: 5 });
  // Let go once still, so it stays where it was placed rather than being thrown.
  await page.waitForTimeout(120);
  await page.mouse.up();
  await expect(island(page)).toHaveAttribute('data-expanded', 'false');
  await expect.poll(() => centre(page)).toBeCloseTo(820, 0);
});

test('the floating button stays on screen at the right edge and in a narrow preview', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await page.evaluate("import('/src/api.ts').then(({ api }) => api.islandPosition(1))");
  await expect.poll(() => centre(page)).toBeCloseTo(1200, 0);
  await compact(page).hover();
  await expect(trigger(page)).toBeVisible();
  let button = (await trigger(page).boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(1440);
  await trigger(page).click();
  await expect(options(page)).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(page.locator('.island-options-pill')).toHaveCSS('height', '28px');
  const edge = (await options(page).boundingBox())!;
  expect(edge.x + edge.width).toBeLessThanOrEqual(1440);
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 320, height: 800 });
  await compact(page).hover();
  await expect(trigger(page)).toBeVisible();
  button = (await trigger(page).boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(320);
  await trigger(page).click();
  await expect(options(page)).toBeVisible();
  await expect(options(page)).toHaveAttribute('aria-orientation', 'horizontal');
  await expect(page.locator('.island-options-pill')).toHaveCSS('height', '28px');
  const menu = (await options(page).boundingBox())!;
  expect(menu.x).toBeGreaterThanOrEqual(0);
  expect(menu.x + menu.width).toBeLessThanOrEqual(320);
});

test('Settings centres horizontally without closing and exposes Quit beside the app footer', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await compact(page).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => centre(page)).toBeCloseTo(744, 0);
  await compact(page).click();
  await island(page).getByRole('button', { name: 'Settings', exact: true }).click();
  const action = island(page).getByRole('button', { name: 'Centre horizontally', exact: true });
  await action.click();
  await expect.poll(() => centre(page)).toBeCloseTo(720, 0);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences.islandPosition)",
    ),
  ).toBe(0.5);
  await expect(
    island(page).locator('.about').getByRole('button', { name: 'Quit Glim' }),
  ).toBeDisabled();
});

test('the icon options toggle, dismiss on focus loss, and keep a failed action usable', async ({
  page,
}) => {
  await gotoWithOptions(page);
  await openOptions(page);
  await trigger(page).click();
  await expect(options(page)).toHaveCount(0);
  await trigger(page).click();
  await expect(options(page)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(options(page)).toHaveCount(0);
  await page.evaluate(
    "import('/src/api.ts').then(({ api }) => { api.islandPosition = async () => { throw new Error('Could not save position'); }; })",
  );
  await openOptions(page);
  const action = options(page).getByRole('menuitem', { name: 'Centre horizontally' });
  await action.click();
  await expect(page.getByRole('alert')).toContainText('Could not save position');
  await expect(action).toBeEnabled();
  await page.keyboard.press('ArrowRight');
  await expect(action).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(options(page)).toHaveCount(0);
});
