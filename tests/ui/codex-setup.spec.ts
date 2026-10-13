import { expect, test } from '@playwright/test';

test('adding Codex hooks keeps the trust instructions visible without claiming connection', async ({
  page,
}) => {
  await page.goto('/?scene=agents&motion=1');
  const codex = page.locator('.conn').filter({ hasText: 'Codex' });
  await codex.locator('.conn-head').click();
  await expect(codex.getByLabel('Codex setup steps')).toContainText('/hooks');
  await codex.getByRole('button', { name: 'Add Codex hooks', exact: true }).click();
  await expect(codex.locator('.conn-status')).toHaveText('Hooks added');
  await expect(codex.locator('.conn-head')).toHaveAttribute('aria-expanded', 'true');
  await expect(codex.getByLabel('Codex setup steps')).toContainText('review and trust');
  await expect(codex.getByLabel('Codex setup steps')).toContainText('start a new session');
  await expect(codex.getByText('Connected', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Codex hooks added.');
  await expect(page.getByRole('status')).not.toContainText('Codex connected');
  await codex.locator('.conn-head').click();
  await codex.locator('.conn-head').click();
  await expect(codex.getByLabel('Codex setup steps')).toBeVisible();
  await page.getByTestId('island').screenshot({ path: 'test-results/codex-hooks-added.png' });

  await codex.getByRole('button', { name: 'Disconnect…' }).click();
  await codex.getByRole('button', { name: 'Remove from hooks.json' }).click();
  await expect(codex.locator('.conn-status')).toHaveCount(0);
});

test('previously added Codex hooks still explain the separate trust step in Settings', async ({
  page,
}) => {
  await page.goto('/?scene=settings&motion=1');
  const codex = page.locator('.conn').filter({ hasText: 'Codex' });
  await expect(codex.locator('.conn-status')).toHaveText('Hooks added');
  await codex.locator('.conn-head').click();
  await expect(codex.getByLabel('Codex setup steps')).toContainText(
    "cannot confirm Codex's trust setting",
  );
  await expect(codex.getByRole('button', { name: 'Add Codex hooks', exact: true })).toHaveCount(0);
});
