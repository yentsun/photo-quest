/**
 * @file Database access layer for the worker -- job queue operations.
 *
 * Uses Node.js built-in `node:sqlite` (DatabaseSync) that writes directly
 * to disk.  WAL mode is enabled so the worker can read while the server
 * writes, and vice versa — no manual load/save cycles needed.
 *
 * Job queue state transitions:
 *   pending  --(claim)--->  running  --(complete)-->  completed
 *                              |
 *                              +--(fail)----------->  failed
 */

import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, CREATE_FOLDERS_TABLE, CREATE_PLAYER_STATS_TABLE, CREATE_INVENTORY_TABLE, CREATE_QUEST_DECKS_TABLE, CREATE_QUEST_CARDS_TABLE, CREATE_MEMORY_TICKETS_TABLE, CREATE_DECKS_TABLE, CREATE_DECK_CARDS_TABLE } from '@photo-quest/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Path to the shared SQLite database file.
 * Points to the server package's database.
 * @type {string}
 */
const DB_PATH = path.join(__dirname, '..', '..', 'server', 'photo-quest.db');

/** @type {import('node:sqlite').DatabaseSync | undefined} */
let db;

/**
 * Open the database and ensure tables exist.
 */
export function initDb() {
  db = new DatabaseSync(DB_PATH);

  /* WAL mode for concurrent access with the server process. */
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(CREATE_MEDIA_TABLE);
  db.exec(CREATE_JOBS_TABLE);
  db.exec(CREATE_SCANS_TABLE);
  db.exec(CREATE_IMPORT_QUEUE_TABLE);
  db.exec(CREATE_FOLDERS_TABLE);
  db.exec(CREATE_PLAYER_STATS_TABLE);
  db.exec(CREATE_INVENTORY_TABLE);
  db.exec(CREATE_QUEST_DECKS_TABLE);
  db.exec(CREATE_QUEST_CARDS_TABLE);
  db.exec(CREATE_MEMORY_TICKETS_TABLE);
  db.exec(CREATE_DECKS_TABLE);
  db.exec(CREATE_DECK_CARDS_TABLE);

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
 * @returns {Object|null} The claimed job (with media_path and media_title),
 *   or null if the queue is empty.
 */
export function claimNextJob() {
  const job = db.prepare(`
    SELECT j.*, m.path as media_path, m.title as media_title
    FROM jobs j
    JOIN media m ON m.id = j.media_id
    WHERE j.status = 'pending'
    ORDER BY j.created_at ASC
    LIMIT 1
  `).get();

  if (!job) return null;

  /* Mark as running. */
  db.prepare(
    "UPDATE jobs SET status = 'running', updated_at = datetime('now') WHERE id = ?"
  ).run(job.id);

  return job;
}

/**
 * Mark a job as completed and optionally update the associated media record.
 *
 * @param {number} jobId - The job ID.
 * @param {Object} [updates={}] - Optional media updates.
 */
export function completeJob(jobId, updates = {}) {
  db.prepare(
    "UPDATE jobs SET status = 'completed', progress = 100, updated_at = datetime('now') WHERE id = ?"
  ).run(jobId);

  if (updates.mediaUpdate) {
    const { mediaId, ...fields } = updates.mediaUpdate;
    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = Object.values(fields);
    db.prepare(
      `UPDATE media SET ${setClauses}, updated_at = datetime('now') WHERE id = ?`
    ).run(...values, mediaId);
  }
}

/**
 * Mark a job as failed and record the error message.
 *
 * @param {number} jobId - The job ID.
 * @param {string} error - Error description.
 */
export function failJob(jobId, error) {
  db.prepare(
    "UPDATE jobs SET status = 'failed', error = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(error, jobId);
}

/**
 * Insert a new pending job (e.g. after probe, queue a transcode).
 *
 * @param {number} mediaId - The media record ID.
 * @param {string} type - Job type (probe or transcode).
 */
export function createJob(mediaId, type) {
  db.prepare(
    "INSERT INTO jobs (media_id, type, status) VALUES (?, ?, 'pending')"
  ).run(mediaId, type);
}

/**
 * Update a running job's progress percentage.
 *
 * @param {number} jobId - The job ID.
 * @param {number} progress - Progress value (0-100).
 */
export function updateJobProgress(jobId, progress) {
  db.prepare(
    "UPDATE jobs SET progress = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(progress, jobId);
}

/**
 * Update a media record's status.
 *
 * @param {number} mediaId - The media ID.
 * @param {string} status - New status value.
 */
export function updateMediaStatus(mediaId, status) {
  db.prepare(
    "UPDATE media SET status = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(status, mediaId);
}
