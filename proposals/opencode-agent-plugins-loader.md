# Proposal: load local Agent Plugins packages through V2 plugin discovery

Date / upstream check: **2026-10-19** · Draft; requesting design feedback.
Source baselines: OpenCode `dev` **`6bac3b9`**; companion OpenChamber **v2.5.0 (`ad73d11`)**.

## Context and request

[#40993](https://github.com/anomalyco/opencode/issues/40993) remains open and
assigned to **`jlongster`**. Would an explicitly configured local-directory loader
for [Agent Plugins 1.0.0](https://agent-plugins.org/specification) fit the planned
work? We would coordinate with the assignee rather than start a competing implementation.

V2 already has the right contribution primitives: the merged Figma plugin
[#55049](https://github.com/anomalyco/opencode/pull/55049) uses
`ctx.skill.transform` and `ctx.mcp.transform`. That is a native code plugin,
not evidence that root `plugin.json` packages are supported.
At the upstream baseline, the configured-source filter rejects directories without a server
entrypoint (`packages/core/src/config/plugin/source.ts`); the module loader
expects executable plugin exports (`packages/core/src/plugin/module.ts`).

## Proven locally

<!-- PROOF-STATUS: verified 2026-10-20; executable package via e2e/run.sh --plugins -->
- The local loader is implemented in the [OpenCode patch series](https://github.com/sofianbll/opencode-standards-proof/tree/main/patches/opencode),
  originating at fork commit `15b7981`. A valid local `plugin.json` without a
  server entrypoint creates a synthetic generation: skills and stdio `mcp.json`
  contribute through `ctx.skill.transform` / `ctx.mcp.transform`, with managed
  policy and realpath containment retained. Invalid manifests fail explicitly.
- This proof records **29/29** focused discovery/module/reload tests, including
  activation, reload and unload (rerun successfully on 2026-10-20); **681** plugin/config tests and typecheck were
  reported by its implementer. The fixture path and V2 `plugins` configuration
  are in [PROOF.md](https://github.com/sofianbll/opencode-standards-proof/blob/main/PROOF.md).
   Its historical `server.cjs` is intentionally absent; that fixture alone is
   configuration evidence. The separate [executable package](https://github.com/sofianbll/opencode-standards-proof/tree/main/agent-plugin)
   now passes `bash e2e/run.sh --plugins`: HTTP inventory reports active, skills API
   returns its unique content marker, MCP API reports connected, and the local mock
   model calls the real stdio `plugin_ping` through native Code Mode, with the marker
   in the completed persisted tool part. Package JSON is validated offline against
   snapshots of the canonical 1.0.0 schemas. The server asserts host ROOT, default cwd
   and writable DATA before handshake. Removing its config and reloading withdraws
   both skill and server; an invalid manifest surfaces a failed inventory entry and
   registers neither. No fork fix was needed. The scenario runs locally on macOS
   and in the Linux CI workflow; it does not prove model invocation of the skill,
   full portable-package client conformance, all reload races or Windows support.
   HTTP/SSE remain skipped with diagnostics.
- Separately, the MCP Apps [CI workflow](https://github.com/sofianbll/opencode-standards-proof/actions/workflows/e2e.yml)
  and [macOS Electron evidence](https://github.com/sofianbll/opencode-standards-proof/tree/main/evidence/desktop)
   prove the demo app/callback separately from the package scenario. Review fixes include
  permission-gated resource reads, `ui://` + MIME filtering, origin-message agent
  binding, visible web permission refusal/approval and navigation quarantine.
  Web cannot block self-navigation itself; no declared origins are granted.

## Proposed

1. Recognize an explicitly selected local package via root `plugin.json` and its
   canonical 1.0.0 `$schema`, using bundled validation, not network schema fetches.
   Leave unrelated manifests and native JS/TS plugins on their existing paths.
   Read fixed `skills/` and optional `mcp.json` locations per the standard.
2. Keep that source in discovery even without a JS server entrypoint; construct a
   **synthetic plugin generation** after the existing `integration.use` policy
   check. Do not import package code merely to register declarative contributions.
3. Register immediate-child skills and MCP definitions through
   **`ctx.skill.transform` / `ctx.mcp.transform`**. Reuse location scope, ownership,
   collision handling and activation cleanup; do not copy entries into user config.
   Disable/removal withdraws contributions; reload replaces them without duplicates.
4. Enforce realpath containment, including symlinks and skill support files.
   Containment is **not subprocess sandboxing**: stdio execution still needs normal
   trust/policy checks, and MCP calls retain existing permissions and OAuth handling.
5. Preserve the standard's narrow failure boundaries: fatal manifest errors expose
   nothing; a malformed optional component or server must not disable healthy siblings.
   Report unsupported extensions/transports rather than silently reinterpret them.

Use existing stdio and Streamable HTTP transports, with portable semantics kept
distinct from native config defaults: package-root cwd, host-owned ROOT/DATA,
one-pass expansion only in permitted fields, executable/args separation (no shell),
reserved-env protection, persistent plugin data, literal URLs/headers and the
standard's header/redirect restrictions. Unsupported legacy SSE is reported/skipped.

**Out of scope:** marketplaces, remote acquisition redesign, dependency installers,
hook translation, custom agents, OpenChamber UI and vendor-specific extensions.
Skills/MCP support alone must not be advertised as complete hook-based pack compatibility.

## Proposed validation beyond the proof

The local subset and its reported checks are distinguished above. The broader
standard/transport checklist below remains a proposal, not full conformance evidence.

- Beyond the proven local configured package, listed skill, model-driven stdio tool
  and removal: explicit disable/re-enable, model skill invocation and scoped-project independence.
- Canonical/unsupported schemas, malformed manifests, immediate-child skill/name
  validation, missing components and independent sibling failures.
- Symlink/path escape attempts, cwd and support-file containment; reserved env,
  single-pass substitution, persistent DATA, literal command/header behavior.
- Policy denial causes no subprocess launch; remote header/redirect rules retain
  authorization boundaries. Native plugins and loose-skill discovery regressions.
- Content-only edits change the generation revision and reload once without stale
  registrations. Reuse `packages/core/test/plugin/{module,supervisor,supervisor-reload}.test.ts`
  and `test/mcp.test.ts` patterns (**Bun**, not the earlier draft's Vitest assumption).

## Questions for maintainers

1. `jlongster`: is this already underway, and is the local-only synthetic-plugin
   increment the desired shape? Which discovery layer should own recognition?
2. What stable identity and precedence should govern resource collisions and
   plugin data across revisions? Which component diagnostics should users see?
3. Can current lifecycle/watch APIs express content revisions and removal, or
   should any small interface extension receive separate design approval?

Per [CONTRIBUTING](https://github.com/anomalyco/opencode/blob/dev/CONTRIBUTING.md),
this is a request for core-feature design review, not an approved implementation PR.
