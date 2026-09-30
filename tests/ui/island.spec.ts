import { test, expect } from '@playwright/test';

test('empty state, multiple sessions and exact-return affordance stay honest in preview', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Ready when you are' }).click();
  await expect(
    page.getByRole('heading', { name: 'A little quiet. A lot of possibility.' }),
  ).toBeVisible();
  await expect(page.getByText('Usage unavailable')).toHaveCount(2);
  await page.getByRole('button', { name: '6 sessions', exact: true }).click();
  await expect(page.locator('.session')).toHaveCount(6);
  await expect(page.getByText('Sample values')).toBeVisible();
  await page.locator('.session-button').filter({ hasText: 'glim' }).click();
  await page.getByRole('button', { name: 'Return to agent' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Demo session.' })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss message' }).click();
  await page.locator('.session-button').filter({ hasText: 'glim' }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() => page.locator('.island').evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
  await page.screenshot({ path: '.local/preview-expanded.png' });
  await page.getByRole('button', { name: 'Collapse island' }).click();
  await expect(page.getByRole('button', { name: '1 needs you' })).toBeVisible();
  await expect(page.locator('.island-panel')).toHaveCount(0);
  await expect
    .poll(() => page.locator('.island').evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
  await page.screenshot({ path: '.local/preview-compact.png' });
  expect(errors).toEqual([]);
});

test('attention does not steal browser focus, snooze suppresses previews, and stale quotas are labelled', async ({
  page,
}) => {
  await page.goto('/');
  const trigger = page.getByRole('button', { name: 'Needs you', exact: true });
  await trigger.click();
  await expect(page.getByText('Needs approval', { exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: /Needs approval glim/ }).click();
  await page.getByRole('button', { name: 'Pause alerts' }).click();
  await page.getByRole('button', { name: 'Collapse island' }).click();
  await page.getByRole('button', { name: 'Finished response', exact: true }).click();
  await expect(page.locator('.attention-preview')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stale readings' }).click();
  await page.locator('.island-toggle').click();
  await expect(page.getByText('Outdated', { exact: true })).toHaveCount(2);
  await expect(page.getByText('42', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Last seen: needs approval')).toBeVisible();
});

test('keyboard and reduced motion allow immediate collapse and preserve focus', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const toggle = page.locator('.island-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toBeFocused();
  await expect(page.locator('.island-panel')).toHaveCount(0);
});

test('rapid reversals settle closed and the expanded island fits a narrow viewport', async ({
  page,
}) => {
  await page.goto('/');
  const toggle = page.locator('.island-toggle');
  await toggle.click();
  await toggle.click();
  await toggle.click();
  await page.getByRole('button', { name: 'Collapse island' }).click();
  await expect(page.locator('.island-panel')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '6 sessions', exact: true }).click();
  await toggle.click();
  await expect
    .poll(() => page.locator('.island').evaluate((el) => getComputedStyle(el).transform))
    .toBe('none');
  const box = await page.locator('.island').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.local/preview-narrow.png' });
});
