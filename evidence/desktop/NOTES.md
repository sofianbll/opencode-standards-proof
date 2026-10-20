# Desktop proof — 2026-10-19

**PASS**, local macOS arm64, Electron 44.9.0 / OpenChamber 2.5.0 development
entry, bundled UI (`openchamber-ui://app/index.html`), external patched OpenCode.
Command: `bash e2e/run.sh --desktop`. Not required in CI.

## Review-fix revalidation, 2026-10-20

The desktop command passes again with OpenCode `d8b73f3` and OpenChamber
`3045d1e`, replayed from the refreshed patches. The shared callback assertion
now also checks the originating `messageID`. Count 0→1, status, both CSP
violations and native navigation cancellation are unchanged. There are no page
errors or crashes. The PNGs and `result.json` below retain the original captures
because the rerun changes no meaningful result; its fresh trace remains under
ignored `desktop-results/`.

Web cannot block outbound self-navigation with CSP. Its bridge now permanently
disables after any load following the initial srcDoc load, including requests
from the same WindowProxy after navigation. Electron continues to block the
navigation itself. The web scenario tests PermissionDock approval and rejection;
the desktop pass retains the allowed callback configuration.

Inputs: the prepared T14 `.build/` reused locally, OpenChamber patches equivalent
to fork `standards/mcp-apps` at `a0299b9` (prepared checkout `4b02002`), OpenCode
base/patches pinned in `e2e/bases.env` and `patches/opencode/`. No fork source
changes, Docker, remote model, credentials or upstream network operations.

## Evidence

- [startup.png](startup.png): main window loaded, composer available.
- [counter-1.png](counter-1.png): real model tool row expanded; OpenUI counter
  **1** and host status **App requested tool increment_counter** visible.
- [navigation-blocked.png](navigation-blocked.png): same UI/count survives the
  attempted external navigation.
- [result.json](result.json): console, CSP events, navigation cancellation,
  unchanged document location, no page errors or renderer crashes.
- Each desktop command also writes an ignored Playwright trace to
  `desktop-results/trace.zip`; it is not committed (contains runtime details).

The shared scenario verifies the real callback request body, owning project
header, HTTP 200, count 0→1, status and `sandbox="allow-scripts"`. Browser CSP
violations are `connect-src` and `img-src`; fetch is rejected. The navigation
event is `{url:"https://example.com/", isMainFrame:false, prevented:true}`;
document location remains `about:srcdoc` and count remains 1. No example.com
request reaches the main-process network fallback.

## Differences from web

- Bundled custom-scheme UI plus Electron in-process backend, instead of the
  web page and standalone backend. The MCP bridge/counter scenario is shared.
- Explicit project selection is needed on the fresh desktop profile: its
  initial draft defaults to Chats despite the saved active-project setting.
  The shared scenario now selects the project on both platforms.
- Electron adds `guest-frame-navigation.mjs`: the opaque frame cannot navigate
  to example.com. Web has no equivalent native hook. The review-fix web test
  navigates to `about:blank` and verifies the bridge no longer answers.
- After cancellation Playwright's cached `frame.url()` becomes empty while
  `location.href` still reports `about:srcdoc`; document/count assertions use
  the document itself and the already-cancelled native event.
- Expected console noise: unpackaged Electron security warning, provider logo
  requests denied by the proof guard, deliberate CSP refusals. No other console
  errors, uncaught page errors or observed crashes before intentional shutdown.
  Process log confirms normal startup and graceful shutdown; native updater
  skips unpackaged checks, web updater uses T14's local simulated response.

## Checks and limits

- Desktop pass succeeded after two harness issues: dependencies were initially
  missing from the new demo-server worktree (reused local install), then the
  cancelled-navigation URL cache needed document-based observation. No product fix.
- Shared web positive passed again; web negative failed at the expected counter
  assertion and the negative-control runner accepted that exact failure.
- A symlinked local `.build/` initially prevented the web CLI's main-module check;
  runner now passes the real entry path. Web positive/negative both passed after it.
- No comparison against unpatched base, packaged/notarized launch, permission
  prompt, long-running stability, mobile, VS Code or production validation.
