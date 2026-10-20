# Idea: inline MCP Apps once OpenCode preserves UI metadata

Date / upstream check: **2026-10-19** · Draft Ideas discussion.
Source baselines: OpenChamber **v2.5.0 (`ad73d11`)**; OpenCode `dev` **`6bac3b9`**.

## What I am trying to do

When an MCP tool returns a chart or small interactive app, I would like to use it
inside its chat result rather than inspect raw data or open another tab. An OpenUI
counter is the small test case; OpenUI would be app content, not a host dependency.

[#2945](https://github.com/openchamber/openchamber/issues/2945) remains closed
`not_planned`. The [October 5 maintainer explanation](https://github.com/openchamber/openchamber/issues/2945#issuecomment-5993047132)
is still the blocker: OpenCode drops the tool's `_meta.ui`, leaving nothing to
render. This proposal **depends on fixing the engine contract**, not on bypassing
it with another MCP connection or asking to reopen that issue unchanged.

Would a narrow renderer on web and desktop be a useful direction once that data
is available? The [companion OpenCode proposal](opencode-mcp-apps-v2.md) asks for
UI-only metadata, resource reads and session-authorized callbacks. OpenCode
[#10884](https://github.com/anomalyco/opencode/issues/10884) and
[#53514](https://github.com/anomalyco/opencode/issues/53514) remain open;
[#15926](https://github.com/anomalyco/opencode/pull/15926) was closed without merge
with a request to port to V2. None establishes shipped support.

## Proven locally

<!-- PROOF-STATUS: verified 2026-10-20, proof main c786dbe -->
- [Proof and reproduction](https://github.com/sofianbll/opencode-standards-proof/blob/main/PROOF.md):
  real OpenUI tool-result rendering, initialized same-server callback, count 0→1,
  visible status and browser-enforced `connect-src` / `img-src` CSP passed in
  the [CI workflow](https://github.com/sofianbll/opencode-standards-proof/actions/workflows/e2e.yml).
  The same scenario fails at the counter assertion when its callback is blocked.
- [Browser scenarios](https://github.com/sofianbll/opencode-standards-proof/blob/main/e2e/mcp-app.spec.mjs)
  also prove visible PermissionDock denial (403, count 0) then approval (count 1),
  and permanent bridge quarantine after iframe navigation. Web cannot prevent
  outbound self-navigation itself; no declared external origins are granted.
- [macOS Electron evidence](https://github.com/sofianbll/opencode-standards-proof/tree/main/evidence/desktop)
  proves bundled UI startup, rendering/callback/CSP and native navigation cancellation,
  revalidated after review fixes. Desktop permission prompts were not tested.
- The [OpenCode patches](https://github.com/sofianbll/opencode-standards-proof/tree/main/patches/opencode)
  restrict UI resolution to `ui://` + exact `text/html;profile=mcp-app`, check
  resource-read permission before fetching, and authorize callbacks using the
  originating assistant message's agent (`messageID`), not a newly selected agent.
- These are local forks, not upstream support or full sandbox conformance.
  Callback results are not message parts.

## Proposed

```text
ToolPart state.metadata.mcp.ui
    → sandboxed inline app
    → narrow JSON-RPC tools/call adapter
    → owning session's OpenCode endpoint → permission.assert → same MCP server
```

- Add an app branch at `ToolPart` result rendering using the proposed
  `state.metadata.mcp` data. Preserve text/files and error fallback; app-only output
  must render even when text is empty. Use the part's session and directory, never
  whichever project is currently selected. Explain loading/unavailable states.
- Reuse **extension sandbox primitives**, not the whole extension bridge:
  `srcDoc`, `sandbox="allow-scripts"` (no `allow-same-origin`, hence opaque origin),
  and `guestFramePolicy` CSP inserted before app content, as in `relay-document.ts`.
  Validate declared origins before policy construction; start with no network
  grants, and allow only validated/approved origins within that existing policy.
  App declarations alone must not grant host capabilities.
- Check `event.source === iframe.contentWindow`, message shape and live frame/
  tool-part identity before handling anything. Reject stale/unmounted frames;
  opaque origin `"null"` is not an identity check. Bind replies to that frame.
- Adapt standard **MCP Apps JSON-RPC 2.0** (`ui/initialize`, initialization/tool
  result notifications and `tools/call`) rather than pretend it is the SDK guest
  envelope. Advertise only implemented capabilities; deny unknown/malformed
  requests. `tools/call` has **only the rendering part's own MCP server** as its
  destination, selected by the host, not supplied by the guest. Forward through
  the session-authorized engine API, preserving normal visible permission prompts.
- No raw OpenCode access, filesystem/clipboard/compose/open-URL grants, model-context
  updates or follow-up messages. `PluginPane` has wider extension powers and cannot
  simply be pointed at arbitrary MCP HTML. A UI resource is not an installed extension.

**Scope:** web and desktop only. VS Code, hosted/Capacitor mobile, marketplaces,
vendor APIs and a fully spec-conformant MCP Apps sandbox are out of scope.
Reuse of the extension sandbox is an explicit proof trade-off, not a conformance
claim. Collapsing a tool result currently unmounts its body; app state may reset.
Engine callback results are not yet persisted to conversation history.

## Proposed validation beyond the proof

The proven subset is listed above. This broader checklist is not a claim that
every combination or production behavior has been tested.

- Render the deterministic fixture, initialize, click and observe its permitted
  result in web; repeat as a separate Electron live run.
- Denied tool call, cross-server attempt, unknown method, malformed JSON-RPC,
  forged/wrong/stale frame, and mount/collapse/unmount lifecycle.
- CSP blocks undeclared network access; validate origins and script/frame/navigation
  restrictions. Verify web separately: Electron's guest navigation guard does not
  establish equivalent browser protection.
- Empty text, failed resource, unavailable engine, error results and historical
  content loading; narrow/wide layouts, light/dark, focus and long content.
- Extend captured interaction evidence beyond the fixed fixture; run upstream
  type/lint/test/build gates at any newly agreed implementation baseline.

## Questions before an upstream implementation

1. Does this inline placement and small capability set fit OpenChamber, or would
   you prefer a different presentation before any product behavior is committed?
2. Is reusing these isolation primitives acceptable for an experimental adapter,
   with no full Apps sandbox claim? Which consent/network restrictions are required?
3. Should we wait for an agreed OpenCode contract before shaping an OpenChamber PR?
   How should collapse/replay and unaudited callback results behave?

The **Ideas** category exists and Discussions is enabled (GitHub API checked
2026-10-19). [CONTRIBUTING](https://github.com/openchamber/openchamber/blob/main/CONTRIBUTING.md)
requires discussing new behavior and receiving maintainer go-ahead before building
the upstream feature. This experiment is offered as a changeable question, not a
finished product decision; an implementation PR would wait for that agreement.
