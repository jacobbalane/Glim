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
  await expect(page.locator('.hero .chip')).toHaveText('Needs approval');
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
  await page.getByRole('button', { name: /^design-system · Claude:/ }).click();
  const island = page.getByTestId('island');
  await page.waitForTimeout(800);
  const before = (await island.boundingBox())!;
  await page.getByRole('button', { name: 'Read what Claude said' }).click();
  const panel = page.getByRole('complementary', { name: 'What Claude said' });
  await expect(panel).toContainText('Want me to update the cards to match?');
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThan(before.x + before.width);
  await page.waitForTimeout(400);
  expect((await island.boundingBox())!.height).toBeCloseTo(before.height, 0);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toHaveCount(0);
});
