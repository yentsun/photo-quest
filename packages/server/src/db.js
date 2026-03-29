/**
 * @file SQLite database initialisation and access for the server package.
 *
 * Uses Node.js built-in `node:sqlite` (DatabaseSync), a native SQLite binding
 * that writes directly to disk.  No manual persistence (export/save) is needed
 * — all writes go straight to the database file.  WAL mode is enabled for
 * concurrent access from the worker process.
 *
 * The database file lives at `packages/server/photo-quest.db`.  The worker
 * package opens the same file independently.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE, CREATE_SCANS_TABLE, CREATE_IMPORT_QUEUE_TABLE, CREATE_FOLDERS_TABLE, CREATE_PLAYER_STATS_TABLE, CREATE_INVENTORY_TABLE, CREATE_QUEST_DECKS_TABLE, CREATE_QUEST_CARDS_TABLE, CREATE_MEMORY_TICKETS_TABLE, CREATE_PILES_TABLE, CREATE_PILE_CARDS_TABLE } from '@photo-quest/shared';

/* Compute __dirname for ES modules. */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the SQLite database file.
 * @type {string}
 */
const DB_PATH = path.join(__dirname, '..', 'photo-quest.db');

/**
 * Module-level singleton database instance.
 * @type {import('node:sqlite').DatabaseSync | undefined}
 */
let db;

/**
 * Open (or create) the database file and apply schema + migrations.
 *
 * Must be called once at startup before any queries.
 *
 * @returns {import('node:sqlite').DatabaseSync} The initialised database.
 */
export function initDb() {
  db = new DatabaseSync(DB_PATH);

  /* WAL mode allows concurrent reads from the worker process. */
  db.exec('PRAGMA journal_mode = WAL');

  /* Retry for up to 5 seconds if the worker is writing. */
  db.exec('PRAGMA busy_timeout = 5000');

  /* Enable foreign key enforcement (off by default in SQLite). */
  db.exec('PRAGMA foreign_keys = ON');

  /* Create tables if they do not exist yet. */
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
  db.exec(CREATE_PILES_TABLE);
  db.exec(CREATE_PILE_CARDS_TABLE);

  /* Seed the singleton player_stats row. */
  db.exec('INSERT OR IGNORE INTO player_stats (id, dust) VALUES (1, 50)');

  /* Run migrations for existing databases. */
  migrateDb();

  const existed = fs.existsSync(DB_PATH);
  console.debug(`[db] Initialised (${existed ? 'loaded from disk' : 'new database'})`);
  return db;
}

/**
 * Return the singleton database instance.
 *
 * @returns {import('node:sqlite').DatabaseSync} The open database.
 * @throws {Error} If called before `initDb()`.
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized -- call initDb() first');
  return db;
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
    'ALTER TABLE media ADD COLUMN infusion INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE quest_decks ADD COLUMN free_take_used INTEGER NOT NULL DEFAULT 0',
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
      console.debug(`[db] Migration applied: ${sql.substring(0, 50)}...`);
    } catch (err) {
      /* Column already exists -- ignore. */
    }
  }

  /* Populate folders table from existing media (one-time migration). */
  try {
    db.exec(
      'INSERT OR IGNORE INTO folders (path) SELECT DISTINCT folder FROM media WHERE folder IS NOT NULL'
    );
  } catch (err) {
    /* Table may not exist yet on first run -- ignore. */
  }
}
