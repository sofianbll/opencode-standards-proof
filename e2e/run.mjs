import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, realpathSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve, join } from 'node:path';

const negative = process.argv.includes('--negative');
const desktop = process.argv.includes('--desktop');
const plugins = process.argv.includes('--plugins');
if (desktop && negative) throw new Error('Desktop negative control is not supported; use --negative alone');
const root = resolve('.');
mkdirSync('.run', { recursive: true });
const state = mkdtempSync(resolve('.run/proof-'));
const project = join(state, 'project');
const permissionProject = join(state, 'permissions-project');
for (const dir of ['project', 'home', 'config', 'data', 'cache', 'oc-data']) mkdirSync(join(state, dir));
mkdirSync(permissionProject);
execFileSync('git', ['init', '-q'], { cwd: project });
execFileSync('git', ['init', '-q'], { cwd: permissionProject });
const port = () => new Promise((resolve, reject) => {
  const server = createServer();
  server.on('error', reject).listen(0, '127.0.0.1', () => {
    const value = server.address().port;
    server.close(() => resolve(value));
  });
});
const mockPort = await port(), codePort = await port(), webPort = await port();
const password = randomBytes(32).toString('hex');
// Deliberate allowlist: never inherit the user's API keys, config or auth sessions.
const env = {
  PATH: process.env.PATH, HOME: join(state, 'home'), SHELL: '/bin/sh', LANG: 'en_US.UTF-8',
  TMPDIR: process.env.TMPDIR || '/tmp',
  PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.HOME,
    process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright'),
  ...(process.env.PROOF_CHROMIUM_PATH ? { PROOF_CHROMIUM_PATH: process.env.PROOF_CHROMIUM_PATH } : {}),
  XDG_CONFIG_HOME: join(state, 'config'), XDG_DATA_HOME: join(state, 'data'), XDG_CACHE_HOME: join(state, 'cache'),
  OPENCODE_CONFIG_DIR: join(state, 'config/opencode'),
  OPENCODE_DISABLE_MODELS_FETCH: 'true', OPENCODE_DISABLE_PROJECT_CONFIG: 'true',
  OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_DISABLE_FFF: 'true',
  OPENCODE_PASSWORD: password, MOCK_PORT: String(mockPort),
  OPENCHAMBER_DATA_DIR: join(state, 'oc-data'), OPENCHAMBER_RELAY_HOST: 'off',
  OPENCHAMBER_UPDATE_API_URL: `http://127.0.0.1:${mockPort}/update-check`,
  OPENCODE_HOST: `http://127.0.0.1:${codePort}`, OPENCODE_SKIP_START: 'true',
};
const config = {
  ...(plugins ? { plugins: [join(root, 'agent-plugin')] } : {}),
  model: 'mock/demo', update: 'disable', share: 'disabled', snapshots: false,
  providers: { mock: {
    name: 'Local proof mock', package: '@opencode/ai/providers/openai-compatible',
    settings: { baseURL: `http://127.0.0.1:${mockPort}/v1` },
    models: { demo: { name: 'Deterministic demo', capabilities: { tools: true }, limit: { context: 128000, output: 1024 } } },
  } },
  mcp: { servers: { demo: { type: 'local', command: [process.execPath, join(root, 'demo-server/server.mjs')], codemode: false } } },
  permissions: [
    { action: '*', resource: '*', effect: 'deny' },
    { action: 'demo_*', resource: '*', effect: 'allow' },
    ...(plugins ? ['proof_*', 'execute'].map((action) => ({ action, resource: '*', effect: 'allow' })) : []),
  ],
};
mkdirSync(env.OPENCODE_CONFIG_DIR, { recursive: true });
writeFileSync(join(env.OPENCODE_CONFIG_DIR, 'opencode.json'), JSON.stringify(config));
const projectId = `path_${Buffer.from(project).toString('base64url')}`;
writeFileSync(join(state, 'oc-data/settings.json'), JSON.stringify({
  homeDirectory: env.HOME, projects: [
    { id: projectId, path: project, label: 'MCP proof', addedAt: Date.now(), lastOpenedAt: Date.now() },
    { id: `path_${Buffer.from(permissionProject).toString('base64url')}`, path: permissionProject, label: 'MCP permissions proof', addedAt: Date.now(), lastOpenedAt: Date.now() },
  ],
  activeProjectId: projectId, lastDirectory: project, defaultModel: 'mock/demo',
}));
const children = [];
function start(command, args, name, cwd = project) {
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = createWriteStream(join(state, `${name}.log`));
  child.stdout.pipe(log); child.stderr.pipe(log);
  children.push(child);
  return child;
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
  }
  await new Promise((resolve) => setTimeout(resolve, 1500));
  for (const child of children) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await stop(); process.exit(1); });
async function healthy(url, child, headers) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && child.exitCode === null) {
    if (await fetch(url, { headers, signal: AbortSignal.timeout(5_000) }).then((res) => res.ok, () => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Not healthy: ${url}; logs: ${state}`);
}
try {
  const mock = start(process.execPath, [join(root, 'e2e/mock-llm.mjs')], 'mock');
  await healthy(`http://127.0.0.1:${mockPort}/health`, mock);
  const version = JSON.parse(readFileSync(join(root, '.build/opencode/packages/cli/package.json'), 'utf8')).version;
  // Source runs otherwise report "local", which OpenChamber correctly rejects as non-v2.
  const code = start('bun', ['--cwd', join(root, '.build/opencode/packages/cli'), '--define', `OPENCODE_VERSION:${JSON.stringify(version)}`, 'src/index.ts', 'serve', '--hostname', '127.0.0.1', '--port', String(codePort)], 'opencode');
  await healthy(`${env.OPENCODE_HOST}/api/info`, code, { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` });
  if (plugins) {
    const { agentPluginPass } = await import('./agent-plugin.mjs');
    await agentPluginPass({ host: env.OPENCODE_HOST, password, project, root, state, config, configFile: join(env.OPENCODE_CONFIG_DIR, 'opencode.json') });
  } else if (desktop) {
    const { desktopPass } = await import('./desktop.mjs');
    await desktopPass({ root, state, project, env });
  } else {
    const web = start(process.execPath, [realpathSync(join(root, '.build/openchamber/packages/web/server/index.js')), '--port', String(webPort)], 'openchamber');
    const url = `http://127.0.0.1:${webPort}`;
    await healthy(url, web);
    const output = negative ? 'negative-results' : 'test-results';
    const report = join(root, output, 'results.json');
    mkdirSync(join(root, output), { recursive: true });
    rmSync(report, { force: true });
    const test = spawn(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--output', output, '--reporter=list,json'], {
      cwd: root, env: { ...env, PROOF_URL: url, PROOF_PROJECT: project, PROOF_PERMISSION_PROJECT: permissionProject, PROOF_NEGATIVE: negative ? '1' : '', PLAYWRIGHT_JSON_OUTPUT_FILE: report }, stdio: 'inherit', detached: true,
    });
    children.push(test);
    const status = await new Promise((resolve) => test.on('exit', resolve));
    if (negative) {
      const result = JSON.parse(readFileSync(report, 'utf8'));
      const tests = result.suites.flatMap((suite) => suite.specs.flatMap((spec) => spec.tests))
        .filter((test) => test.results.some((run) => run.status !== 'skipped'));
      if (status === 0 || tests.length !== 1 || !tests[0].results.some((r) => r.errors.some((error) => error.message.includes('MCP callback must increment count')))) {
        throw new Error('Negative control did not fail at the callback assertion');
      }
      console.log('NEGATIVE VERIFIED: the same test fails when the callback bridge is blocked.');
    } else if (status !== 0) process.exitCode = 1;
  }
} catch (error) { console.error(error); process.exitCode = 1; }
finally { await stop(); console.log(`Isolated logs/state: ${state}`); }
