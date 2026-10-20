import { expect, test } from '@playwright/test';
import { scenario } from './scenario.mjs';

test('a model tool renders OpenUI, calls MCP through the host, and stays sandboxed', async ({ page }) => {
  const { frame } = await scenario(page, test.info().outputPath('mcp-app.png'));
  await frame.evaluate(() => { location.href = 'about:blank'; });
  await expect(page.getByTestId('mcp-app-status')).toHaveText('App navigated away — disabled');
  const answered = await frame.evaluate(async () => {
    let replied = false;
    addEventListener('message', () => { replied = true; });
    parent.postMessage({ jsonrpc: '2.0', id: 'after-navigation', method: 'ui/initialize' }, '*');
    await new Promise((resolve) => setTimeout(resolve, 200));
    return replied;
  });
  expect(answered, 'Navigated frame must never regain its bridge').toBe(false);
});

test('MCP callback permission is visible, rejection reaches no tool, approval returns one', async ({ page }) => {
  test.skip(Boolean(process.env.PROOF_NEGATIVE), 'Negative control exercises the original callback assertion only');
  await scenario(page, test.info().outputPath('mcp-permission.png'), { permissions: true });
});
