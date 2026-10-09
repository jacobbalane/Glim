import { expect, test, type Page } from '@playwright/test';

async function simulate(page: Page, activity: string, id: string, detail?: string) {
  await page.evaluate(
    ({ activity, id, detail }) =>
      window.postMessage(
        { type: 'glim:preview', status: activity, sessionId: id, detail },
        location.origin,
      ),
    { activity, id, detail },
  );
}

test('compact fits short text, scrolls long text, and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/?scene=compact-short&motion=1');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: 'Expand Glim' });
  await expect.poll(async () => (await island.boundingBox())?.width).toBeLessThan(180);
  const long = 'Checking the desktop installation and verifying the agent connections';
  await simulate(page, 'working', 'demo-claude', long);
  await expect.poll(async () => (await island.boundingBox())?.width).toBeCloseTo(360, 0);
  await expect(trigger).toContainText(long);
  const text = trigger.locator('.live-text-value');
  await expect
    .poll(
      async () => text.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41),
      { timeout: 7000 },
    )
    .toBeLessThan(-10);
  await simulate(page, 'working', 'demo-claude', 'Thinking');
  await expect.poll(async () => (await island.boundingBox())?.width).toBeLessThan(200);
  await expect(trigger).toContainText('Thinking');
  await expect(trigger.locator('.working-dots')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulate(page, 'working', 'demo-claude', long);
  await expect(trigger.locator('.live-text-frame:not([aria-hidden])')).not.toHaveClass(/overflows/);
  await expect(trigger.locator('.live-text-frame:not([aria-hidden]) .working-dots')).toHaveClass(
    /still/,
  );
});

test('sessions rotate, pause while reading, and briefly prioritize new attention', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/?scene=compact-rotation&motion=1');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: 'Expand Glim' });
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude');
  await page.clock.fastForward(6500);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await trigger.hover();
  await page.clock.fastForward(20000);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await page.mouse.move(20, 300);
  await simulate(page, 'waiting', 'demo-codex', 'Waiting for your answer');
  await page.clock.runFor(500);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-codex');
  await expect(island.getByRole('button', { name: /View sessions/ })).toContainText(
    '1 needs an answer',
  );
  await page.clock.fastForward(6500);
  await expect(trigger).not.toHaveAttribute('data-session-id', 'demo-codex');
  await simulate(page, 'finished', 'demo-claude-2', 'Session finished');
  await page.clock.runFor(500);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await expect(island.getByRole('button', { name: /View sessions/ })).toContainText('1 done');
  await island.getByRole('button', { name: /View sessions/ }).click();
  await expect(page.getByLabel('Agent sessions')).toBeVisible();
  await page.getByRole('button', { name: /glim-desktop/ }).click();
  await page.mouse.move(20, 300);
  await page.clock.fastForward(20000);
  await expect(page.getByRole('heading', { name: 'Claude Code', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Working', exact: true })).toBeVisible();
});

test('the same header position toggles the notch and status dots stay close', async ({ page }) => {
  await page.goto('/?scene=compact-short&motion=1');
  const island = page.getByTestId('island');
  const box = await island.getByRole('button', { name: 'Expand Glim' }).boundingBox();
  const point = { x: box!.x + box!.width / 2, y: 21 };
  await page.mouse.click(point.x, point.y);
  await expect(island).toHaveAttribute('data-expanded', 'true');
  await expect(page.getByRole('heading', { name: 'Ready', exact: true })).toBeVisible();
  await page.mouse.click(point.x, point.y);
  await expect(island).toHaveAttribute('data-expanded', 'false');
  await island.getByRole('button', { name: 'Expand Glim' }).click();
  await expect(page.locator('.notch-toolbar')).toHaveCSS('height', '42px');
  await simulate(page, 'waiting', 'demo-claude', 'Waiting for approval');
  await expect(page.locator('.notch-status .status-dot')).toHaveCSS(
    'background-color',
    'rgb(239, 182, 91)',
  );
  const gap = await page.locator('.notch-status').evaluate((node) => {
    const dot = node.querySelector('.status-dot')!.getBoundingClientRect();
    const text = node.querySelector('.changing-text')!.getBoundingClientRect();
    return text.left - dot.right;
  });
  expect(gap).toBeLessThanOrEqual(8);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
});
