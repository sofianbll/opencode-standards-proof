import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

// Public HTTP seams: inventory, skills, MCP lifecycle and persisted model tool result.
export async function agentPluginPass({ host, password, project, root, state, config, configFile }) {
  const request = async (path, body) => {
    const response = await fetch(`${host}${path}${path.includes('?') ? '&' : '?'}location[directory]=${encodeURIComponent(project)}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.ok, true, `${path}: ${response.status} ${response.ok ? '' : await response.text()}`);
    return response.status === 204 ? undefined : response.json();
  };
  async function eventually(read, predicate, message) {
    const deadline = Date.now() + 60_000;
    let value;
    do {
      value = await read();
      if (predicate(value)) return value;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } while (Date.now() < deadline);
    assert.fail(`${message}: ${JSON.stringify(value)}`);
  }
  const plugins = await eventually(async () => (await request('/api/plugin')).data,
    (items) => items.some((plugin) => plugin.id === 'proof-agent-plugin'), 'Package must appear in plugin inventory');
  assert.ok(plugins.some((plugin) => plugin.id === 'proof-agent-plugin' && plugin.state.status === 'active'), `Agent Plugins package must be active: ${JSON.stringify(plugins)}`);
  const skills = (await request('/api/skill')).data;
  assert.match(skills.find((skill) => skill.id === 'proof-marker')?.content ?? '', /AGENT_PLUGIN_SKILL_PROOF_40993/);
  const servers = await eventually(async () => (await request('/api/mcp')).data,
    (items) => items.some((server) => server.name === 'proof' && server.status.status !== 'pending'), 'MCP must finish connecting');
  assert.ok(servers.some((server) => server.name === 'proof' && server.status.status === 'connected'), JSON.stringify(servers));
  // shortcut: status precedes the 100 ms catalog debounce; use catalog readiness when a public API exists.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const session = (await request('/api/session', { title: 'Agent Plugins proof', location: { directory: project }, model: { providerID: 'mock', id: 'demo' } })).data;
  await request(`/api/session/${session.id}/prompt`, { text: 'AGENT_PLUGIN_E2E: call the package ping tool.' });
  await eventually(async () => (await request(`/api/session/${session.id}/context`)).data,
    (context) => {
      assert.ok(!context.some((message) => message.error), JSON.stringify(context));
      return context.flatMap((message) => message.content ?? []).some((part) =>
        part.type === 'tool' && part.name === 'execute' && part.state?.status === 'completed' && JSON.stringify(part.state.content).includes('AGENT_PLUGIN_MCP_PROOF_40993'));
    }, 'Package model tool must complete with AGENT_PLUGIN_MCP_PROOF_40993');
  console.log('AGENT PLUGIN PASS: active package, skill marker, connected stdio server, completed model tool marker');
  writeFileSync(configFile, JSON.stringify({ ...config, plugins: [] }));
  await request('/api/location/reload', {});
  await eventually(async () => (await request('/api/plugin')).data,
    (items) => !items.some((plugin) => plugin.id === 'proof-agent-plugin'), 'Removed package must leave inventory');
  assert.ok(!(await request('/api/skill')).data.some((skill) => skill.id === 'proof-marker'));
  assert.ok(!(await request('/api/mcp')).data.some((server) => server.name === 'proof'));
  console.log('AGENT PLUGIN REMOVAL PASS: reload withdraws skill and server');

  const invalid = join(state, 'invalid-plugin');
  cpSync(join(root, 'agent-plugin'), invalid, { recursive: true, filter: (path) => basename(path) !== 'node_modules' });
  const manifest = JSON.parse(readFileSync(join(invalid, 'plugin.json'), 'utf8'));
  writeFileSync(join(invalid, 'plugin.json'), JSON.stringify({ ...manifest, name: 'INVALID NAME' }));
  writeFileSync(configFile, JSON.stringify({ ...config, plugins: [invalid] }));
  await request('/api/location/reload', {});
  const failed = await eventually(async () => (await request('/api/plugin')).data,
    (items) => items.some((plugin) => plugin.source.type === 'local' && plugin.source.path.startsWith(invalid)), 'Invalid package must surface in inventory');
  const rejected = failed.find((plugin) => plugin.source.type === 'local' && plugin.source.path.startsWith(invalid));
  assert.equal(rejected.state.status, 'failed');
  assert.match(rejected.state.error, /name|pattern/i);
  assert.ok(!(await request('/api/skill')).data.some((skill) => skill.id === 'proof-marker'));
  assert.ok(!(await request('/api/mcp')).data.some((server) => server.name === 'proof'));
  console.log('AGENT PLUGIN NEGATIVE PASS: invalid manifest surfaces error, no skill or server registered');
}
