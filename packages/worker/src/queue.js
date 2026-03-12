/**
 * @file Database access layer for the worker -- job queue operations.
 *
 * Uses sql.js (WASM-based SQLite) instead of better-sqlite3 to avoid
 * native compilation requirements.  The worker and server share the same
 * physical database file.
 *
 * Because sql.js operates in-memory, we must:
 *  - Reload from disk before reading (to see server's writes)
 *  - Save to disk after writing (so the server can see our writes)
 *
 * Job queue state transitions:
 *   pending  --(claim)--->  running  --(complete)-->  completed
 *                              |
 *                              +--(fail)----------->  failed
 */

import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, CREATE_FOLDERS_TABLE } from '@photo-quest/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the shared SQLite database file.
 * Points to the server package's database.
 * @type {string}
 */
const DB_PATH = path.join(__dirname, '..', '..', 'server', 'photo-quest.db');

/** @type {import('sql.js').SqlJsStatic | undefined} */
let SQL;

/** @type {import('sql.js').Database | undefined} */
let db;

/**
 * Load the database from disk into memory.
 * Called before every read/write cycle to get the latest state.
 */
function loadFromDisk() {
  if (fs.existsSync(DB_PATH)) {
    const data = fs.readFileSync(DB_PATH);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
  }
  db.run('PRAGMA foreign_keys = ON');
}

/**
 * Persist the in-memory database back to disk.
 * Called after every write operation.
 */
function saveToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/**
 * Helper: run a SELECT and return the first row as an object, or null.
 */
function getOne(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let result = null;
  if (stmt.step()) result = stmt.getAsObject();
  stmt.free();
  return result;
}

/**
 * Helper: run a SELECT and return all rows as an array of objects.
 */
function getAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results = [];
  while (stmt.step()) results.push(stmt.getAsObject());
  stmt.free();
  return results;
}

/**
 * Initialise the sql.js WASM engine and ensure tables exist.
 */
export async function initDb() {
  SQL = await initSqlJs();
  loadFromDisk();
  db.run(CREATE_MEDIA_TABLE);
  db.run(CREATE_JOBS_TABLE);
  db.run(CREATE_SCANS_TABLE);
  db.run(CREATE_IMPORT_QUEUE_TABLE);
  db.run(CREATE_FOLDERS_TABLE);
  saveToDisk();
  console.log('Worker database connected');
}

/**
 * Return the current database instance.
 */
export function getDb() {
  return db;
}

// ---------------------------------------------------------------------------
// Job queue operations
// ---------------------------------------------------------------------------

/**
 * Atomically find the oldest pending job and claim it.
 *
 * Reloads from disk first to see any new jobs the server has queued.
 *
 * @returns {Object|null} The claimed job (with media_path and media_title),
 *   or null if the queue is empty.
 */
export function claimNextJob() {
  /* Reload to see latest state from server. */
  loadFromDisk();

  const job = getOne(`
    SELECT j.*, m.path as media_path, m.title as media_title
    FROM jobs j
    JOIN media m ON m.id = j.media_id
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT 1
  `);

  if (!job) return null;

  /* Mark as running. */
  db.run(
    "UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?",
    [job.id]
  );
  saveToDisk();

  return job;
}

/**
 * Mark a job as completed and optionally update the associated media record.
 *
 * @param {number} jobId - The job ID.
 * @param {Object} [updates={}] - Optional media updates.
 */
export function completeJob(jobId, updates = {}) {
  loadFromDisk();

  db.run(
    "UPDATE jobs SET status = 'completed', progress = 100, updated_at = datetime('now') WHERE id = ?",
    [jobId]
  );

  if (updates.mediaUpdate) {
    const { mediaId, ...fields } = updates.mediaUpdate;
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = Object.values(fields);
    db.run(
      `UPDATE media SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`,
      [...values, mediaId]
    );
  }

  saveToDisk();
}

/**
 * Mark a job as failed and record the error message.
 *
 * @param {number} jobId - The job ID.
 * @param {string} error - Error description.
 */
export function failJob(jobId, error) {
  loadFromDisk();
  db.run(
    "UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?",
    [error, jobId]
  );
  saveToDisk();
}

/**
 * Insert a new pending job (e.g. after probe, queue a transcode).
 *
 * @param {number} mediaId - The media record ID.
 * @param {string} type - Job type (probe or transcode).
 */
export function createJob(mediaId, type) {
  db.run(
    "INSERT INTO jobs (media_id, type, status) VALUES (?, ?, 'pending')",
    [mediaId, type]
  );
  saveToDisk();
}

/**
 * Update a running job's progress percentage.
 *
 * @param {number} jobId - The job ID.
 * @param {number} progress - Progress value (0-100).
 */
export function updateJobProgress(jobId, progress) {
  db.run(
    "UPDATE jobs SET progress = ?, updated_at = datetime('now') WHERE id = ?",
    [progress, jobId]
  );
  saveToDisk();
}

/**
 * Update a media record's status.
 *
 * @param {number} mediaId - The media ID.
 * @param {string} status - New status value.
 */
export function updateMediaStatus(mediaId, status) {
  db.run(
    "UPDATE media SET status = ?, updated_at = datetime('now') WHERE id = ?",
    [status, mediaId]
  );
  saveToDisk();
}
