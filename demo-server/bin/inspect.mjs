import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'demo-inspector', version: '1.0.0' });
try {
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../server.mjs', import.meta.url))],
  }));
  const { tools } = await client.listTools();
  for (const tool of tools) {
    console.log(`${tool.name}: ${tool._meta?.ui?.resourceUri ?? '(no UI resource)'}`);
  }
  const { contents } = await client.readResource({ uri: 'ui://demo/counter' });
  const output = resolve(process.argv[2] ?? 'counter.html');
  await writeFile(output, contents[0].text);
  console.log(`${contents[0].mimeType}: ${Buffer.byteLength(contents[0].text)} bytes → ${output}`);
} finally {
  await client.close();
}
