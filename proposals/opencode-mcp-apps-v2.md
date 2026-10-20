# Proposal: a V2 engine contract for MCP Apps clients

Date / upstream check: **2026-10-19** · Draft; requesting design feedback.
Source baselines: OpenCode `dev` **`6bac3b9`**; companion OpenChamber **v2.5.0 (`ad73d11`)**.

## Context and request

[#15926](https://github.com/anomalyco/opencode/pull/15926) was **closed without
merge**. On [October 10, `thdxr`](https://github.com/anomalyco/opencode/pull/15926#issuecomment-6100247579)
requested a V2 port rather than another V1 PR. Could the first V2 increment be an
engine-only data/permission contract, with rendering reviewed separately?

[#10884](https://github.com/anomalyco/opencode/issues/10884) remains open, assigned
to **`adamdotdevin`**; this increment would enable clients, not complete that
desktop feature. [#53514](https://github.com/anomalyco/opencode/issues/53514), open
and assigned to **`jlongster`**, requests authorized access to existing MCP
connections, resources and original metadata. We should share the permission and
resource primitives rather than create a second client/OAuth connection fleet.
Merged [#48937](https://github.com/anomalyco/opencode/pull/48937) explicitly excludes
MCP Apps; its base MCP revision update is not Apps support.

## Proven locally

<!-- PROOF-STATUS: verified 2026-10-20, proof main c786dbe -->
- [Reproduction](https://github.com/sofianbll/opencode-standards-proof/blob/main/PROOF.md)
  and [pinned engine patches](https://github.com/sofianbll/opencode-standards-proof/tree/main/patches/opencode)
  preserve tool/result/resource metadata in UI-only tool-part data and expose the
  authenticated session callback. Focused engine/route tests are recorded in
  this proof; this is a local implementation, not a released V2 API.
- Review fixes restrict UI resolution to `ui://` and exact MIME
  `text/html;profile=mcp-app`, and call the shared `opencode_read_mcp_resource`
  permission check before `resources/read`. Denial preserves the text result.
  Callback `messageID` resolves the originating assistant message's agent;
  missing/foreign messages return 404, non-assistant messages 400. Tests are
  included in the patch series; browser scenarios assert the origin message ID.
- The [CI workflow](https://github.com/sofianbll/opencode-standards-proof/actions/workflows/e2e.yml)
  proves model→OpenUI→same-server callback→count 1, visible PermissionDock refusal
  (403, count 0) followed by approval (count 1), CSP enforcement, navigation
  quarantine, and a negative control failing at the unchanged counter assertion.
- [Desktop evidence](https://github.com/sofianbll/opencode-standards-proof/tree/main/evidence/desktop)
  proves the allowed callback/CSP and Electron native navigation cancellation,
  not desktop permission prompts. Web disables the bridge after navigation but
  cannot prevent outbound self-navigation. No declared external origins are granted.
- Callback results are not persisted as message parts; extension sandbox reuse
  is not MCP Apps sandbox conformance.

## Proposed

### Preserve UI data outside model-visible content

Carry the following on terminal tool parts under **`state.metadata.mcp`**:

```text
{
  server, tool,               // configured server; original MCP tool name
  toolMeta?, resultMeta?,    // original tool/result _meta, omitted when absent
  structuredContent?,
  ui?: { resourceUri, mimeType, html, meta? } // resource content _meta
}
```

At this baseline, `core/src/mcp/client.ts` reduces results, `core/src/tool/mcp.ts`
drops metadata, and resource reads lose resource `_meta`. Preserve these fields
through conversion and wire types; retain ordinary text/files and error semantics.
V2 model lowering reads `state.content`, not `state.metadata`: UI HTML and `_meta`
must not be appended to model-visible output. Existing legitimate structured
tool output need not disappear; the UI copy must not add another model payload.

For the proof, resolve the URI from result `_meta.ui.resourceUri`, then tool
definition `_meta.ui.resourceUri` (accept legacy `_meta["ui/resourceUri"]`). Prefer
a matching embedded resource, otherwise use **`resources/read` on the same server
connection**. Preserve resource MIME/URI/metadata and remove embedded UI HTML from
model-visible content. Apply metadata preservation to tool errors where feasible;
a UI-fetch failure must not discard an otherwise usable text result.

### Session-scoped calls and resource read

Proposed proof endpoint: **`POST /api/session/:sessionID/mcp/call`**, using existing
route authentication and session-location middleware:

```json
{ "server": "demo", "tool": "increment_counter", "arguments": { "by": 1 }, "messageID": "msg_app_origin" }
```

Resolve context from the owning session, not the active UI project. Validate the
server/tool/input and reuse **`permission.assert`** with action `${server}_${tool}`
and the normal session/agent/message/call context before execution. No raw
`Mcp.Service.callTool` permission bypass. Keep credentials server-side; propagate
`_meta["ai.opencode/sessionID"]` as on normal calls. Denial returns the existing
permission error mapping (403 where applicable), never silent execution.

Return the unreduced MCP `CallToolResult` (`content`, optional `structuredContent`,
`isError`, `_meta`). Resource resolution uses the existing resource-read permission
path (`opencode_read_mcp_resource`, scoped server/URI); a future public read API
must retain that gate. No unauthenticated arbitrary URI fetcher is proposed.

**Proof limitation:** callback results are returned to the app, not persisted as
new message parts. Maintainers should decide audit/history semantics before
production support. The endpoint spelling and eager HTML-in-part payload are
experimental contract choices, not a requested permanent API commitment.

### What stays client-side

Iframe rendering, CSP, frame identity, `ui/*` negotiation, host-capability
enforcement and a same-server `tools/call` bridge belong to the client host.
No iframe, Apps SDK dependency or OpenChamber protocol enters the engine.
The engine must keep app-only tools out of the model's tool inventory before
claiming full Apps support; client rendering alone cannot enforce that visibility.
Model-context updates, follow-up messages and vendor APIs are outside this increment.

## Proposed validation beyond the proof

The proof status above identifies the completed subset. The following is the
broader upstream checklist, not a claim of exhaustive coverage.

- Tool/result/resource `_meta`, embedded vs read HTML, MIME/URI, structured results,
  absent fields and error results survive conversion/session wire projection.
- Independent model-lowering assertions: no UI HTML or private `_meta` reaches
  model messages; normal text/files remain unchanged.
- Authenticated callback with correct session/agent and MCP session marker; denial,
  invalid arguments, wrong project, missing tool/server and failed resource read.
  Assert that denied calls never reach the fixture server.
- Protocol/server route tests and generated-client checks; use Bun core MCP tests
  and affected schema/protocol/server packages, regenerate clients per CONTRIBUTING.
- Retain the demonstrated render/callback/refusal web CI and separate desktop
  gate; extend integration coverage to malformed-resource fallback.

## Questions for maintainers

1. `adamdotdevin` / `jlongster`: should #10884 and #53514 share this engine layer,
   and who should own the V2 port design after #15926?
2. Is a UI-only metadata namespace plus session-scoped calls appropriate, or is
   another V2 API preferred? Should HTML be eager, bounded, cached or fetched lazily?
3. How should UI calls bind to their originating tool part, enforce same-server
   scope server-side, and appear in audit/history? The proof's client-side binding
   is not a security boundary against an independently authenticated API caller.

Per [CONTRIBUTING](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md),
please review the core design before an upstream implementation PR; local proof
work is disposable and is not maintainer approval.
