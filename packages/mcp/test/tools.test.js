/**
 * @file Tests the MCP tool surface over an in-memory transport.
 */

import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createMcpServer } from '../src/server.js';

const TOOL_METHODS = [
  'listMedia',
  'getMedia',
  'listTags',
  'listFolders',
  'listJobs',
  'listDuplicates',
  'listFailed',
  'mergeDuplicates',
  'getStorage',
  'getLibrary',
  'scan',
  'updateTags',
  'likeMedia',
];

/**
 * Build a client double that records every call and returns `overrides[name]`
 * when supplied.
 *
 * @param {Record<string, Function>} [overrides]
 */
function createStubClient(overrides = {}) {
  const calls = [];
  const client = { calls };
  for (const name of TOOL_METHODS) {
    client[name] = async (...args) => {
      calls.push({ name, args });
      return overrides[name] ? overrides[name](...args) : { method: name, args };
    };
  }
  return client;
}

/** Connect an MCP client to the server under test in-process. */
async function connect(t, apiClient) {
  const server = createMcpServer(apiClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcp = new Client({ name: 'photo-quest-test', version: '0.0.0' });
  await mcp.connect(clientTransport);

  t.after(async () => {
    await mcp.close();
    await server.close();
  });
  return mcp;
}

test('exposes the basic Photo Quest tool set', async (t) => {
  const mcp = await connect(t, createStubClient());
  const { tools } = await mcp.listTools();

  t.assert.deepEqual(tools.map(tool => tool.name).sort(), [
    'get_library',
    'get_media',
    'get_storage',
    'like_media',
    'list_duplicates',
    'list_failed',
    'list_folders',
    'list_jobs',
    'list_media',
    'list_tags',
    'merge_duplicates',
    'scan_folder',
    'update_media_tags',
  ]);
  for (const tool of tools) {
    t.assert.ok(tool.description, `${tool.name} has a description`);
  }
});

test('paged tools apply their defaults and serialise the result', async (t) => {
  const apiClient = createStubClient({ listMedia: () => ({ total: 0, items: [] }) });
  const mcp = await connect(t, apiClient);

  const result = await mcp.callTool({ name: 'list_media', arguments: {} });
  await mcp.callTool({ name: 'list_duplicates', arguments: {} });
  await mcp.callTool({ name: 'list_failed', arguments: {} });

  t.assert.deepEqual(apiClient.calls[0], { name: 'listMedia', args: [{ limit: 50, offset: 0 }] });
  t.assert.deepEqual(apiClient.calls.slice(1), [
    { name: 'listDuplicates', args: [{ limit: 50, offset: 0 }] },
    { name: 'listFailed', args: [{ limit: 50, offset: 0 }] },
  ]);
  t.assert.deepEqual(JSON.parse(result.content[0].text), { total: 0, items: [] });
});

test('tools forward their arguments to the API client', async (t) => {
  const apiClient = createStubClient();
  const mcp = await connect(t, apiClient);

  await mcp.callTool({ name: 'scan_folder', arguments: { path: '/media/photos' } });
  await mcp.callTool({ name: 'update_media_tags', arguments: { id: 5, tags: ['trip', 'sky'] } });
  await mcp.callTool({ name: 'like_media', arguments: { id: 5 } });
  await mcp.callTool({ name: 'merge_duplicates', arguments: { ids: [5, 9], keepId: 5 } });

  t.assert.deepEqual(apiClient.calls, [
    { name: 'scan', args: ['/media/photos'] },
    { name: 'updateTags', args: [5, ['trip', 'sky']] },
    { name: 'likeMedia', args: [5, 1] },
    { name: 'mergeDuplicates', args: [{ ids: [5, 9], keepId: 5 }] },
  ]);
});

test('API errors are reported as tool errors without crashing', async (t) => {
  const apiClient = createStubClient({
    getMedia: () => { throw new Error('Media not found'); },
  });
  const mcp = await connect(t, apiClient);

  const result = await mcp.callTool({ name: 'get_media', arguments: { id: 99 } });

  t.assert.equal(result.isError, true);
  t.assert.equal(result.content[0].text, 'Media not found');
});

test('invalid arguments are rejected before reaching the API client', async (t) => {
  const apiClient = createStubClient();
  const mcp = await connect(t, apiClient);

  const result = await mcp.callTool({ name: 'get_media', arguments: { id: -1 } });

  t.assert.equal(result.isError, true);
  t.assert.deepEqual(apiClient.calls, []);
});
