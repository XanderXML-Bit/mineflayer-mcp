import { deepStrictEqual } from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const expectedToolCount = 126;
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  env: { MCP_LOG_LEVEL: 'warn' },
  stderr: 'pipe',
});
let stderr = '';
transport.stderr.setEncoding('utf8').on('data', (chunk) => {
  stderr += chunk;
});

const client = new Client({ name: 'offline-release-check', version: '1.0.0' });
let result;
try {
  await client.connect(transport);
  result = await client.listTools();
} finally {
  await client.close();
}

const registrationFailures = stderr.match(/Failed to register [^\r\n]+? tools/g) ?? [];
if (registrationFailures.length > 0) {
  throw new Error(
    `Registered ${result.tools.length} of ${expectedToolCount} expected tools.\n` +
    registrationFailures.join('\n')
  );
}
if (result.tools.length !== expectedToolCount) {
  throw new Error(`Expected ${expectedToolCount} tools, received ${result.tools.length}`);
}

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const toolsSection = readme.split(/^## /m).find((section) => /^Tools\r?\n/.test(section));
const toolTable = toolsSection?.split(/\r?\n[ \t]*\r?\n/).find((block) =>
  /^\| Tool \| Purpose \|\r?\n\| --- \| --- \|(?:\r?\n|$)/.test(block)
);
if (!toolTable) {
  throw new Error('Could not find the tool table under "## Tools" in README.md.');
}

const documentedNames = toolTable.trimEnd().split(/\r?\n/).slice(2).map((row) => {
  const name = row.match(/^\|\s*`([^`]+)`\s*\|/)?.[1];
  if (!name) {
    throw new Error(`Invalid tool row in README.md: ${row}`);
  }
  return name;
});
const registeredNames = result.tools.map((tool) => tool.name);
deepStrictEqual(
  registeredNames.sort(),
  documentedNames.sort(),
  `MCP tools/list (${registeredNames.length} tools) differs from README.md (${documentedNames.length} rows).`
);

console.log(JSON.stringify({
  server: client.getServerVersion(),
  toolCount: result.tools.length,
  registrationFailures: registrationFailures.length,
  firstTools: result.tools.slice(0, 8).map((tool) => tool.name),
  note: 'MCP handshake and tool listing only. No Minecraft connection.',
}, null, 2));
