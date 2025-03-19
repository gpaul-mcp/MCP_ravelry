import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import path from 'path';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

config({
  path: path.resolve(process.cwd(), envFile),
});

// process.env.AUTH_USER = "XXXXXXXX";
// process.env.AUTH_PASS = "XXXXXXXX";

export const mcpServer = new McpServer({
  name: 'Ravelry',
  version: '1.0.0',
});

// Import all endpoints
import './endpoints';

async function main() {
  if (!process.env.AUTH_USER) {
    throw new Error('AUTH_USER environment variable not set.');
  }
  if (!process.env.AUTH_PASS) {
    throw new Error('AUTH_PASS environment variable not set.');
  }

  try {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);

    if (process.env.NODE_ENV === 'development') {
      console.log('Connected to MCP server');
    }
  } catch (error) {
    console.error('Error connecting MCP server:', error);
    process.exit(1);
  }
}

// Run main function
main().catch(error => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
