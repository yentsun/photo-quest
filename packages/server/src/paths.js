/**
 * @file Filesystem locations owned by the server package.
 *
 * These directories are shared by several modules (boot-time cleanup, the
 * thumbnail endpoint, media removal, and storage stats), so they live here
 * instead of being rebuilt with `path.join(__dirname, ...)` in each caller.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Directory holding generated thumbnail JPEGs (`<media id>.jpg`, or
 * `<media id>_<time>.jpg` for a custom frame).
 *
 * @type {string}
 */
export const THUMBS_DIR = path.join(__dirname, '..', 'thumbs');
