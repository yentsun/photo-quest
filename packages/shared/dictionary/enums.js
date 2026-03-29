/**
 * @file Enum-like string constants for job types, statuses, and media types.
 *
 * These values are stored in SQLite columns, so they must remain stable
 * across releases (or a migration is needed).
 */

/**
 * The two kinds of background jobs the worker can process.
 * - PROBE  -- uses ffprobe to extract metadata (duration, resolution, codec).
 * - TRANSCODE -- converts the file to a web-friendly H.264/AAC MP4.
 *
 * @readonly
 * @enum {string}
 */
export const JOB_TYPE = {
  PROBE: 'probe',
  TRANSCODE: 'transcode'
};

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

/**
 * Lifecycle states for a media record. These reflect the overall progress of
 * the media item through the ingest pipeline (scan -> probe -> transcode).
 *
 * Typical happy path:
 *   PENDING  -->  PROBING  -->  PROBED  -->  TRANSCODING  -->  READY
 *
 * If the file is already H.264/MP4 the TRANSCODING step is skipped and the
 * media goes straight from PROBED to READY.
 *
 * Images skip probe/transcode and go directly to READY.
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

/**
 * Distinguishes video files from image files.
 *
 * @readonly
 * @enum {string}
 */
export const MEDIA_TYPE = {
  VIDEO: 'video',
  IMAGE: 'image'
};

/**
 * Lifecycle states for a scan batch.
 *
 * Transition diagram:
 *   DISCOVERING  -->  IMPORTING  -->  COMPLETED
 *                        |
 *                        +-------->  FAILED
 *
 * @readonly
 * @enum {string}
 */
export const SCAN_STATUS = {
  /** File discovery is in progress. */
  DISCOVERING: 'discovering',

  /** Files have been discovered and are being imported one by one. */
  IMPORTING: 'importing',

  /** All files have been processed. */
  COMPLETED: 'completed',

  /** Scan was cancelled by the user. */
  CANCELLED: 'cancelled',

  /** Scan encountered an unrecoverable error. */
  FAILED: 'failed'
};

/**
 * Lifecycle states for an individual import queue item.
 *
 * @readonly
 * @enum {string}
 */
export const IMPORT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

/**
 * Magic dust awarded per star rating in the memory game.
 *
 * @readonly
 * @type {{ 3: number, 2: number, 1: number }}
 */
export const DUST_REWARDS = { 3: 50, 2: 30, 1: 10 };

/**
 * Magic dust cost to take a quest card into inventory.
 *
 * @readonly
 * @type {number}
 */
export const QUEST_CARD_COST = 10;
