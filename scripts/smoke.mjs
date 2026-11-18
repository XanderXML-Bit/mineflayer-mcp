import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['dist/index.js'],
  stderr: 'pipe',
});
const client = new Client({ name: 'offline-release-check', version: '1.0.0' });
try {
  await client.connect(transport);
  const result = await client.listTools();
  if (result.tools.length === 0) throw new Error('The server returned no tools');
  console.log(JSON.stringify({
    server: client.getServerVersion(),
    toolCount: result.tools.length,
    firstTools: result.tools.slice(0, 8).map((tool) => tool.name),
    note: 'MCP handshake and tool listing only. No Minecraft connection.',
  }, null, 2));
} finally {
  await client.close();
}
