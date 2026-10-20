import { expect } from '@playwright/test';

export async function scenario(page, screenshot, { navigate = true, permissions = false } = {}) {
  const projectLabel = permissions ? 'MCP permissions proof' : 'MCP proof';
  const directory = permissions ? process.env.PROOF_PERMISSION_PROJECT : process.env.PROOF_PROJECT;
  let blockedCallback = false;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return ['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol === 'openchamber-ui:' ? route.continue() : route.abort('blockedbyclient');
  });
  if (process.env.PROOF_NEGATIVE) {
    await page.route('**/api/session/*/mcp/call', (route) => {
      blockedCallback = true;
      return route.abort('failed');
    });
  }
  if (permissions) await page.route('**/api/session', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(),
      permissions: [{ action: 'demo_increment_counter', resource: '*', effect: 'ask' }],
    }) });
  });
  if (navigate) await page.goto('/');
  await expect(page.getByRole('button', { name: projectLabel, exact: true })).toBeVisible();
  await page.getByRole('button', { name: projectLabel, exact: true }).click();
  const projectRow = page.getByRole('button').filter({ has: page.getByRole('button', { name: projectLabel, exact: true }) });
  await projectRow.getByRole('button', { name: /^New (draft )?session$/ }).press('Enter');
  const editor = page.getByTestId('chat-input').getByRole('textbox');
  await editor.fill('Show the MCP demo app.');
  await editor.press('Enter');

  const frameElement = page.getByTestId('mcp-app-frame');
  // Tool rows are deliberately collapsed by default.
  const tool = page.getByRole('button', { name: 'Demo show demo app', exact: true });
  await expect(tool).toBeVisible({ timeout: 60_000 });
  if (!(await frameElement.count())) await tool.click();
  await expect(frameElement, 'MCP App must render').toBeVisible();
  await expect(frameElement).toHaveAttribute('sandbox', 'allow-scripts');
  const app = page.frameLocator('[data-testid="mcp-app-frame"]');
  await expect(app.getByTestId('demo-app-root')).toBeVisible();
  await expect(app.getByTestId('demo-app-root')).toContainText('OpenUI counter');
  await expect(app.getByTestId('demo-count')).toHaveText('0');
  await expect(app.getByTestId('demo-increment')).toBeEnabled({ timeout: 15_000 });
  const callback = page.waitForRequest('**/api/session/*/mcp/call');
  await app.getByTestId('demo-increment').click();
  const request = await callback;
  expect(request.postDataJSON()).toEqual({ messageID: expect.stringMatching(/^msg_/), server: 'demo', tool: 'increment_counter', arguments: { by: 1 } });
  expect(request.headers()['x-opencode-directory']).toBe(encodeURIComponent(directory));
  if (permissions) {
    const dock = page.getByRole('dialog', { name: 'Permission required', exact: true });
    await expect(dock, 'Callback must show PermissionDock').toBeVisible();
    await dock.getByRole('button', { name: /^Deny/ }).click();
    expect((await request.response()).status()).toBe(403);
    await expect(app.getByTestId('demo-count')).toHaveText('0');
    await expect(page.getByTestId('mcp-app-status')).toContainText('failed');
    const allowed = page.waitForResponse('**/api/session/*/mcp/call');
    await app.getByTestId('demo-increment').click();
    await expect(dock).toBeVisible();
    await dock.getByRole('button', { name: /^Allow once/ }).click();
    expect((await allowed).status()).toBe(200);
    // The first permitted server call returns 1, proving rejection never reached tools/call.
  }
  if (process.env.PROOF_NEGATIVE) await expect.poll(() => blockedCallback).toBe(true);
  else if (!permissions) expect((await request.response()).status()).toBe(200);
  await expect(app.getByTestId('demo-count'), 'MCP callback must increment count').toHaveText('1');
  await expect(page.getByTestId('mcp-app-status')).toContainText('increment_counter');

  const frame = await frameElement.elementHandle().then((handle) => handle.contentFrame());
  const blocked = await frame.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
    let fetchRejected = false;
    try { await fetch('https://example.com/mcp-proof'); } catch { fetchRejected = true; }
    await new Promise((resolve) => {
      const image = new Image();
      image.onload = image.onerror = resolve;
      image.src = 'https://example.com/mcp-proof.png';
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { fetchRejected, violations };
  });
  expect(blocked.fetchRejected).toBe(true);
  expect(blocked.violations).toEqual(expect.arrayContaining(['connect-src', 'img-src']));
  await page.screenshot({ path: screenshot, fullPage: true });
  return { frame, blocked };
}
