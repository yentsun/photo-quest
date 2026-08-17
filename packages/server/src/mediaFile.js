/**
 * @file Media file detection.
 *
 * Extension matching alone is ambiguous for some suffixes. Notably `.ts` is
 * both a TypeScript source file and an MPEG-TS video, so those get an extra
 * content sniff: a TypeScript file is valid UTF-8 text, a transport stream is
 * binary.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_EXTENSIONS } from '@photo-quest/shared';

const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Whether a file's first 4KB looks like text (no NUL bytes, valid UTF-8).
 * Empty files are treated as text.
 */
function isTextFile(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    if (n === 0) return true;
    const slice = buf.subarray(0, n);
    if (slice.includes(0)) return false;
    try { decoder.decode(slice); return true; } catch { return false; }
  } catch {
    return false;
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
  }
}

/**
 * Decide whether a file should be treated as media.
 * Extension check, plus a content sniff for ambiguous extensions.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {boolean}
 */
export function isMediaFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext)) return false;
  if (ext === '.ts' && isTextFile(filePath)) return false;
  return true;
}
