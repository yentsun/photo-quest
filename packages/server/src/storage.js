/**
 * @file Disk usage stats and library backup helpers.
 *
 * Powers the Storage section of the Connections modal: it reports how much
 * space the database, generated thumbnails, transcoded outputs and the
 * original media occupy, plus the free space left on every volume those files
 * live on. It also produces the two downloadable backups — a consistent
 * snapshot of the SQLite database and a manifest of every media record.
 *
 * Everything here is read-only with respect to the library; the only file
 * written is the temporary database snapshot, which the caller removes.
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { DB_PATH } from './db.js';
import { THUMBS_DIR } from './paths.js';

/**
 * Rows stat'ed concurrently while summing file sizes. Stat calls queue on the
 * libuv threadpool anyway, so this only bounds how many promises are in flight
 * and gives the event loop a chance to breathe between chunks.
 */
const STAT_CHUNK = 256;

/** Columns exported by the media manifest, in order. */
export const MANIFEST_COLUMNS = [
  'id',
  'path',
  'title',
  'type',
  'folder',
  'size',
  'likes',
  'tags',
  'status',
  'hash',
  'date_taken',
  'transcoded_path',
];

/**
 * Size of a file in bytes, or null when it is missing or not a regular file.
 *
 * @param {string} filePath
 * @returns {Promise<number|null>}
 */
async function statSize(filePath) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/**
 * Size of a file in bytes, or 0 when it is missing or not a regular file.
 *
 * @param {string} filePath
 * @returns {Promise<number>}
 */
export async function fileSize(filePath) {
  return (await statSize(filePath)) ?? 0;
}

/**
 * Total bytes and file count across `paths`, skipping entries that are gone.
 *
 * @param {string[]} paths
 * @returns {Promise<{ bytes: number, count: number }>}
 */
async function sumSizes(paths) {
  let bytes = 0;
  let count = 0;

  for (let i = 0; i < paths.length; i += STAT_CHUNK) {
    const sizes = await Promise.all(paths.slice(i, i + STAT_CHUNK).map(statSize));
    for (const size of sizes) {
      if (size === null) continue;
      bytes += size;
      count++;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }

  return { bytes, count };
}

/**
 * Every regular file under `dir`, recursively. Missing/unreadable directories
 * count as empty.
 *
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listFiles(dir) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  const subdirs = [];
  for (const entry of entries) {
    if (entry.isDirectory()) subdirs.push(path.join(dir, entry.name));
    else if (entry.isFile()) files.push(path.join(dir, entry.name));
  }
  for (const subdir of subdirs) files.push(...await listFiles(subdir));
  return files;
}

/**
 * Total bytes and file count of a directory tree, recursively.
 * A missing directory reports zeroes rather than throwing.
 *
 * @param {string} dir
 * @returns {Promise<{ bytes: number, count: number }>}
 */
export async function dirStats(dir) {
  return sumSizes(await listFiles(dir));
}

/**
 * Free/total bytes of the volume holding `target`, or null when the platform
 * cannot report it.
 *
 * @param {string} target - A path on the volume (a volume root is ideal).
 * @returns {Promise<{ total: number, free: number, used: number }|null>}
 */
export async function diskSpace(target) {
  try {
    const stat = await fsp.statfs(target);
    const total = stat.bsize * stat.blocks;
    const free = stat.bsize * stat.bavail;
    return { total, free, used: total - free };
  } catch {
    return null;
  }
}

/**
 * Distinct volume roots the library touches: the one holding the database plus
 * the one behind every visible media folder.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} dbPath
 * @returns {string[]} Sorted volume roots (e.g. `C:\`, `/`).
 */
export function collectVolumeRoots(db, dbPath = DB_PATH) {
  const roots = new Set();

  const dbRoot = path.parse(dbPath).root;
  if (dbRoot) roots.add(dbRoot);

  const rows = db.prepare(
    'SELECT DISTINCT folder FROM media WHERE hidden = 0 AND folder IS NOT NULL'
  ).all();
  for (const row of rows) {
    const root = path.parse(row.folder).root;
    if (root) roots.add(root);
  }

  return [...roots].sort();
}

/**
 * Collect the whole storage report shown by the Storage section.
 *
 * Bytes for the database, thumbnails and transcoded outputs are read from
 * disk; the original media total comes from the `size` column captured at scan
 * time, so it costs a single aggregate rather than a stat per file.
 *
 * @param {{ db: import('node:sqlite').DatabaseSync, dbPath?: string, thumbsDir?: string }} options
 * @returns {Promise<{
 *   db: { path: string, dir: string, bytes: number, walBytes: number, shmBytes: number },
 *   thumbs: { path: string, bytes: number, count: number },
 *   transcodes: { bytes: number, count: number },
 *   originals: { bytes: number, count: number, images: number, videos: number },
 *   volumes: Array<{ path: string, total: number, free: number, used: number }>
 * }>}
 */
export async function collectStorageStats({ db, dbPath = DB_PATH, thumbsDir = THUMBS_DIR }) {
  const [dbBytes, walBytes, shmBytes, thumbs] = await Promise.all([
    fileSize(dbPath),
    fileSize(`${dbPath}-wal`),
    fileSize(`${dbPath}-shm`),
    dirStats(thumbsDir),
  ]);

  const transcodedPaths = db.prepare(
    'SELECT transcoded_path FROM media WHERE hidden = 0 AND transcoded_path IS NOT NULL'
  ).all().map((row) => row.transcoded_path);
  const transcodes = await sumSizes(transcodedPaths);

  const originals = db.prepare(`
    SELECT
      COUNT(*) AS count,
      COALESCE(SUM(size), 0) AS bytes,
      COALESCE(SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END), 0) AS images,
      COALESCE(SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END), 0) AS videos
    FROM media
    WHERE hidden = 0
  `).get();

  const volumes = [];
  for (const root of collectVolumeRoots(db, dbPath)) {
    const space = await diskSpace(root);
    if (space) volumes.push({ path: root, ...space });
  }

  return {
    db: { path: dbPath, dir: path.dirname(dbPath), bytes: dbBytes, walBytes, shmBytes },
    thumbs: { path: thumbsDir, ...thumbs },
    transcodes,
    originals,
    volumes,
  };
}

/** Quote a value as a SQLite string literal (single quotes doubled). */
function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Write a consistent snapshot of the live database to `destPath`.
 *
 * `VACUUM INTO` is the only safe way to copy a database that is open in WAL
 * mode: it runs as a read transaction and emits a fully checkpointed file, so
 * the copy can never observe a torn WAL. `destPath` must not already exist.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {string} destPath
 * @returns {string} `destPath`, for chaining.
 */
export function createDbSnapshot(db, destPath) {
  db.exec(`VACUUM INTO ${sqlString(destPath)}`);
  return destPath;
}

/** Serialise one manifest value for CSV, quoting when it contains a delimiter. */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Render manifest rows as RFC 4180 CSV (CRLF line endings, leading UTF-8 BOM so
 * spreadsheet apps pick the right encoding).
 *
 * @param {Object[]} rows
 * @returns {string}
 */
export function toCsv(rows) {
  const lines = [MANIFEST_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(MANIFEST_COLUMNS.map((column) => csvCell(row[column])).join(','));
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}

/**
 * Build a manifest of every visible media record — the human/machine-readable
 * half of a backup, since the files themselves are the originals on disk.
 *
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {'csv'|'json'} [format]
 * @returns {{ contentType: string, body: string, count: number }}
 */
export function buildManifest(db, format = 'csv') {
  const rows = db.prepare(`
    SELECT id, path, title, type, folder, size, likes, tags, status, hash, date_taken, transcoded_path
    FROM media
    WHERE hidden = 0
    ORDER BY path
  `).all();

  const items = rows.map((row) => {
    let tags = [];
    try {
      const parsed = JSON.parse(row.tags ?? '[]');
      if (Array.isArray(parsed)) tags = parsed;
    } catch { /* leave an unparseable tags column empty */ }
    return { ...row, tags };
  });

  if (format === 'json') {
    return {
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(
        { generated_at: new Date().toISOString(), count: items.length, items },
        null,
        2
      ),
      count: items.length,
    };
  }

  return {
    contentType: 'text/csv; charset=utf-8',
    body: toCsv(items.map((item) => ({ ...item, tags: item.tags.join('|') }))),
    count: items.length,
  };
}
