/**
 * @file Supported file extensions for media scanning.
 *
 * Extensions are lower-case with leading dot.
 */

/**
 * Video file extensions supported by the scanner.
 * These require ffprobe for metadata and may need transcoding.
 *
 * @type {string[]}
 */
export const VIDEO_EXTENSIONS = [
  '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.m4v', '.mpg', '.mpeg', '.3gp', '.ts'
];

/**
 * Image file extensions supported by the scanner.
 * These are served directly without processing.
 *
 * @type {string[]}
 */
export const IMAGE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.jfif'
];

/**
 * All file extensions that the directory scanner considers to be media files.
 * Anything not on this list is silently skipped during a scan.
 *
 * @type {string[]}
 */
export const SUPPORTED_EXTENSIONS = [...VIDEO_EXTENSIONS, ...IMAGE_EXTENSIONS];
