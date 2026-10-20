import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createMockLlm() {
  return http.createServer(async (req, res) => {
    if (req.url === '/health') return res.end('ok');
    if (req.method !== 'POST' || !['/v1/chat/completions', '/update-check'].includes(req.url)) {
      res.writeHead(404); return res.end();
    }
    try {
      let body = '';
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      if (req.url === '/update-check') {
        console.log('update: suppressed locally');
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ latestVersion: request.currentVersion, updateAvailable: false, nextSuggestedCheckInSec: 86400 }));
      }
      const hasResult = request.messages.some((message) => message.role === 'tool');
      const hasTools = request.tools?.length > 0;
      const call = hasTools && !hasResult;
      const plugin = request.messages.some((message) => message.role === 'user' && JSON.stringify(message.content).includes('AGENT_PLUGIN_E2E'));
      const toolName = plugin ? 'execute' : 'demo_show_demo_app';
      if (call && !request.tools.some((tool) => tool.function?.name === toolName)) {
        throw new Error(`Expected registered tool ${toolName}`);
      }
      const delta = call ? {
        role: 'assistant',
        tool_calls: [{ index: 0, id: 'call_demo', type: 'function', function: { name: toolName, arguments: plugin ? JSON.stringify({ code: 'return await tools.proof.plugin_ping({});' }) : '{}' } }],
      } : { role: 'assistant', content: 'The local MCP demo app is ready.' };
      console.log(call ? `model: ${toolName}` : `model: text (tool result: ${hasResult})`);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const send = (delta, finish_reason) => res.write(`data: ${JSON.stringify({
        id: 'chatcmpl-proof', object: 'chat.completion.chunk', created: 1, model: request.model,
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`);
      send(delta, null);
      send({}, call ? 'tool_calls' : 'stop');
      res.end('data: [DONE]\n\n');
    } catch (error) {
      res.writeHead(400); res.end(error.message);
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  createMockLlm().listen(Number(process.env.MOCK_PORT), '127.0.0.1');
}
