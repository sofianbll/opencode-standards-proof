import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMockLlm } from './mock-llm.mjs';

test('mock streams the registered tool then text after the real tool result', async () => {
  const server = createMockLlm().listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const request = (messages, tools = [{ type: 'function', function: { name: 'demo_show_demo_app' } }]) =>
      fetch(`http://127.0.0.1:${server.address().port}/v1/chat/completions`, {
        method: 'POST', body: JSON.stringify({ model: 'demo', messages, tools, stream: true }),
      });
    const first = await request([{ role: 'user', content: 'Show app' }]);
    assert.equal(first.status, 200);
    assert.match(await first.text(), /"name":"demo_show_demo_app"/);
    const second = await request([{ role: 'tool', content: 'Count: 0', tool_call_id: 'call_demo' }]);
    assert.match(await second.text(), /demo app is ready/);
    assert.equal((await request([], [{ function: { name: 'wrong_name' } }])).status, 400);
    const plugin = await request([{ role: 'user', content: 'AGENT_PLUGIN_E2E: ping' }], [{ type: 'function', function: { name: 'execute' } }]);
    assert.equal(plugin.status, 200);
    assert.match(await plugin.text(), /tools.proof.plugin_ping/);
    const update = await fetch(`http://127.0.0.1:${server.address().port}/update-check`, {
      method: 'POST', body: JSON.stringify({ currentVersion: '2.5.0' }),
    });
    assert.deepEqual(await update.json(), { latestVersion: '2.5.0', updateAvailable: false, nextSuggestedCheckInSec: 86400 });
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
