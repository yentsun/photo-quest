/**
 * @file SQLite database initialisation and access for the server package.
 *
 * Uses `sql.js`, a pure WASM build of SQLite that requires no native
 * compilation.  Unlike better-sqlite3, sql.js operates on an in-memory
 * copy of the database file and we must manually persist changes to disk.
 *
 * The database file lives at `packages/server/photo-quest.db`.  The worker
 * package opens the same file independently.  Because sql.js does not
 * support WAL mode across processes, we flush to disk after each write
 * operation and the worker re-reads from disk on each poll cycle.
 */

import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, CREATE_FOLDERS_TABLE } from '@photo-quest/shared';

/* Compute __dirname for ES modules. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the SQLite database file.
 * @type {string}
 */
const DB_PATH = path.join(__dirname, '..', 'photo-quest.db');

/**
 * Module-level singleton database instance.
 * @type {import('sql.js').Database | undefined}
 */
let db;

/**
 * Module-level reference to the sql.js SQL module (needed for creating DBs).
 * @type {import('sql.js').SqlJsStatic | undefined}
 */
let SQL;

/**
 * Initialise the sql.js WASM engine and open (or create) the database file.
 *
 * Must be called once at startup before any queries.  Loads existing data
 * from disk if the file exists, otherwise creates an empty database.
 * Enables foreign key enforcement via PRAGMA.
 *
 * @returns {Promise<import('sql.js').Database>} The initialised database.
 */
export async function initDb() {
  SQL = await initSqlJs();

  /* Load existing database from disk if it exists, otherwise start fresh. */
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  /* Enable foreign key enforcement (off by default in SQLite). */
  db.run('PRAGMA foreign_keys = ON');

  /* Create tables if they do not exist yet. */
  db.run(CREATE_MEDIA_TABLE);
  db.run(CREATE_JOBS_TABLE);
  db.run(CREATE_SCANS_TABLE);
  db.run(CREATE_IMPORT_QUEUE_TABLE);
  db.run(CREATE_FOLDERS_TABLE);

  /* Run migrations for existing databases. */
  migrateDb();

  /* Persist the freshly-created schema to disk. */
  saveDb();

  console.debug(`[db] Initialised (${fs.existsSync(DB_PATH) ? 'loaded from disk' : 'new database'})`);
  return db;
}

/**
 * Return the singleton database instance.
 *
 * @returns {import('sql.js').Database} The open sql.js database.
 * @throws {Error} If called before `initDb()`.
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized -- call initDb() first');
  return db;
}

/**
 * Persist the in-memory database to disk.
 *
 * sql.js operates entirely in memory, so we must explicitly write the
 * database binary to the filesystem after any INSERT/UPDATE/DELETE.
 * This is called after every write operation to ensure durability.
 */
export function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, data);
}

/**
 * Reload the database from disk.
 *
 * Used when we need to see changes made by the worker process (which
 * writes to the same file independently).
 */
export function reloadDb() {
  if (!SQL) throw new Error('SQL.js not initialized');
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    db.run('PRAGMA foreign_keys = ON');
  }
}

/**
 * Run database migrations to add new columns to existing tables.
 *
 * This handles the case where a database was created before the likes,
 * type, and folder columns were added to the schema.
 *
 * SQLite's ALTER TABLE ADD COLUMN is used. Errors are silently ignored
 * because they indicate the column already exists.
 */
function migrateDb() {
  const migrations = [
    'ALTER TABLE media ADD COLUMN likes INTEGER NOT NULL DEFAULT 0',
    "ALTER TABLE media ADD COLUMN type TEXT NOT NULL DEFAULT 'video'",
    'ALTER TABLE media ADD COLUMN folder TEXT',
    'ALTER TABLE media ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE media ADD COLUMN hash TEXT',
    'ALTER TABLE media ADD COLUMN orientation INTEGER',
    'ALTER TABLE media ADD COLUMN camera TEXT',
    'ALTER TABLE media ADD COLUMN date_taken TEXT',
  ];

  for (const sql of migrations) {
    try {
      db.run(sql);
      console.debug(`[db] Migration applied: ${sql.substring(0, 50)}...`);
    } catch (err) {
      /* Column already exists -- ignore. */
    }
  }

  /* Populate folders table from existing media (one-time migration). */
  try {
    db.run(
      'INSERT OR IGNORE INTO folders (path) SELECT DISTINCT folder FROM media WHERE folder IS NOT NULL'
    );
  } catch (err) {
    /* Table may not exist yet on first run -- ignore. */
  }
}
