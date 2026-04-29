import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import packageJson from '../package.json' with { type: 'json' };
import { AGENT_INSTRUCTIONS } from './instructions.js';
import { openDatabase } from './db.js';
import { registerTools } from './tools.js';

const db = openDatabase();

// Create server instance
const server = new McpServer(
  {
    name: 'matrix',
    version: packageJson.version,
    description: packageJson.description,
  },
  {
    instructions: AGENT_INSTRUCTIONS,
  }
);

registerTools(server, db);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MATRIX MCP Server running on stdio');
}

try {
  await main();
} catch (error) {
  console.error('Fatal error in main():', error);
  process.exit(1);
}
