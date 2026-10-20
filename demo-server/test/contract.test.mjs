import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function connect(t) {
  const client = new Client({ name: 'demo-contract', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
    stderr: 'pipe',
  });
  t.after(() => client.close());
  await client.connect(transport);
  return client;
}

test('stdio discovery links show_demo_app to its MCP Apps resource', async (t) => {
  const client = await connect(t);
  const { tools } = await client.listTools();
  const show = tools.find((tool) => tool.name === 'show_demo_app');
  assert.equal(show._meta.ui.resourceUri, 'ui://demo/counter');
  assert.equal(show._meta['ui/resourceUri'], 'ui://demo/counter');
  assert.ok(tools.some((tool) => tool.name === 'increment_counter'));
});

test('resources/read serves a self-contained OpenUI app and standard host bridge', async (t) => {
  const client = await connect(t);
  const { resources } = await client.listResources();
  assert.ok(resources.some((resource) => resource.uri === 'ui://demo/counter'));
  const { contents } = await client.readResource({ uri: 'ui://demo/counter' });
  assert.equal(contents[0].mimeType, 'text/html;profile=mcp-app');
  const html = contents[0].text;
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /window\.__OpenUI/);
  assert.ok(html.length > 3_000_000, 'the actual browser bundle is embedded');
  for (const marker of ['ui/initialize', 'ui/notifications/initialized', 'tools/call',
    'increment_counter', 'demo-app-root', 'demo-increment', 'demo-count']) {
    assert.ok(html.includes(marker), `HTML includes ${marker}`);
  }
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.deepEqual(contents[0]._meta.ui.csp.connectDomains, []);
  assert.deepEqual(contents[0]._meta.ui.csp.resourceDomains, []);
});

test('show_demo_app returns text, count, UI metadata and an embedded resource convenience copy', async (t) => {
  const client = await connect(t);
  const result = await client.callTool({ name: 'show_demo_app', arguments: {} });
  assert.ok(result.content.some((item) => item.type === 'text' && item.text.includes('0')));
  assert.equal(result._meta.ui.resourceUri, 'ui://demo/counter');
  assert.deepEqual(result.structuredContent, { count: 0 });
  const embedded = result.content.find((item) => item.type === 'resource');
  assert.equal(embedded.resource.uri, 'ui://demo/counter');
  assert.equal(embedded.resource.mimeType, 'text/html;profile=mcp-app');
  const canonical = await client.readResource({ uri: 'ui://demo/counter' });
  assert.equal(embedded.resource.text, canonical.contents[0].text);
});

test('increment_counter defaults to one and keeps state across calls on a connection', async (t) => {
  const client = await connect(t);
  const first = await client.callTool({ name: 'increment_counter', arguments: {} });
  assert.deepEqual(first.structuredContent, { count: 1 });
  assert.match(first.content[0].text, /1/);
  const second = await client.callTool({ name: 'increment_counter', arguments: { by: 2 } });
  assert.deepEqual(second.structuredContent, { count: 3 });
  assert.match(second.content[0].text, /3/);
  const zero = await client.callTool({ name: 'increment_counter', arguments: { by: 0 } });
  assert.deepEqual(zero.structuredContent, { count: 3 });
  const fraction = await client.callTool({ name: 'increment_counter', arguments: { by: -0.5 } });
  assert.deepEqual(fraction.structuredContent, { count: 2.5 });
  const show = await client.callTool({ name: 'show_demo_app', arguments: {} });
  assert.deepEqual(show.structuredContent, { count: 2.5 });
});

test('invalid increments and overflow return errors without corrupting the counter', async (t) => {
  const client = await connect(t);
  const invalid = await client.callTool({ name: 'increment_counter', arguments: { by: '1' } });
  assert.equal(invalid.isError, true);
  const large = await client.callTool({ name: 'increment_counter', arguments: { by: 1e308 } });
  assert.deepEqual(large.structuredContent, { count: 1e308 });
  const overflow = await client.callTool({ name: 'increment_counter', arguments: { by: 1e308 } });
  assert.equal(overflow.isError, true);
  const unchanged = await client.callTool({ name: 'increment_counter', arguments: { by: 0 } });
  assert.deepEqual(unchanged.structuredContent, { count: 1e308 });
});
