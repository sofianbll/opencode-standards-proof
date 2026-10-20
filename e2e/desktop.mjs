import { _electron, expect } from '@playwright/test';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { scenario } from './scenario.mjs';

export async function desktopPass({ root, state, project, env }) {
  if (process.platform !== 'darwin') throw new Error('This desktop proof targets macOS only');
  const electronDir = join(root, '.build/openchamber/packages/electron');
  const require = createRequire(join(electronDir, 'package.json'));
  const executablePath = require('electron');
  // Same assets/entry as electron:dev:bundled, without a rebuild or bun x download.
  cpSync(join(root, '.build/openchamber/packages/web/dist'), join(electronDir, 'resources/web-dist'), { recursive: true });
  const output = join(root, 'desktop-results');
  mkdirSync(output, { recursive: true });
  const log = { console: [], pageErrors: [], crashes: [], navigations: [] };
  const app = await _electron.launch({ executablePath, args: [join(electronDir, 'entry.mjs')], cwd: project, env: {
    ...env, PROOF_PROJECT: project,
    OPENCHAMBER_ELECTRON_DEV: '1', OPENCHAMBER_ELECTRON_USE_BUNDLED_UI: '1',
    OPENCHAMBER_DISABLE_PWA_DEV: '1', OPENCHAMBER_OPENCODE_CWD: project,
    OPENCHAMBER_DESKTOP_USER_DATA_DIR: join(state, 'desktop-profile'),
  }, timeout: 60_000 });
  const electronProcess = app.process();
  const stdout = [], stderr = [];
  electronProcess.stdout.on('data', (chunk) => stdout.push(chunk.toString()));
  electronProcess.stderr.on('data', (chunk) => stderr.push(chunk.toString()));
  try {
    // Main-process guard precedes renderer routing, including startup and navigation.
    await app.evaluate(({ session, app }) => {
      globalThis.proofNavigation = [];
      app.on('web-contents-created', (_event, contents) => {
        contents.on('render-process-gone', (_event, details) => globalThis.proofNavigation.push({ crash: details.reason }));
      });
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        const url = new URL(details.url);
        const blocked = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname);
        if (blocked) globalThis.proofNavigation.push({ networkGuard: details.url });
        callback({ cancel: blocked });
      });
    });
    await app.context().tracing.start({ screenshots: true, snapshots: true, sources: true });
    const page = await app.firstWindow();
    page.on('console', (message) => log.console.push({ type: message.type(), text: message.text() }));
    page.on('pageerror', (error) => log.pageErrors.push(error.message));
    page.on('crash', () => log.crashes.push('main renderer crashed'));
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 120_000 });
    log.url = page.url();
    await page.screenshot({ path: join(output, 'startup.png') });
    // Install observation after shell handlers: defaultPrevented proves Electron,
    // rather than the network fallback or Playwright route, refused navigation.
    await app.evaluate(({ BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) window.webContents.on('will-frame-navigate', (event) => {
        globalThis.proofNavigation.push({ url: event.url, isMainFrame: event.isMainFrame, prevented: event.defaultPrevented });
      });
    });
    process.env.PROOF_PROJECT = project;
    const { frame, blocked } = await scenario(page, join(output, 'counter-1.png'), { navigate: false });
    log.csp = blocked;
    log.frameBefore = await frame.evaluate(() => location.href);
    await frame.evaluate(() => { location.href = 'https://example.com'; });
    await expect.poll(async () => app.evaluate(() => globalThis.proofNavigation.some((event) => event.url === 'https://example.com/' && event.prevented))).toBe(true);
    // Electron cancellation clears Playwright's frame URL cache, not the document.
    log.frameAfter = await frame.evaluate(() => location.href);
    expect(log.frameAfter).toBe(log.frameBefore);
    await expect(page.frameLocator('[data-testid="mcp-app-frame"]').getByTestId('demo-count')).toHaveText('1');
    await page.screenshot({ path: join(output, 'navigation-blocked.png') });
    log.navigations = await app.evaluate(() => globalThis.proofNavigation);
    expect(log.navigations.some((event) => event.networkGuard?.startsWith('https://example.com'))).toBe(false);
    expect(log.pageErrors).toEqual([]);
    expect(log.crashes).toEqual([]);
    const unexpectedErrors = log.console.filter((message) => message.type === 'error' &&
      !/ERR_BLOCKED_BY_CLIENT|violates the following Content Security Policy|violates the document's Content Security Policy/.test(message.text));
    expect(unexpectedErrors).toEqual([]);
    log.result = 'PASS';
    console.log('DESKTOP PASS: OpenUI 0→1, status, CSP and Electron srcdoc navigation guard verified.');
  } finally {
    log.navigations = await app.evaluate(() => globalThis.proofNavigation).catch(() => []);
    await app.context().tracing.stop({ path: join(output, 'trace.zip') });
    // Shutdown closes the server's stream; do not misclassify it as startup failure.
    for (const page of app.windows()) {
      page.removeAllListeners('console'); page.removeAllListeners('pageerror'); page.removeAllListeners('crash');
    }
    await app.close();
    writeFileSync(join(output, 'result.json'), JSON.stringify(log, null, 2));
    writeFileSync(join(state, 'electron.log'), stdout.join('') + stderr.join(''));
    console.log(`Desktop evidence: ${output}`);
  }
}
