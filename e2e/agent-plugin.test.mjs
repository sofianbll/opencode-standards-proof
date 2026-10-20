import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Reuse the MCP SDK's installed validator; no additional test dependency or network.
const require = createRequire(new URL('../agent-plugin/node_modules/@modelcontextprotocol/sdk/package.json', import.meta.url));
const Ajv = require('ajv/dist/2020.js');
const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
for (const name of ['plugin', 'mcp']) {
  test(`${name}.json validates against the official Agent Plugins 1.0.0 schema`, () => {
    const validate = new Ajv().compile(json(`./schemas/${name}.schema.json`));
    assert.equal(validate(json(`../agent-plugin/${name}.json`)), true, JSON.stringify(validate.errors));
    assert.equal(validate(name === 'plugin' ? { ...json('../agent-plugin/plugin.json'), name: 'INVALID NAME' } : {}), false);
  });
}
test('proof skill follows the Agent Skills required frontmatter and immediate-child layout', () => {
  const skill = readFileSync(new URL('../agent-plugin/skills/proof-marker/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /^---\nname: proof-marker\ndescription: [^\n]{1,1024}\n---\n/);
  assert.match(skill, /AGENT_PLUGIN_SKILL_PROOF_40993/);
});
