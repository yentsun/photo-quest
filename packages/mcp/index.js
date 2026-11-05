#!/usr/bin/env node
/**
 * @file Entry point for the Photo Quest MCP server (stdio transport).
 *
 * Point an MCP client at this file and set `PHOTO_QUEST_URL` when Photo Quest
 * is not running on the default local port.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClient } from './src/client.js';
import { resolveBaseUrl } from './src/config.js';
import { createMcpServer } from './src/server.js';

const baseUrl = resolveBaseUrl();
const server = createMcpServer(createClient({ baseUrl }));

await server.connect(new StdioServerTransport());

/* stdout carries the protocol, so diagnostics go to stderr. */
console.error(`[photo-quest-mcp] connected to ${baseUrl}`);
