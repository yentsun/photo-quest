/**
 * @file SQLite table definitions shared between the server and the worker.
 *
 * Both the server and the worker run all CREATE TABLE statements at startup
 * so that whichever process starts first will create the tables, and
 * subsequent starts are no-ops thanks to `CREATE TABLE IF NOT EXISTS`.
 *
 * Tables: media, jobs, scans, import_queue, folders.
 *
 * IMPORTANT: if you change a column here you will also need a migration
 * strategy for existing databases -- `IF NOT EXISTS` only applies to the whole
 * table, not individual columns.
 */

/**
 * SQL statement that creates the `media` table.
 *
 * Column notes:
 *  - `path`            Absolute filesystem path to the original media file.
 *                      Marked UNIQUE so that re-scanning the same directory
 *                      will not create duplicate rows (INSERT OR IGNORE).
 *  - `title`           Human-readable name derived from the filename (without
 *                      the extension).
 *  - `type`            Either 'video' or 'image' -- see MEDIA_TYPE enum.
 *  - `folder`          Parent directory path for folder-based filtering.
 *  - `duration`        Length in seconds, populated after the ffprobe step.
 *  - `width` / `height` Video resolution in pixels, populated after probe.
 *  - `codec`           Video codec name (e.g. "h264", "vp9"), from ffprobe.
 *  - `status`          Current pipeline state -- see MEDIA_STATUS enum.
 *  - `transcoded_path` Absolute path to the transcoded MP4, or NULL if the
 *                      original is already in the target format.
 *  - `size`            File size in bytes.
 *  - `likes`           (deprecated — replaced by infusion) Legacy like count.
 *  - `infusion`        Dust invested into this media. Higher values increase
 *                      the chance of appearing in quest decks.
 *  - `hidden`          1 if folder was removed (preserves likes/metadata for
 *                      re-adding later), 0 otherwise.
 *  - `hash`            Content hash (first 64KB + size) for identifying same
 *                      media across different paths/filenames.
 *  - `orientation`     EXIF orientation tag (1-8). 1 = normal, 6 = 90° CW,
 *                      etc. NULL for videos or images without EXIF.
 *  - `camera`          Camera make/model from EXIF (e.g. "FUJIFILM X100").
 *  - `date_taken`      ISO-8601 datetime from EXIF DateTimeOriginal.
 *  - `created_at` /
 *    `updated_at`      ISO-8601 timestamps managed by SQLite defaults and
 *                      explicit UPDATEs in the worker.
 *
 * @type {string}
 */
export const CREATE_MEDIA_TABLE = `
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'video',
    folder TEXT,
    duration REAL,
    width INTEGER,
    height INTEGER,
    codec TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    transcoded_path TEXT,
    size INTEGER,
    likes INTEGER NOT NULL DEFAULT 0,
    infusion INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0,
    title_edited INTEGER NOT NULL DEFAULT 0,
    hash TEXT,
    orientation INTEGER,
    camera TEXT,
    date_taken TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * SQL statement that creates the `jobs` table.
 *
 * Column notes:
 *  - `media_id`   Foreign key back to `media.id`.  ON DELETE CASCADE means
 *                  deleting a media row automatically cleans up its jobs.
 *  - `type`       Either "probe" or "transcode" (see JOB_TYPE enum).
 *  - `status`     Lifecycle state -- see JOB_STATUS enum.
 *  - `progress`   A 0-100 percentage.  Updated periodically during transcode;
 *                  left at 0 for probe jobs (they complete too quickly to
 *                  warrant progress tracking).
 *  - `error`      Human-readable failure reason, NULL when the job has not
 *                  failed.
 *
 * @type {string}
 */
export const CREATE_JOBS_TABLE = `
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    progress REAL DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )
`;

/**
 * SQL statement that creates the `scans` table.
 *
 * Tracks scan batches so the server can report progress and resume after
 * interruption.
 *
 * @type {string}
 */
export const CREATE_SCANS_TABLE = `
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dir_path TEXT NOT NULL,
    total INTEGER NOT NULL DEFAULT 0,
    processed INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'discovering',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * SQL statement that creates the `import_queue` table.
 *
 * Each row represents a single file discovered during a scan that needs to
 * be hashed, deduplicated, and inserted into the media table.
 *
 * @type {string}
 */
/**
 * SQL statement that creates the `folders` table.
 *
 * Maps folder paths to integer IDs for clean URLs.
 * Populated during media scan; the UNIQUE constraint on path prevents
 * duplicate records when the same directory is scanned more than once.
 *
 * @type {string}
 */
export const CREATE_FOLDERS_TABLE = `
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE
  )
`;

/**
 * SQL statement that creates the `player_stats` table.
 *
 * Singleton row (enforced by CHECK constraint) storing the player's
 * magic dust balance. Seeded with id=1 at startup via INSERT OR IGNORE.
 *
 * @type {string}
 */
export const CREATE_PLAYER_STATS_TABLE = `
  CREATE TABLE IF NOT EXISTS player_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    dust INTEGER NOT NULL DEFAULT 0
  )
`;

/**
 * SQL statement that creates the `inventory` table.
 *
 * Tracks the player's card collection. Cards can be media items
 * (card_type='media'), consumables like tickets (card_type='memory_ticket'),
 * or quest decks (card_type='quest_deck').
 * Media cards have a UNIQUE media_id; other card types use ref_id to
 * reference their backing record (e.g. quest_decks.id).
 * Cascade-deletes when the underlying media record is removed.
 *
 * @type {string}
 */
export const CREATE_INVENTORY_TABLE = `
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    media_id INTEGER UNIQUE,
    card_type TEXT NOT NULL DEFAULT 'media',
    ref_id INTEGER,
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )
`;

/**
 * SQL statement that creates the `quest_decks` table.
 *
 * Each row is one deck for a given day. 10 decks per day, 10 cards each.
 * `current_position` tracks how far the player has browsed (0 = not started).
 * `exhausted` flips to 1 once all cards have been viewed.
 *
 * @type {string}
 */
export const CREATE_QUEST_DECKS_TABLE = `
  CREATE TABLE IF NOT EXISTS quest_decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    deck_index INTEGER NOT NULL,
    current_position INTEGER NOT NULL DEFAULT 0,
    exhausted INTEGER NOT NULL DEFAULT 0,
    free_take_used INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, deck_index)
  )
`;

/**
 * SQL statement that creates the `quest_cards` table.
 *
 * Each row is one card in a quest deck, linking to a media record.
 * Position is 0-based within the deck.
 *
 * @type {string}
 */
export const CREATE_QUEST_CARDS_TABLE = `
  CREATE TABLE IF NOT EXISTS quest_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    FOREIGN KEY (deck_id) REFERENCES quest_decks(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )
`;

/**
 * SQL statement that creates the `memory_tickets` table.
 *
 * Tracks purchased memory game tickets. Each ticket can be used once.
 *
 * @type {string}
 */
/**
 * SQL statement that creates the `decks` table.
 *
 * Named groups of inventory cards (like playlists).
 *
 * @type {string}
 */
export const CREATE_DECKS_TABLE = `
  CREATE TABLE IF NOT EXISTS decks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT 'New Deck',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * SQL statement that creates the `deck_cards` join table.
 *
 * Many-to-many: a card can belong to multiple decks.
 *
 * @type {string}
 */
export const CREATE_DECK_CARDS_TABLE = `
  CREATE TABLE IF NOT EXISTS deck_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deck_id INTEGER NOT NULL,
    inventory_id INTEGER NOT NULL,
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
    FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
    UNIQUE(deck_id, inventory_id)
  )
`;

/** @deprecated Memory tickets are now stored as inventory items with card_type='memory_ticket'. */
export const CREATE_MEMORY_TICKETS_TABLE = `
  CREATE TABLE IF NOT EXISTS memory_tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/**
 * A memory-game instance. Created server-side at ticket purchase so the
 * 8 image pairs are pre-sampled — the ticket is the game, not a ticket
 * that later forms a game. Each inventory row with card_type='memory_ticket'
 * has its `ref_id` pointing to this table.
 */
export const CREATE_MEMORY_GAMES_TABLE = `
  CREATE TABLE IF NOT EXISTS memory_games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`;

/** 8 rows per game — one media id per pair. */
export const CREATE_MEMORY_GAME_CARDS_TABLE = `
  CREATE TABLE IF NOT EXISTS memory_game_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    FOREIGN KEY (game_id) REFERENCES memory_games(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
  )
`;

export const CREATE_IMPORT_QUEUE_TABLE = `
  CREATE TABLE IF NOT EXISTS import_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id INTEGER NOT NULL,
    path TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE
  )
`;
