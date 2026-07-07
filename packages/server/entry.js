import 'urlpattern-polyfill';
import Kojo from 'kojo';
import Service from 'kojo/lib/Service.js';
import Logger from 'kojo/lib/Logger.js';
import config from '@photo-quest/shared/config.js';
import { initDb } from './src/db.js';
import { resumeIncompleteScans } from './ops/scanMedia.js';

import path from 'node:path';
import fs from 'node:fs';

import kojoPackage from './node_modules/kojo/package.json' with { type: 'json' };

const LOG_PATH = path.join(process.cwd(), 'photo-quest.log');

const logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
for (const streamName of ['stdout', 'stderr']) {
  const original = process[streamName].write.bind(process[streamName]);
  process[streamName].write = (chunk, ...args) => {
    const str = typeof chunk === 'string' ? chunk : chunk.toString();
    if (str.trim()) {
      const ts = new Date().toISOString().slice(11, 23);
      const line = `${ts} ${str}`;
      logStream.write(line);
      return original(line, ...args);
    }
    return original(chunk, ...args);
  };
}

import addHttpRouteFn from './ops/addHttpRoute.js';
import addMediaFn from './ops/addMedia.js';
import getMediaByIdFn from './ops/getMediaById.js';
import likeMediaFn from './ops/likeMedia.js';
import listMediaFn from './ops/listMedia.js';
import listTagsFn from './ops/listTags.js';
import removeMediaFn from './ops/removeMedia.js';
import renameMediaFn from './ops/renameMedia.js';
import requestMiddlewareFn from './ops/requestMiddleware.js';
import scanMediaFn from './ops/scanMedia.js';
import transcodeNowFn from './ops/transcodeNow.js';
import updateTagsFn from './ops/updateTags.js';

import getMediaEndpoint from './endpoints/10_get_media.js';
import getFoldersEndpoint from './endpoints/12_get_folders.js';
import patchFolderIdEndpoint from './endpoints/16_patch_folder_id.js';
import getMediaIdEndpoint from './endpoints/20_get_media_id.js';
import getMediaIdStatusEndpoint from './endpoints/22_get_media_id_status.js';
import patchMediaIdLikeEndpoint from './endpoints/25_patch_media_id_like.js';
import patchMediaIdTitleEndpoint from './endpoints/27_patch_media_id_title.js';
import postMediaIdTranscodeEndpoint from './endpoints/28_post_media_id_transcode.js';
import patchMediaIdTagsEndpoint from './endpoints/29_patch_media_id_tags.js';
import postMediaScanEndpoint from './endpoints/30_post_media_scan.js';
import getScansEndpoint from './endpoints/32_get_scans.js';
import postScansCancelEndpoint from './endpoints/33_post_scans_cancel.js';
import postMediaAddEndpoint from './endpoints/35_post_media_add.js';
import postOpenFolderEndpoint from './endpoints/36_post_open_folder.js';
import postMediaCheckPathEndpoint from './endpoints/38_post_media_check_path.js';
import deleteMediaIdEndpoint from './endpoints/40_delete_media_id.js';
import deleteMediaFolderEndpoint from './endpoints/45_delete_media_folder.js';
import getStreamIdEndpoint from './endpoints/50_get_stream_id.js';
import getImageIdEndpoint from './endpoints/55_get_image_id.js';
import getThumbIdEndpoint from './endpoints/57_get_thumb_id.js';
import getTagsEndpoint from './endpoints/65_get_tags.js';
import getJobsEventsEndpoint from './endpoints/70_get_jobs_events.js';
import getNetworkEndpoint from './endpoints/80_get_network.js';
import postLibraryPickEndpoint from './endpoints/90_post_library_pick.js';
import postLibraryConnectEndpoint from './endpoints/91_post_library_connect.js';

const OPS = [
  ['addHttpRoute', addHttpRouteFn],
  ['addMedia', addMediaFn],
  ['getMediaById', getMediaByIdFn],
  ['likeMedia', likeMediaFn],
  ['listMedia', listMediaFn],
  ['listTags', listTagsFn],
  ['removeMedia', removeMediaFn],
  ['renameMedia', renameMediaFn],
  ['requestMiddleware', requestMiddlewareFn],
  ['scanMedia', scanMediaFn],
  ['transcodeNow', transcodeNowFn],
  ['updateTags', updateTagsFn],
];

const ENDPOINTS = [
  getMediaEndpoint,
  getFoldersEndpoint,
  patchFolderIdEndpoint,
  getMediaIdEndpoint,
  getMediaIdStatusEndpoint,
  patchMediaIdLikeEndpoint,
  patchMediaIdTitleEndpoint,
  postMediaIdTranscodeEndpoint,
  patchMediaIdTagsEndpoint,
  postMediaScanEndpoint,
  getScansEndpoint,
  postScansCancelEndpoint,
  postMediaAddEndpoint,
  postOpenFolderEndpoint,
  postMediaCheckPathEndpoint,
  deleteMediaIdEndpoint,
  deleteMediaFolderEndpoint,
  getStreamIdEndpoint,
  getImageIdEndpoint,
  getThumbIdEndpoint,
  getTagsEndpoint,
  getJobsEventsEndpoint,
  getNetworkEndpoint,
  postLibraryPickEndpoint,
  postLibraryConnectEndpoint,
];

export default async function boot() {

  const PORT = config.serverPort;

  const MEDIA_PATHS = process.env.MEDIA_PATHS
    ? process.env.MEDIA_PATHS.split(';').map(p => p.trim()).filter(Boolean)
    : [];

  const kojo = new Kojo({
    name: 'photo-quest',
    functionsDir: 'ops',
    subsDir: 'endpoints',
    logLevel: 'debug',
  });

  kojo.set('routes', []);
  kojo.set('port', PORT);
  kojo.set('mediaPaths', MEDIA_PATHS);
  kojo.set('settingsPath', process.env.SETTINGS_PATH || null);

  if (MEDIA_PATHS.length > 0) {
    console.debug(`[boot] Media paths configured: ${MEDIA_PATHS.join(', ')}`);
  }

  console.debug('[boot] Initialising database...');
  const db = initDb();
  kojo.set('db', db);

  console.debug('[boot] Loading ops and endpoints...');

  const icon = '';
  const parentPackage = { name: 'photo-quest', version: '0.4.0' };
  process.stdout.write('\n*************************************************************\n');
  process.stdout.write(`  ${icon}${kojo.id}  |  ${parentPackage.name}@${parentPackage.version}  |  ${kojoPackage.name}@${kojoPackage.version}\n`);
  process.stdout.write('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n');

  kojo.ops = {};
  for (const [name, fn] of OPS) {
    kojo.ops[name] = Service.wrapFunction(fn, kojo, [name]);
  }

  const logger = new Logger({ id: kojo.name, icon, level: 'debug', tagPieces: ['boot'], color: 'bold' });

  for (const endpoint of ENDPOINTS) {
    await endpoint(kojo, logger);
  }

  process.stdout.write(`    ${icon}kojo "${kojo.name}" ready [${process.env.NODE_ENV}]\n`);
  process.stdout.write('*************************************************************\n');

  const { requestMiddleware } = kojo.ops;
  const routes = kojo.get('routes') || [];
  console.debug(`[boot] ${routes.length} routes registered`);
  requestMiddleware();

  resumeIncompleteScans(kojo, console);

  return kojo;
}

boot();
