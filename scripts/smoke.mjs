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

console.log(JSON.stringify({
  server: client.getServerVersion(),
  toolCount: result.tools.length,
  registrationFailures: registrationFailures.length,
  firstTools: result.tools.slice(0, 8).map((tool) => tool.name),
  note: 'MCP handshake and tool listing only. No Minecraft connection.',
}, null, 2));
