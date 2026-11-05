/**
 * @file Builds the MCP server and attaches the Photo Quest tools.
 *
 * Kept separate from the stdio entry point so tests can connect an in-memory
 * transport without spawning a process.
 */

import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * @param {ReturnType<import('./client.js').createClient>} client
 * @returns {McpServer}
 */
export function createMcpServer(client) {
  const server = new McpServer({ name: 'photo-quest', version: pkg.version });
  registerTools(server, client);
  return server;
}
