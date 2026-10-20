// MCP Apps JSON-RPC over postMessage; no vendor bridge or network access.
const { React, createRoot, Renderer, openuiChatLibrary } = window.__OpenUI;
const root = createRoot(document.getElementById('demo-app-root'));
const button = document.getElementById('demo-increment');
const status = document.getElementById('demo-status');
const countElement = document.getElementById('demo-count');
let count = __INITIAL_COUNT__;
let nextId = 1;
let initialized = false;
const pending = new Map();

function renderCount(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  count = value;
  countElement.textContent = String(count);
  root.render(React.createElement(Renderer, {
    response: 'root = Card([title, count])\n' +
      'title = TextContent("MCP Apps · OpenUI counter", "large-heavy")\n' +
      'count = TextContent("Current count: ' + count + '")',
    library: openuiChatLibrary,
    isStreaming: false,
  }));
}

function send(message) {
  // Sandboxed parents can have opaque origins; validate event.source on receive.
  window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
}

function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error('Host request timed out: ' + method));
    }, 15000);
    pending.set(id, { resolve, reject, timeout });
    send({ id, method, params });
  });
}

window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  if (message.method === 'ping' || message.method === 'ui/resource-teardown') {
    if (message.method === 'ui/resource-teardown') {
      initialized = false;
      button.disabled = true;
      for (const entry of pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(new Error('App closed by host'));
      }
      pending.clear();
      root.unmount();
    }
    send({ id: message.id, result: {} });
    return;
  }
  if (initialized && message.method === 'ui/notifications/tool-result') {
    renderCount(message.params?.structuredContent?.count);
  }
  const entry = pending.get(message.id);
  if (!entry || message.method) return;
  pending.delete(message.id);
  clearTimeout(entry.timeout);
  if (message.error) entry.reject(new Error(message.error.message));
  else entry.resolve(message.result);
});

button.addEventListener('click', async () => {
  if (!initialized) return;
  button.disabled = true;
  status.textContent = 'Updating…';
  try {
    const result = await request('tools/call', {
      name: 'increment_counter', arguments: { by: 1 },
    });
    if (result.isError) throw new Error(result.content?.[0]?.text || 'Tool failed');
    if (!Number.isFinite(result.structuredContent?.count)) throw new Error('Invalid counter result');
    renderCount(result.structuredContent.count);
    status.textContent = 'Ready';
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = !initialized;
  }
});

renderCount(count);
request('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: { name: 'openui-counter', version: '0.1.0' },
  appCapabilities: { availableDisplayModes: ['inline'] },
}).then((host) => {
  if (host.protocolVersion !== '2026-01-26') throw new Error('Unsupported MCP Apps version');
  initialized = true;
  send({ method: 'ui/notifications/initialized', params: {} });
  button.disabled = !host.hostCapabilities?.serverTools;
  status.textContent = button.disabled ? 'Host does not support tool calls' : 'Ready';
  const reportSize = () => send({
    method: 'ui/notifications/size-changed',
    params: { height: document.body.scrollHeight, width: document.body.scrollWidth },
  });
  new ResizeObserver(reportSize).observe(document.body);
  reportSize();
}).catch((error) => { status.textContent = error.message; });
