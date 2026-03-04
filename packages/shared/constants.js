/**
 * @file Application-wide constants shared across every package in the monorepo.
 *
 * These values are imported by the web client, the HTTP server, and the
 * background worker.  Changing a value here propagates everywhere at once,
 * which is the whole reason they live in the shared package rather than being
 * duplicated in each project.
 */

// ---------------------------------------------------------------------------
// Flux / useReducer action types
// ---------------------------------------------------------------------------

/**
 * Action type identifiers dispatched through the global React context reducer.
 * Using a constant map (rather than bare strings) catches typos at import time
 * and makes it easy to search the codebase for every place a given action is
 * dispatched or handled.
 *
 * @readonly
 * @enum {string}
 */
export const actions = {
  /** Fired once after the app successfully fetches user settings on startup. */
  SETTINGS_LOADED: 'SETTINGS_LOADED',

  /** Fired whenever a single setting value is changed by the user. */
  SETTING_UPDATED: 'SETTING_UPDATED',

  /** Fired when the user manually dismisses a toaster notification, or when
   *  the auto-dismiss timeout expires. */
  ERROR_DISMISSED: 'ERROR_DISMISSED'
};

// ---------------------------------------------------------------------------
// Miscellaneous string tokens
// ---------------------------------------------------------------------------

/**
 * Re-usable dictionary of well-known string tokens.
 * `words.token` is the localStorage key under which the auth JWT is stored.
 * Centralising the key name avoids silent bugs where one file uses "token"
 * and another uses "accessToken".
 *
 * @readonly
 */
export const words = {
  token: 'token'
};

// ---------------------------------------------------------------------------
// UI timing
// ---------------------------------------------------------------------------

/**
 * How long (in milliseconds) a toaster notification stays visible before it
 * auto-dismisses.  5 000 ms is long enough to read a short message but short
 * enough not to be annoying.
 *
 * @type {number}
 */
export const toasterTimeout = 5000;

// ---------------------------------------------------------------------------
// Job type enum
// ---------------------------------------------------------------------------

/**
 * The two kinds of background jobs the worker can process.
 * - PROBE  -- uses ffprobe to extract metadata (duration, resolution, codec).
 * - TRANSCODE -- converts the file to a web-friendly H.264/AAC MP4.
 *
 * These values are stored in the `jobs.type` column in SQLite, so they must
 * remain stable across releases (or a migration is needed).
 *
 * @readonly
 * @enum {string}
 */
export const JOB_TYPE = {
  PROBE: 'probe',
  TRANSCODE: 'transcode'
};

// ---------------------------------------------------------------------------
// Job status enum
// ---------------------------------------------------------------------------

/**
 * Lifecycle states for a single job record.
 *
 * Transition diagram:
 *   PENDING  -->  RUNNING  -->  COMPLETED
 *                    |
 *                    +-------->  FAILED
 *
 * @readonly
 * @enum {string}
 */
export const JOB_STATUS = {
  /** Job has been inserted but not yet picked up by the worker. */
  PENDING: 'pending',

  /** The worker has claimed this job and is actively processing it. */
  RUNNING: 'running',

  /** Job finished successfully. */
  COMPLETED: 'completed',

  /** Job encountered an unrecoverable error. The `error` column stores the
   *  reason string. */
  FAILED: 'failed'
};

// ---------------------------------------------------------------------------
// Media status enum
// ---------------------------------------------------------------------------

/**
 * Lifecycle states for a media record.  These reflect the overall progress of
 * the media item through the ingest pipeline (scan -> probe -> transcode).
 *
 * Typical happy path:
 *   PENDING  -->  PROBING  -->  PROBED  -->  TRANSCODING  -->  READY
 *
 * If the file is already H.264/MP4 the TRANSCODING step is skipped and the
 * media goes straight from PROBED to READY.
 *
 * Any step can transition to ERROR on failure.
 *
 * @readonly
 * @enum {string}
 */
export const MEDIA_STATUS = {
  /** Freshly scanned; no work has been done yet. */
  PENDING: 'pending',

  /** An ffprobe job is currently running for this media. */
  PROBING: 'probing',

  /** Probe completed -- metadata is populated but transcoding may still be
   *  needed. */
  PROBED: 'probed',

  /** An ffmpeg transcode job is currently running for this media. */
  TRANSCODING: 'transcoding',

  /** The media is fully processed and ready for streaming. */
  READY: 'ready',

  /** Something went wrong during probing or transcoding. */
  ERROR: 'error'
};

// ---------------------------------------------------------------------------
// Supported file extensions
// ---------------------------------------------------------------------------

/**
 * File extensions (lower-case, with leading dot) that the directory scanner
 * considers to be media files.  Anything not on this list is silently skipped
 * during a scan.
 *
 * The list covers the most common video container formats that ffmpeg can
 * demux.  Audio-only files are intentionally excluded because this app is
 * focused on video media.
 *
 * @type {string[]}
 */
export const SUPPORTED_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpg', '.mpeg', '.3gp', '.ts'
];
