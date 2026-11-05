/**
 * @file Tool definitions exposed by the Photo Quest MCP server.
 *
 * Every tool is a thin wrapper around one `src/client.js` method, so the tool
 * layer only owns naming, validation, and result serialisation.
 */

import { z } from 'zod';
import { MEDIA_TYPE } from '@photo-quest/shared';

/** Serialise a tool payload as a single text content block. */
function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
}

/** Report a failed API call to the MCP client without crashing the server. */
function errorResult(err) {
  return { isError: true, content: [{ type: 'text', text: err.message }] };
}

/**
 * Register one tool whose handler is wrapped in shared result/error handling.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {string} name
 * @param {Object} config
 * @param {(args: Object) => Promise<any>} run
 */
function defineTool(server, name, config, run) {
  server.registerTool(name, config, async (args) => {
    try {
      return jsonResult(await run(args));
    } catch (err) {
      return errorResult(err);
    }
  });
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const id = z.number().int().positive();
const paging = {
  limit: z.number().int().min(1).max(200).default(50).describe('Maximum groups to return.'),
  offset: z.number().int().min(0).default(0).describe('Number of groups to skip.'),
};

/**
 * Register the basic Photo Quest tools on an MCP server.
 *
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {ReturnType<import('./client.js').createClient>} client
 */
export function registerTools(server, client) {
  defineTool(server, 'get_library', {
    title: 'Get library',
    description: 'Show which Photo Quest library database is open, its path, and how many visible media items it contains.',
    annotations: READ_ONLY,
  }, () => client.getLibrary());

  defineTool(server, 'list_media', {
    title: 'List media',
    description: 'Search and page through the media library, newest first by default. Returns matching items plus the total match count.',
    inputSchema: {
      search: z.string().optional().describe('Case-insensitive title substring.'),
      tag: z.string().optional().describe('Only media carrying this exact tag.'),
      type: z.enum([MEDIA_TYPE.IMAGE, MEDIA_TYPE.VIDEO]).optional().describe('Restrict to images or videos.'),
      folder: z.string().optional().describe('Absolute folder path to filter by.'),
      subtree: z.boolean().optional().describe('Include media in subfolders of `folder`.'),
      liked: z.boolean().optional().describe('Only media with at least one like.'),
      from: date.optional().describe('Earliest capture date (inclusive).'),
      to: date.optional().describe('Latest capture date (inclusive).'),
      sort: z.enum(['none', 'filename', 'likes']).optional().describe('Explicit ordering; omitted means newest first.'),
      limit: z.number().int().min(1).max(200).default(50).describe('Maximum items to return.'),
      offset: z.number().int().min(0).default(0).describe('Number of items to skip.'),
    },
    annotations: READ_ONLY,
  }, (args) => client.listMedia(args));

  defineTool(server, 'get_media', {
    title: 'Get media',
    description: 'Fetch one media item by id, including its metadata, tags, like count, and processing status.',
    inputSchema: { id },
    annotations: READ_ONLY,
  }, ({ id }) => client.getMedia(id));

  defineTool(server, 'list_tags', {
    title: 'List tags',
    description: 'List every tag with its usage count.',
    annotations: READ_ONLY,
  }, () => client.listTags());

  defineTool(server, 'list_folders', {
    title: 'List folders',
    description: 'List library folders with their media counts and parent relationships.',
    annotations: READ_ONLY,
  }, () => client.listFolders());

  defineTool(server, 'list_jobs', {
    title: 'List jobs',
    description: 'List transcode jobs (queued, running, paused, completed, failed) with their progress and errors.',
    annotations: READ_ONLY,
  }, () => client.listJobs());

  defineTool(server, 'list_duplicates', {
    title: 'List duplicates',
    description: 'List groups of byte-identical media sharing a content hash.',
    inputSchema: paging,
    annotations: READ_ONLY,
  }, (args) => client.listDuplicates(args));

  defineTool(server, 'merge_duplicates', {
    title: 'Merge duplicates',
    description: 'Merge a duplicate group into one record: keeps the most mature copy (or keepId), absorbs the union of tags and the sum of likes, and deletes the other records and their files from disk.',
    inputSchema: {
      ids: z.array(id).min(2).describe('Ids of the duplicate copies to merge.'),
      keepId: id.optional().describe('Copy to keep; defaults to the most mature surviving copy.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  }, ({ ids, keepId }) => client.mergeDuplicates({ ids, keepId }));

  defineTool(server, 'list_failed', {
    title: 'List failed media',
    description: 'List media whose file is missing or unreadable, or whose processing failed, grouped by content hash.',
    inputSchema: paging,
    annotations: READ_ONLY,
  }, (args) => client.listFailed(args));

  defineTool(server, 'get_storage', {
    title: 'Get storage usage',
    description: 'Report disk usage for the database, thumbnails, transcodes, and originals, plus free space on each volume.',
    annotations: READ_ONLY,
  }, () => client.getStorage());

  defineTool(server, 'scan_folder', {
    title: 'Scan folder',
    description: 'Index a folder on the Photo Quest server machine. Returns immediately with a scan id and the number of new files queued.',
    inputSchema: {
      path: z.string().min(1).describe('Absolute path to a folder on the machine running Photo Quest.'),
    },
    annotations: WRITE,
  }, ({ path }) => client.scan(path));

  defineTool(server, 'update_media_tags', {
    title: 'Update media tags',
    description: 'Replace the tag list for one media item. Pass an empty array to clear its tags.',
    inputSchema: {
      id,
      tags: z.array(z.string().min(1)).describe('Complete replacement tag list.'),
    },
    annotations: { ...WRITE, idempotentHint: true },
  }, ({ id, tags }) => client.updateTags(id, tags));

  defineTool(server, 'like_media', {
    title: 'Like media',
    description: 'Add likes to one media item. Returns the updated item with its new like count.',
    inputSchema: {
      id,
      count: z.number().int().min(1).max(30).default(1).describe('Number of likes to add.'),
    },
    annotations: WRITE,
  }, ({ id, count }) => client.likeMedia(id, count));
}
