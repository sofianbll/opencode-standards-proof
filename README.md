# standards-mcp-apps proof

Local proof workspace for MCP Apps + Agent Plugins on OpenCode/OpenChamber.

**Start here: [PROOF.md — installation, scénario et limites vérifiés](PROOF.md).**

- `demo-server/` — MCP server with a `ui://` OpenUI app (T1, #9)
- `agent-plugin/` — executable Agent Plugins 1.0.0 skill + stdio package
- `proposals/` — upstream proposal drafts (T5, #13)
- `e2e/` and `patches/` — reproducible web proof (T6, #14)
- `evidence/desktop/` — local macOS Electron proof (T7, #15)

Forks live next to this repo: `../opencode`, `../openchamber` (branch `standards/mcp-apps`).

## Browser proof (macOS and Linux, no Docker)

Agent Plugins proof (HTTP APIs, no browser): `bash e2e/run.sh --plugins`.
Checks active package, listed skill marker, connected stdio server, real model-driven
tool completion through Code Mode, withdrawal on reload and invalid-manifest rejection.
Only this mode additionally allows `execute` and `proof_*` in its isolated permissions.
See [PROOF.md](PROOF.md#paquet-agent-plugins-local) for commands and exact limits.

Requires Git, npm and Bun 1.4.3 on PATH. Node 24.14.1 is pinned as a local test
dependency so browser tracing and OpenChamber use the same supported runtime on
Mac and CI (Node 26 hung during Playwright ZIP extraction/tracing locally).
No account, API key or remote model is used. Run:

```sh
bash e2e/run.sh
```

`run.sh` prepares dependencies/builds and its local Chromium on first run, then starts a local mock
OpenAI-compatible streaming model, patched OpenCode, the demo stdio MCP server
and built OpenChamber web. Linux also needs system libraries installed with
`npx playwright install --with-deps chromium`, as CI does. It waits for HTTP readiness and runs the Chromium
scenario: create a session in the disposable Git project, send a prompt, expand
the model's tool row, see the actual OpenUI counter, click and observe 0 → 1
through the host/server callback, verify the status, sandbox and browser-enforced
`connect-src`/`img-src` CSP. Browser requests to non-loopback origins are denied
as a second guard; the CSP assertions require browser policy-violation events,
not just a failed network request.

A second scenario uses a separate disposable project and session permissions
that ask for `demo_increment_counter` while allowing the model's
`demo_show_demo_app`. It rejects the visible PermissionDock request, checks HTTP
403, count 0 and the error status, then approves the next request. Count 1 proves
the refused call never reached the MCP server. The original web scenario also
self-navigates the iframe to `about:blank` and verifies its bridge stays disabled.

Callbacks carry the originating tool part's `messageID`. OpenCode resolves that
assistant message's agent for authorization even if the session's agent changes.
Missing or foreign messages return 404, and non-assistant messages return 400.

The tiny dependency-free model is smaller than configuring OpenCode's simulation
driver and leaves the real HTTP provider, MCP execution and permission flow intact.
Its first tool-capable turn calls the actual registry name `demo_show_demo_app`
(`demo` + `show_demo_app`, `codemode: false`); after a tool result it streams text.
Auxiliary title requests without tools receive text. Config uses V2 `providers`,
native `@opencode/ai/providers/openai-compatible` and `settings.baseURL`.

Only `demo_*` is allowed by the isolated OpenCode config; all other tool actions
are denied. The UI callback still passes through `permission.assert` on the real
server. The run uses an allowlisted environment, disposable HOME/XDG/config/data
directories and a random runtime-only server password, never the user's sessions
or credentials. OpenChamber's automatic update API is redirected to the local
mock, which returns the current version with no update available. A valid
response also prevents fallback registry/changelog requests. All server process
groups are terminated on exit/signals. The
CLI runs from source with its package version injected, as the release build
does: the default source label `local` is correctly rejected by OpenChamber's
V2 compatibility gate.

Artifacts: `test-results/**/mcp-app.png`, screenshots, `trace.zip`, JSON report.
Open traces with `npx playwright show-trace <path>`. Local `.run/proof-*` retains
ignored isolated state/logs for diagnosis (do not publish it). CI uploads only
Playwright artifacts for 14 days, always, even on failure.

### Verified negative control

```sh
bash e2e/run.sh --negative
```

This starts fresh isolated servers and runs **the same spec** with only the
browser→host callback request blocked. The app must first render and show zero;
the unchanged `MCP callback must increment count` assertion must then fail. The
runner accepts only that specific failure, not startup, rendering, selector or
browser failures. A normal `playwright test` exit remains nonzero for the broken
callback; only the negative-control wrapper inverts the verified outcome. CI
runs the positive and negative sequentially, without another install/build.

### Pinned source and patch maintenance

`e2e/bases.env` is the sole list of upstream base SHAs. `e2e/prepare.sh` shallow
fetches exactly those commits and `git am`s the tracked format-patch series into
ignored `.build/` repositories (no upstream push or issue operations). CI always
starts from those reproducible inputs. Locally, `PROOF_SOURCE_ROOT=/absolute/path`
can use the adjacent forks as read-only fetch sources instead of public GitHub.

After an authorized integration-branch update:

```sh
bash e2e/refresh-patches.sh ..
# Recreate only the generated .build/ checkouts before preparing again.
bash e2e/prepare.sh
```

Existing `.build/` checkouts are reused; do not reuse stale builds after changing
patches. `PROOF_CHROMIUM_PATH` optionally selects an already-installed Chromium
binary; CI uses the pinned Playwright browser. `PLAYWRIGHT_BROWSERS_PATH` is also
honored. `node --test e2e/mock-llm.test.mjs` checks the mock's streaming contract.

## Desktop proof (local macOS only, not CI)

With an already prepared `.build/` from the web proof (including the installed
Electron runtime), run:

```sh
bash e2e/run.sh --desktop
```

This command does not fetch upstream or install Electron. It reuses the same
mock model, isolated OpenCode/config/HOME, local updater response and shared
browser scenario. `e2e/desktop.mjs` stages the existing built UI and launches the
real Electron `entry.mjs` with Playwright `_electron`: the same bundled-UI mode
as `electron:dev:bundled`, without rebuilding or invoking `bun x`.
The desktop Chromium profile is also isolated explicitly (macOS does not use
`HOME` alone to choose Electron userData). Electron owns its in-process backend,
connected to the external patched OpenCode with `OPENCODE_HOST`/`OPENCODE_SKIP_START`.
Non-loopback renderer requests are denied as a second guard, including provider
logo requests. Updater API remains redirected to the local mock; the native
updater skips checks in this unpackaged dev mode.

Besides the shared web assertions, the pass attempts `location.href =
'https://example.com'` inside the opaque srcdoc frame, observes the shell's
`will-frame-navigate` event already cancelled, and checks the document/count
survive without reaching the network fallback. Screenshots, `result.json` and
`trace.zip` are written to ignored `desktop-results/`; private process logs stay
under `.run/`. Checked-in captures and the reviewed log are in
[`evidence/desktop/NOTES.md`](evidence/desktop/NOTES.md).
`--desktop --negative` is deliberately unsupported; the web negative control
still exercises the shared callback scenario.

Web CSP cannot prevent outbound iframe self-navigation, a known limit shared
with extension frames. Any load after the initial srcDoc load permanently
disables the app bridge and aborts pending callbacks. Electron additionally
blocks opaque-frame navigation natively, as recorded in the desktop evidence.

Proof limits: macOS Electron dev mode and web/Chromium only, trusted fixed demo HTML, no external origins
granted, callback not persisted as a chat part, iframe state lost on collapse.
This does not validate packaged/signed Electron, mobile, VS Code, desktop permission prompts/denial UX,
general MCP Apps compatibility or production deployment.
