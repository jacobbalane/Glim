import { expect, test } from '@playwright/test';

test('island expands, selects a session, and interrupts cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(
    page.getByRole('heading', { name: 'glim-desktop · Claude', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Context' })).toHaveAttribute(
    'aria-valuenow',
    '38',
  );
  await expect
    .poll(async () => (await page.getByTestId('island').boundingBox())?.width)
    .toBeCloseTo(440, 0);
  await page.screenshot({ path: 'test-results/island-expanded.png' });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Session usage details' })).toContainText(
    'Read from cache',
  );
  await expect(page.getByRole('region', { name: 'Session usage details' })).toContainText('24%');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: /api-service/ }).click();
  await expect(
    page.getByRole('heading', { name: 'api-service · Codex', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.frame:not([aria-hidden]) .glance-body > :not([aria-hidden]) .hero .chip'),
  ).toHaveText('Needs approval');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^Glim:/ })).toBeVisible();
  // Reversal while the previous transition is still settling must preserve control.
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.getByTestId('island')).toHaveAttribute('data-expanded', 'true');
  expect(errors).toEqual([]);
});

test('onboarding preferences, pause, and history filters work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up', exact: true }).click();
  await page.getByRole('button', { name: 'Say hello to Glim' }).click();
  await expect(page.getByRole('button', { name: 'Say hello to Glim' })).toContainText('Hello.');
  await page.screenshot({ path: 'test-results/onboarding.png' });
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Connect your agents' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Keep visible' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByTestId('island').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.getByRole('switch', { name: 'Pause monitoring' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Monitoring is paused.', { exact: false })).toBeVisible();
  await page.getByTestId('island').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible();
  await page
    .getByRole('group', { name: 'Agent', exact: true })
    .getByRole('button', { name: 'Codex' })
    .click();
  await expect(page.locator('.projects li')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/history.png' });
});

test('empty data stays honest and reduced motion remains usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=0');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.getByRole('heading', { name: 'No agents running' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/island-empty.png' });
});

test('small preview remains readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(
    page.getByRole('heading', { name: 'glim-desktop · Claude', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('outside clicks collapse every view and compact stays black', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await page.getByTestId('island').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await page.mouse.click(40, 100);
  await expect(page.getByRole('button', { name: /^Glim:/ })).toBeVisible();
  await expect(page.locator('.island')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await page.getByRole('button', { name: 'Set up', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: /^Glim:/ })).toBeVisible();
});

test('the full message opens right of the island without making it taller', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  // Pick the agent once the open island has settled, as someone reading it would.
  await expect(page.locator('.frame[aria-hidden]')).toHaveCount(0);
  await page.getByRole('button', { name: /^design-system · Claude:/ }).click();
  const island = page.getByTestId('island');
  await page.waitForTimeout(800);
  const before = (await island.boundingBox())!;
  await page.getByRole('button', { name: 'Read what Claude said' }).click();
  const panel = page.getByRole('complementary', { name: 'What Claude said' });
  await expect(panel).toContainText('Want me to update the cards to match?');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThan(before.x + before.width);
  // Its bottom meets the island's.
  expect(box.y + box.height).toBeCloseTo(before.y + before.height, 0);
  await page.waitForTimeout(400);
  expect((await island.boundingBox())!.height).toBeCloseTo(before.height, 0);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
});

test('the open agent folds into the list, which stays until an agent is picked', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(
    page.getByRole('heading', { name: 'glim-desktop · Claude', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Show as a list' }).click();
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^glim-desktop · Claude:/ })).toBeVisible();
  // Closing and opening the island keeps the list.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.locator('.hero')).toHaveCount(0);
  await page.getByRole('button', { name: /^api-service · Codex:/ }).click();
  await expect(
    page.getByRole('heading', { name: 'api-service · Codex', exact: true }),
  ).toBeVisible();
});

test('around a Mac notch, nothing sits where the camera is and the open view starts below it', async ({
  page,
}) => {
  await page.goto('/?notch=200x32');
  const island = page.getByTestId('island');
  const button = page.locator('.compact.notched');
  await expect(button).toBeVisible();
  await page.waitForTimeout(600);
  const shape = (await island.boundingBox())!;
  const middle = shape.x + shape.width / 2;
  // The camera: 200 pixels wide at the top centre of the screen, which the island is centred on.
  const camera = { left: middle - 100, right: middle + 100 };
  for (const part of await button.locator('.wing > *').all()) {
    const box = await part.boundingBox();
    if (!box || box.width === 0) continue;
    expect(box.x + box.width <= camera.left + 0.5 || box.x >= camera.right - 0.5).toBe(true);
  }
  expect((await button.boundingBox())!.height).toBeCloseTo(32, 0);
  // The wings are as wide as the agent's name needs, the same on both sides of the camera.
  expect(
    await button.locator('.compact-title').evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const [left, right] = await button
    .locator('.wing')
    .evaluateAll((wings) => wings.map((wing) => wing.getBoundingClientRect().width));
  expect(left).toBeCloseTo(right, 0);
  await button.click();
  const bar = page.locator('.frame:not([aria-hidden]) .bar');
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.y).toBeGreaterThanOrEqual(32);
  await page.waitForTimeout(600);
  // Opening never narrows the island.
  expect((await island.boundingBox())!.width).toBeGreaterThanOrEqual(shape.width - 0.5);
});

test('the open island keeps its header in reach while its agents scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 380 });
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  const island = page.getByTestId('island');
  const list = page.locator('.frame:not([aria-hidden]) .glance');
  await expect.poll(() => list.evaluate((g) => g.scrollHeight > g.clientHeight)).toBe(true);
  await list.evaluate((g) => g.scrollTo({ top: g.scrollHeight }));
  const settings = island.getByRole('button', { name: 'Settings', exact: true });
  await expect.poll(async () => (await settings.boundingBox())?.y).toBeLessThan(42);
  await settings.click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
});

test('a long message shows it scrolls, and Escape closes it before the island', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.locator('.frame[aria-hidden]')).toHaveCount(0);
  await page.getByRole('button', { name: /^design-system · Claude:/ }).click();
  const preview = page.getByRole('button', { name: 'Read what Claude said' });
  await preview.click();
  const body = page.locator('.side-said-body');
  await expect(body).toBeVisible();
  await expect(page.locator('.side-said-track')).toHaveCount(0);
  await body.evaluate((el) => {
    el.querySelector('p')!.textContent = Array.from(
      { length: 16 },
      (_, i) => `Paragraph ${i + 1}: the cards now use the shared spacing scale.`,
    ).join('\n\n');
  });
  // More below: the bottom edge fades and the panel's own scrollbar appears.
  await expect(body).toHaveAttribute('data-more-below', 'true');
  await expect(body).toHaveAttribute('data-more-above', 'false');
  await expect(page.locator('.side-said-track i')).toBeVisible();
  await body.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(body).toHaveAttribute('data-more-below', 'false');
  await expect(body).toHaveAttribute('data-more-above', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: 'What Claude said' })).toHaveCount(0);
  await expect(page.getByTestId('island')).toHaveAttribute('data-expanded', 'true');
  await expect(preview).toBeFocused();
});
