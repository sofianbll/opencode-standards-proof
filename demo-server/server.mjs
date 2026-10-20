import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { renderHtml } from './html.mjs';

const server = new McpServer({ name: 'mcp-apps-openui-demo', version: '0.1.0' });
const uri = 'ui://demo/counter';
const mimeType = 'text/html;profile=mcp-app';
let count = 0;

function resource() {
  return {
    uri, mimeType, text: renderHtml(count),
    _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] }, prefersBorder: true } },
  };
}

server.registerResource('OpenUI counter', uri, { mimeType }, async () => ({
  contents: [resource()],
}));

server.registerTool('show_demo_app', {
  description: 'Show the local OpenUI counter app.',
  inputSchema: {},
  _meta: { ui: { resourceUri: uri }, 'ui/resourceUri': uri },
}, async () => ({
  content: [
    { type: 'text', text: `OpenUI counter demo. Current count: ${count}.` },
    { type: 'resource', resource: resource() },
  ],
  structuredContent: { count },
  _meta: { ui: { resourceUri: uri } },
}));

server.registerTool('increment_counter', {
  description: 'Increment the in-memory demo counter.',
  inputSchema: { by: z.number().optional() },
}, async ({ by = 1 }) => {
  const next = count + by;
  if (!Number.isFinite(next)) {
    return { isError: true, content: [{ type: 'text', text: 'Counter would overflow.' }] };
  }
  count = next;
  return {
    content: [{ type: 'text', text: `Current count: ${count}.` }],
    structuredContent: { count },
  };
});

await server.connect(new StdioServerTransport());
