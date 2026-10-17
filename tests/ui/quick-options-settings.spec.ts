import { expect, test, type Page } from '@playwright/test';

const compact = (page: Page) => page.getByRole('button', { name: /^Glim:/ });
const trigger = (page: Page) => page.getByRole('button', { name: 'Glim options', exact: true });
const menu = (page: Page) => page.getByRole('menu', { name: 'Glim options' });
async function settings(page: Page) {
  await page.goto('/');
  await compact(page).click();
  await page.getByTestId('island').getByRole('button', { name: 'Settings', exact: true }).click();
}
async function openOptions(page: Page) {
  await compact(page).hover();
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
}
const saved = (page: Page, key: string) =>
  page.evaluate(
    `import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences.${key})`,
  );

test('quick options are hidden by default, including keyboard and context access', async ({
  page,
}) => {
  await page.goto('/');
  await compact(page).hover();
  await page.waitForTimeout(700);
  await expect(trigger(page)).toHaveCount(0);
  await compact(page).focus();
  await page.keyboard.press('Shift+F10');
  await expect(trigger(page)).toHaveCount(0);
  await expect(menu(page)).toHaveCount(0);
  await compact(page).click();
  await page.getByTestId('island').getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('switch', { name: 'Quick options' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});

test('settings select actions and save pointer and keyboard reordering', async ({ page }) => {
  await settings(page);
  const toggle = page.getByRole('switch', { name: 'Quick options' });
  await toggle.click();
  const list = page.getByRole('list', { name: 'Quick options order' });
  await expect(list.getByRole('listitem')).toHaveCount(6);
  await expect(page.getByRole('checkbox', { name: 'Centre horizontally' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.getByRole('checkbox', { name: 'Pause monitoring' }).click();
  await page.getByRole('checkbox', { name: 'Quit Glim' }).click();
  const row = page.getByRole('listitem', { name: 'Reorder Pause monitoring' });
  await row.scrollIntoViewIfNeeded();
  const from = (await row.boundingBox())!;
  const to = (await page
    .getByRole('listitem', { name: 'Reorder Centre horizontally' })
    .boundingBox())!;
  await page.mouse.move(from.x + 70, from.y + 22);
  await page.mouse.down();
  await page.mouse.move(from.x + 70, to.y + 12, { steps: 12 });
  await page.mouse.up();
  await expect(list.getByRole('listitem').first()).toHaveAttribute(
    'aria-label',
    'Reorder Pause monitoring',
  );
  await expect.poll(() => saved(page, 'quickOptionsOrder[0]')).toBe('pause');
  await row.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(list.getByRole('listitem').first()).toHaveAttribute(
    'aria-label',
    'Reorder Pause monitoring',
  );
  await row.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect.poll(() => saved(page, 'quickOptionsOrder[0]')).toBe('centre');
  await toggle.click();
  await expect(list).toHaveCount(0);
  await toggle.click();
  await expect(list.getByRole('listitem').nth(1)).toHaveAttribute(
    'aria-label',
    'Reorder Pause monitoring',
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await openOptions(page);
  await expect(menu(page).getByRole('menuitem')).toHaveCount(2);
  await expect(menu(page).getByRole('menuitem').nth(1)).toHaveAttribute(
    'aria-label',
    'Pause monitoring',
  );
  await menu(page).getByRole('menuitem', { name: 'Pause monitoring' }).click();
  await expect.poll(() => saved(page, 'paused')).toBe(true);
  await openOptions(page);
  await menu(page).getByRole('menuitem', { name: 'Resume monitoring' }).click();
  await expect.poll(() => saved(page, 'paused')).toBe(false);
});

test('empty selection hides the pill and six actions stay inside narrow previews', async ({
  page,
}) => {
  await page.goto('/');
  await expect(compact(page)).toBeVisible();
  await page.evaluate(
    "import('/src/api.ts').then(async ({ api }) => { const s = await api.snapshot(); await api.savePreferences({ ...s.preferences, quickOptionsEnabled: true, quickOptions: [] }); })",
  );
  await compact(page).hover();
  await page.waitForTimeout(700);
  await expect(trigger(page)).toHaveCount(0);
  await page.evaluate(
    "import('/src/api.ts').then(async ({ api }) => { const s = await api.snapshot(); await api.savePreferences({ ...s.preferences, quickOptions: s.preferences.quickOptionsOrder }); })",
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await openOptions(page);
  await expect(page.locator('.island-options-pill')).toHaveCSS('width', '208px');
  await expect(page.locator('.island-options-pill')).toHaveCSS('height', '28px');
  const box = (await page.locator('.island-options-pill').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await menu(page).getByRole('menuitem', { name: 'Usage history' }).click();
  await expect(page.getByRole('heading', { name: 'Usage', exact: true })).toBeVisible();
});

test('a failed quick options save restores the saved selection', async ({ page }) => {
  await settings(page);
  await page.getByRole('switch', { name: 'Quick options' }).click();
  await page.evaluate(
    "import('/src/api.ts').then(async ({ api }) => { api.savePreferences = async () => { throw new Error('Disk unavailable'); }; await api.islandPosition(0.5); })",
  );
  const checkbox = page.getByRole('checkbox', { name: 'Pause monitoring' });
  await checkbox.click();
  await expect(page.getByRole('alert')).toContainText('Disk unavailable');
  await expect(checkbox).toHaveAttribute('aria-checked', 'false');
});
