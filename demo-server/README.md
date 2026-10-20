# Local MCP Apps + OpenUI demo

No key, account, model, build step, HTTP listener or runtime network requests.
Requires Node 22+ and npm. From this directory:

```sh
npm ci && node server.mjs
```

After installation, `node /absolute/path/to/demo-server/server.mjs` (or `npm start`)
starts the stdio server in one command. Its stdout is reserved for MCP messages;
an idle terminal is normal. Use an MCP client, or inspect it directly:

```sh
npm run inspect
# Optional destination: npm run inspect -- /absolute/path/to/counter.html
npm test
```

The inspector lists tools, reads `ui://demo/counter` through the SDK stdio client,
writes `counter.html` (ignored), and prints its byte size. Open that HTML to inspect
the OpenUI render; without an MCP Apps host the button stays disabled and the
connection times out after 15 seconds. It never falls back to a network service.
The automated contract tests use the real SDK client and a fresh server process;
they do not require a browser or a live host.

## OpenCode configuration

Install dependencies first, replace the absolute path, then add to `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "openui_demo": {
        "type": "local",
        "command": ["node", "/absolute/path/to/demo-server/server.mjs"],
        "codemode": false
      }
    }
  }
}
```

This is the patched V2 format, verified against
`packages/schema/src/config/mcp.ts` (`servers`) and `packages/schema/src/mcp.ts`
(`LocalConfig`). The legacy `mcp.<name>` / `enabled` form does not apply here.
Ask the agent to call `show_demo_app`. An MCP Apps-capable host
is required for the interactive iframe; a text-only client still receives the
current count. This demo alone does not add MCP Apps support to OpenCode.

## Contract and implementation

- `show_demo_app`: no arguments; meaningful text, `structuredContent: { count }`,
  result `_meta.ui.resourceUri`, and an embedded `resource` HTML content item.
  **The embedded copy is a convenience for this proof only.** The canonical MCP
  Apps path is tool-definition `_meta.ui.resourceUri` → `resources/read`.
  The tool definition also carries deprecated `_meta["ui/resourceUri"]` for
  compatibility with older hosts. UI metadata is always exposed so the fixture
  remains discoverable to inspectors; capability-dependent registration is not
  needed for its text fallback.
- `ui://demo/counter`: MIME `text/html;profile=mcp-app`; inlines the actual pinned
  `@openuidev/browser-bundle@0.2.1` JavaScript **and CSS**, read from the installed
  package. No CDN, fetch, nested iframe, external font or permission is needed.
  Resource metadata declares empty connection/resource domain lists.
- OpenUI Lang 1.0 renders a card with title and current count using the package's
  documented `window.__OpenUI.{React,createRoot,Renderer,openuiChatLibrary}` API.
  A plain DOM button invokes the host bridge; stable selectors are
  `#demo-app-root`, `#demo-increment`, `#demo-count` (also `data-testid`).
- The handwritten bridge speaks JSON-RPC 2.0 over `window.parent.postMessage`:
  `ui/initialize` with protocol `2026-01-26`, `appInfo`, `appCapabilities`, then
  `ui/notifications/initialized`, then `tools/call` for `increment_counter`.
  Responses must come from the parent and match a pending id; requests time out.
  `*` is used as target origin because the sandbox parent can have an opaque
  origin. Tool-result notifications update the count; ping, teardown and size
  notifications are supported. The host remains responsible for iframe sandbox,
  CSP enforcement, tool authorization and same-server routing.
- `increment_counter({ by?: number })`: defaults to 1; returns text and
  `structuredContent: { count }`. Finite numbers (including fractions, zero and
  negatives) are accepted; overflow is rejected without changing state. This is
  an ordinary JavaScript-number demo, not an exact arithmetic service. The count
  lives only in the server process and resets to zero on restart. Multiple views
  share that process counter but are not broadcast-synchronized.

The HTML is several MB because it carries the real OpenUI bundle and stylesheet.
Keep host resource/message size limits in mind. Lockfile installation currently
reports six **low** transitive audit findings around OpenUI/KaTeX
([GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7)); the pinned
prebuilt bundle is not patched here. The demo renders fixed trusted Lang only.

Reference: [SEP-1865, stable 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
