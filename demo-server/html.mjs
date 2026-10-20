import { readFile } from 'node:fs/promises';

const [bundle, styles, app] = await Promise.all([
  readFile(new URL(import.meta.resolve('@openuidev/browser-bundle')), 'utf8'),
  readFile(new URL(import.meta.resolve('@openuidev/browser-bundle/styles.css')), 'utf8'),
  readFile(new URL('./app.js', import.meta.url), 'utf8'),
]);

// An HTML parser must never see a closing tag inside an inline script/style.
const inlineScript = (source) => source.replace(/<\/script/gi, '<\\/script');

export function renderHtml(count) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenUI MCP Apps counter</title>
<style>${styles.replace(/<\/style/gi, '<\\/style')}</style>
<style>
body { margin: 0; padding: 16px; font-family: system-ui, sans-serif;
  color: var(--color-text-primary, #171717); background: var(--color-background-primary, #fff); }
button { padding: 8px 16px; cursor: pointer; } button:disabled { cursor: wait; }
#demo-status { overflow-wrap: anywhere; }
</style></head><body>
<div id="demo-app-root" data-testid="demo-app-root"></div>
<p>Count: <output id="demo-count" data-testid="demo-count" aria-live="polite">${count}</output></p>
<button id="demo-increment" data-testid="demo-increment" type="button" disabled>Increment +1</button>
<p id="demo-status" role="status">Connecting to MCP Apps host…</p>
<script>${inlineScript(bundle)}</script>
<script>${inlineScript(app.replace('__INITIAL_COUNT__', JSON.stringify(count)))}</script>
</body></html>`;
}
