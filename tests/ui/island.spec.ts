import { expect, test } from '@playwright/test';

test('island expands, selects a session, and interrupts cleanly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Expand Glim' }).click();
  await expect(page.getByRole('heading', { name: 'Claude Code', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Context used' })).toHaveAttribute(
    'aria-valuenow',
    '38',
  );
  await expect
    .poll(async () => (await page.getByTestId('island').boundingBox())?.width)
    .toBeCloseTo(440, 0);
  await page.screenshot({ path: 'test-results/island-expanded.png' });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Session usage details' })).toContainText(
    'Cached reads',
  );
  await expect(page.getByRole('region', { name: 'Session usage details' })).toContainText(
    '24% used',
  );
  await page.getByRole('button', { name: 'Back to agent', exact: true }).click();
  await page.getByRole('button', { name: 'Choose session' }).click();
  await page.getByRole('button', { name: /api-service/ }).click();
  await expect(page.getByRole('heading', { name: 'Codex', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Approval needed' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Expand Glim' })).toBeVisible();
  // Reversal while the previous transition is still settling must preserve control.
  await page.getByRole('button', { name: 'Expand Glim' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Expand Glim' }).click();
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
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('When idle').selectOption('pill');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.screenshot({ path: 'test-results/settings.png' });
  await page.getByRole('switch', { name: 'Pause monitoring' }).click();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible();
  await page.getByLabel('Filter by agent').selectOption('codex');
  await expect(page.locator('.usage-agent-row')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/history.png' });
});

test('empty data stays honest and reduced motion remains usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?demo=0');
  await page.getByRole('button', { name: 'Expand Glim' }).click();
  await expect(page.getByRole('heading', { name: 'No active agents' })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/island-empty.png' });
});

test('small preview remains readable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Expand Glim' }).click();
  await expect(page.getByRole('heading', { name: 'Claude Code', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
});

test('outside clicks collapse every view and compact stays black', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Expand Glim' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
  await page.mouse.click(40, 100);
  await expect(page.getByRole('button', { name: 'Expand Glim' })).toBeVisible();
  await expect(page.locator('.island')).toHaveCSS('background-color', 'rgb(0, 0, 0)');
  await expect(page.locator('.working-indicator')).toHaveCount(0);
  await page.getByRole('button', { name: 'Set up', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: 'Expand Glim' })).toBeVisible();
});
