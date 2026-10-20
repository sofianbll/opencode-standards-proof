# Executable Agent Plugins 1.0.0 proof package

Install its pinned runtime dependency with `npm ci --prefix agent-plugin` from
the proof root (also done by `e2e/prepare.sh`). Configure the absolute directory
in OpenCode V2 `plugins`; do not copy the skill or MCP definition into native
configuration. No native JS plugin entrypoint is provided.

- `plugin.json`: canonical 1.0.0 manifest.
- `skills/proof-marker/SKILL.md`: `AGENT_PLUGIN_SKILL_PROOF_40993`.
- `mcp.json`: stdio `node ${PLUGIN_ROOT}/server.mjs`, default package-root cwd.
- `server.mjs`: real MCP handshake and `plugin_ping`, returning
  `AGENT_PLUGIN_MCP_PROOF_40993`. Startup asserts ROOT, cwd and writable DATA.

Requires Node on PATH. No credentials, remote service, persistent writes or
network listener. The standard does not install dependencies automatically;
installation above is a proof prerequisite, not a loader feature.

`bash e2e/run.sh --plugins` uses isolated OpenCode HTTP APIs and the deterministic
local model, with native Code Mode enabled for the package tool. It verifies
inventory, skill content, connection, completed model tool output, removal on
reload and rejection of an invalid manifest with no component registration.
The package JSON validates offline against the official schemas in `e2e/schemas/`;
the minimal skill's required frontmatter and marker are checked separately.
This is one working local stdio package, not a full client-conformance suite.
