import { expect, test, type Page } from '@playwright/test';
import { hasGpu } from './gpu';

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

test('compact fits its text, loops only the status, and respects reduced motion', async ({
  page,
}) => {
  await page.goto('/?scene=compact-short&motion=1');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: /^Glim:/ });
  await expect.poll(async () => (await island.boundingBox())?.width).toBeLessThan(260);
  await expect.poll(async () => (await island.boundingBox())?.height).toBeCloseTo(34, 0);
  const long = 'Checking the desktop installation and verifying the agent connections';
  await simulate(page, 'working', 'demo-claude', long);
  await expect.poll(async () => (await island.boundingBox())?.width).toBeCloseTo(360, 0);
  const ticker = trigger.locator('.compact-text:not([aria-hidden]) .ticker');
  const title = trigger.locator('.compact-text:not([aria-hidden]) .compact-title');
  const titleX = (await title.boundingBox())!.x;
  await expect
    .poll(
      async () => ticker.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m41),
      { timeout: 7000 },
    )
    .toBeLessThan(-10);
  expect((await title.boundingBox())!.x).toBeCloseTo(titleX, 0);
  await trigger.hover();
  await expect(ticker).toHaveCSS('animation-play-state', 'paused');
  await simulate(page, 'working', 'demo-claude', 'Thinking');
  await expect.poll(async () => (await island.boundingBox())?.width).toBeLessThan(280);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await simulate(page, 'working', 'demo-claude', long);
  await expect(ticker).toHaveCSS('animation-name', 'none');
  const character = island.locator('.glim-character[data-mood="scan"]');
  await expect(character).toHaveAttribute(
    'data-renderer',
    (await hasGpu(page)) ? '3d' : 'fallback',
  );
  await expect(character).toHaveAttribute('data-motion', 'false');
  // No hover tooltip; the full status is in its accessible name.
  expect(await trigger.getAttribute('aria-label')).toContain(`glim-desktop · Claude, ${long}`);
});

test('working agents rotate by project, notices present once then dock, and hover holds', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/?scene=compact-rotation&motion=1');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: /^Glim:/ });
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-codex');
  await page.clock.fastForward(6500);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await trigger.hover();
  await page.clock.fastForward(20000);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await page.mouse.move(20, 300);
  await simulate(page, 'waiting', 'demo-codex', 'Waiting for your answer');
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-codex');
  await expect(trigger).toContainText('Needs an answer');
  await expect(island.locator('.inbox-row')).toHaveCount(0);
  await trigger.hover();
  await page.clock.fastForward(15000);
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-codex');
  await page.mouse.move(20, 300);
  await page.clock.fastForward(7500);
  const approval = island.getByRole('button', {
    name: 'api-service · Codex: Needs an answer. Open.',
  });
  await expect(approval).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await page.clock.fastForward(6500);
    await expect(trigger).not.toHaveAttribute('data-session-id', 'demo-codex');
    await expect(approval).toBeVisible();
  }
  await simulate(page, 'idle', 'demo-claude-2', 'Turn finished');
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude-2');
  await expect(trigger).toContainText('Your turn');
  await page.clock.fastForward(5500);
  const done = island.getByRole('button', { name: 'design-system · Claude: Your turn. Open.' });
  await expect(done).toBeVisible();
  await expect(island.locator('.inbox-row')).toHaveCount(2);
  await done.click();
  await expect(
    page.getByRole('heading', { name: 'design-system · Claude', exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(20000);
  await expect(
    page.getByRole('heading', { name: 'design-system · Claude', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.clock.runFor(500);
  await expect(island.locator('.inbox-row')).toHaveCount(1);
  await expect(approval).toBeVisible();
  await approval.click();
  await expect(
    page.getByRole('heading', { name: 'api-service · Codex', exact: true }),
  ).toBeVisible();
});

test('the same header position toggles the island and status stays close to its character', async ({
  page,
}) => {
  await page.goto('/?scene=compact-short&motion=1');
  const island = page.getByTestId('island');
  const box = await island.getByRole('button', { name: /^Glim:/ }).boundingBox();
  const point = { x: box!.x + box!.width / 2, y: 17 };
  await page.mouse.click(point.x, point.y);
  await expect(island).toHaveAttribute('data-expanded', 'true');
  await expect(
    page.locator('.frame:not([aria-hidden]) .glance-body > :not([aria-hidden]) .hero .chip'),
  ).toHaveText('Ready');
  await page.mouse.click(point.x, point.y);
  await expect(island).toHaveAttribute('data-expanded', 'false');
  await island.getByRole('button', { name: /^Glim:/ }).click();
  await expect(page.locator('.bar')).toHaveCSS('height', '42px');
  await simulate(page, 'waiting', 'demo-claude', 'Waiting for approval');
  await expect(
    page.locator('.frame:not([aria-hidden]) .glance-body > :not([aria-hidden]) .hero .chip'),
  ).toHaveCSS('color', 'rgb(255, 197, 61)');
  await expect(
    page.locator('.frame:not([aria-hidden]) .glance-body > :not([aria-hidden]) .hero .chip'),
  ).toHaveCSS('gap', '7px');
  await island.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
});

test('existing notices dock silently and disappear when their agent resumes', async ({ page }) => {
  await page.goto('/?scene=compact&motion=1');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: /^Glim:/ });
  await expect(trigger).toHaveAttribute('data-session-id', 'demo-claude');
  await expect(island.locator('.inbox-row')).toHaveCount(1);
  await simulate(page, 'working', 'demo-codex', 'Running tests');
  await expect(island.locator('.inbox-row')).toHaveCount(0);
  await expect(island).toHaveAttribute('data-expanded', 'false');
});

test('notices can stay tucked away without losing sessions or blocking updates', async ({
  page,
}) => {
  await page.goto('/');
  const island = page.getByTestId('island');
  const trigger = island.getByRole('button', { name: /^Glim:/ });
  const hide = island.getByRole('button', { name: 'Hide notices' });
  const show = island.getByRole('button', { name: 'Show notices' });
  await expect(island.locator('.inbox-row')).toHaveCount(3);
  await expect(island.getByRole('button', { name: '2 more', exact: true })).toBeVisible();
  await hide.click();
  await expect(island.locator('.inbox-row')).toHaveCount(0);
  await expect.poll(async () => (await island.boundingBox())?.height).toBeCloseTo(34, 0);
  await expect(show).toBeVisible();
  await expect(island).toHaveAttribute('data-expanded', 'false');

  // Opening the island still exposes every session; closing keeps the user's choice.
  await trigger.click();
  await expect(island.locator('.bar-title')).toContainText('8 projects');
  await expect(island.getByText('Needs approval', { exact: true })).toHaveCount(3);
  await expect(island.getByText('Error', { exact: true })).toHaveCount(2);
  await expect(island.getByText('Done', { exact: true })).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(show).toBeVisible();
  await expect(island.locator('.inbox-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Finished', exact: true }).click();
  await expect(trigger).toContainText('Done');
  await expect.poll(async () => (await island.boundingBox())?.height).toBeCloseTo(34, 0);

  await show.click();
  await expect(island.locator('.inbox-row')).toHaveCount(3);
  await expect(
    island.getByRole('button', { name: 'api-service · Codex: Needs approval. Open.' }),
  ).toBeVisible();
  // Both directions keep keyboard focus usable, including with reduced motion.
  await page.setViewportSize({ width: 430, height: 800 });
  await hide.focus();
  await page.keyboard.press('Enter');
  await expect(show).toBeFocused();
  await expect.poll(async () => (await island.boundingBox())?.height).toBeCloseTo(34, 0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
  await expect(island.locator('.inbox-row')).toHaveCount(3);
  await expect(island).toHaveAttribute('data-expanded', 'false');
});

test('connector disclosure preserves connection until the named removal is confirmed', async ({
  page,
}) => {
  await page.goto('/?scene=settings&motion=1');
  const claude = page.locator('.conn').filter({ hasText: 'Claude Code' });
  await claude.getByRole('button', { name: /Claude Code.*Connected/ }).click();
  await expect(claude.locator('.conn-status')).toHaveText('Connected');
  await claude.getByRole('button', { name: 'Disconnect…' }).click();
  await expect(claude.locator('.conn-status')).toHaveText('Connected');
  await claude.getByRole('button', { name: 'Keep', exact: true }).click();
  await claude.getByRole('button', { name: 'Disconnect…' }).click();
  await claude.getByRole('button', { name: 'Remove from settings.json' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'disconnected' })).toBeVisible();
  await expect(claude.locator('.conn-status')).toHaveCount(0);
  await claude.getByRole('button', { name: /Claude Code.*Connect/ }).click();
  await claude.getByRole('button', { name: 'Connect Claude', exact: true }).click();
  await expect(claude.locator('.conn-status')).toHaveText('Connected');
});

test('failed connector and history calls remain honest and recoverable', async ({ page }) => {
  await page.route('**/src/api.ts*', async (route) => {
    const response = await route.fetch();
    const body =
      (await response.text()) +
      `
      api.connector = async () => { throw new Error('Connection unavailable'); };
      api.history = async () => { throw new Error('History unavailable'); };
    `;
    await route.fulfill({ response, body });
  });
  await page.goto('/?scene=agents&motion=1');
  const claude = page.locator('.conn').filter({ hasText: 'Claude Code' });
  await claude.getByRole('button', { name: /Claude Code.*Connect/ }).click();
  await claude.getByRole('button', { name: 'Connect Claude', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connection unavailable');
  await expect(claude.getByRole('button', { name: 'Connect Claude', exact: true })).toBeEnabled();
  await expect(claude.locator('.conn-status')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Usage', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('History unavailable');
  await expect(page.locator('.usage-total')).toHaveCount(0);
});

test('clearing history calls the API only after confirmation', async ({ page }) => {
  await page.goto('/?scene=settings&motion=1');
  await page.getByRole('button', { name: 'Clear…', exact: true }).click();
  await expect(
    page.getByText("Deletes Glim's saved counters. Agent files stay intact."),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.locator('.projects li')).not.toHaveCount(0);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Clear…', exact: true }).click();
  await page.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'History cleared.' })).toBeVisible();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await expect(page.getByText('Nothing recorded in this period.')).toBeVisible();
});

test('the glow slider sets how strongly the island lights up, down to off', async ({ page }) => {
  await page.goto('/?scene=settings&motion=1');
  const slider = page.getByRole('slider', { name: 'Glow' });
  const island = page.getByTestId('island');
  await expect(slider).toHaveValue('50');
  await expect(slider).toHaveAttribute('aria-valuetext', '50%');
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveAttribute('aria-valuetext', 'Off');
  await expect(island).toHaveAttribute('data-glow', 'off');
  await page.keyboard.press('End');
  await expect(slider).toHaveAttribute('aria-valuetext', '100%');
  await expect(island).not.toHaveAttribute('data-glow', 'off');
  await expect
    .poll(() =>
      island.evaluate((el) => getComputedStyle(el).getPropertyValue('--glow-level').trim()),
    )
    .toBe('1');
  const saved = await page.evaluate(
    "import('/src/api.ts').then(({ api }) => api.snapshot()).then(s => s.preferences.glow)",
  );
  expect(saved).toBe(100);
});
