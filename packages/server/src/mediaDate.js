/**
 * @file Resolve a media file's capture date for chronological sorting.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import exifr from 'exifr';

const FFPROBE_PATH = ffprobeInstaller.path;

function toIsoFromParts(year, month, day, hour, minute, second) {
  const date = new Date(Date.UTC(year, Number(month) - 1, day, hour, minute, second));
  if (
    date.getUTCFullYear() !== Number(year)
    || date.getUTCMonth() !== Number(month) - 1
    || date.getUTCDate() !== Number(day)
    || date.getUTCHours() !== Number(hour)
    || date.getUTCMinutes() !== Number(minute)
    || date.getUTCSeconds() !== Number(second)
  ) return null;
  return date.toISOString();
}

function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value !== 'string') return null;

  const exifMatch = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/);
  if (exifMatch) {
    const [, year, month, day, hour, minute, second] = exifMatch;
    return toIsoFromParts(year, month, day, hour, minute, second);
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Extract a timestamp from names such as IMG_20260813_172310724_BURST000.jpg.
 *
 * @param {string} filename
 * @returns {string|null}
 */
export function parseFilenameDate(filename) {
  const match = filename.match(/(?:^|[^\d])((?:19|20)\d{2})(\d{2})(\d{2})[_ -]?(\d{2})(\d{2})(\d{2})(?:\d{3,6})?(?=$|[^\d])/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return toIsoFromParts(year, month, day, hour, minute, second);
}

async function readImageDate(filePath) {
  try {
    const metadata = await exifr.parse(filePath);
    return toIsoDate(metadata?.DateTimeOriginal)
      || toIsoDate(metadata?.CreateDate)
      || toIsoDate(metadata?.ModifyDate);
  } catch {
    return null;
  }
}

async function readVideoDate(filePath) {
  try {
    const output = await new Promise((resolve, reject) => {
      const proc = spawn(FFPROBE_PATH, [
        '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath,
      ]);
      const chunks = [];
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.on('close', code => {
        if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (err) {
          reject(err);
        }
      });
      proc.on('error', reject);
    });
    const tags = [
      output.format?.tags,
      ...output.streams.map(stream => stream.tags),
    ];
    for (const tag of tags) {
      const date = toIsoDate(tag?.creation_time) || toIsoDate(tag?.CREATION_TIME);
      if (date) return date;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Return the best available capture date, falling back to the file timestamp.
 *
 * @param {string} filePath
 * @param {'image'|'video'} mediaType
 * @param {Date} fallbackDate
 * @returns {Promise<string>}
 */
export async function getCaptureDate(filePath, mediaType, fallbackDate) {
  const metadataDate = mediaType === 'image'
    ? await readImageDate(filePath)
    : await readVideoDate(filePath);
  return metadataDate || parseFilenameDate(path.basename(filePath)) || fallbackDate.toISOString();
}
