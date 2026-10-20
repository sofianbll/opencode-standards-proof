import assert from 'node:assert/strict';
import { realpath, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Fail the handshake if the host omitted the standard's root, cwd or writable data directory.
assert.equal(process.env.PLUGIN_ROOT, await realpath(fileURLToPath(new URL('.', import.meta.url))));
assert.equal(await realpath(process.cwd()), process.env.PLUGIN_ROOT);
assert.ok(process.env.PLUGIN_DATA);
await access(process.env.PLUGIN_DATA, constants.W_OK);
const server = new McpServer({ name: 'agent-plugin-proof', version: '1.0.0' });
server.registerTool('plugin_ping', { description: 'Return the package proof marker.', inputSchema: {} }, async () => ({
  content: [{ type: 'text', text: 'AGENT_PLUGIN_MCP_PROOF_40993' }],
}));
await server.connect(new StdioServerTransport());
