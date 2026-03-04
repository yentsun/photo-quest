/**
 * @file SQLite table definitions shared between the server and the worker.
 *
 * Both the server and the worker call `database.exec(CREATE_MEDIA_TABLE)` and
 * `database.exec(CREATE_JOBS_TABLE)` at startup so that whichever process
 * starts first will create the tables, and subsequent starts are no-ops
 * thanks to `CREATE TABLE IF NOT EXISTS`.
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
 *  - `duration`        Length in seconds, populated after the ffprobe step.
 *  - `width` / `height` Video resolution in pixels, populated after probe.
 *  - `codec`           Video codec name (e.g. "h264", "vp9"), from ffprobe.
 *  - `status`          Current pipeline state -- see MEDIA_STATUS enum.
 *  - `transcoded_path` Absolute path to the transcoded MP4, or NULL if the
 *                      original is already in the target format.
 *  - `size`            File size in bytes.
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
    duration REAL,
    width INTEGER,
    height INTEGER,
    codec TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    transcoded_path TEXT,
    size INTEGER,
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
