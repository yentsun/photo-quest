/**
 * @file FFmpeg transcoding wrapper -- converts media files to web-friendly MP4.
 *
 * This module spawns `ffmpeg` as a child process to re-encode a video file
 * into H.264 video + AAC audio inside an MP4 container.  This combination
 * is the most widely supported format across browsers and devices.
 *
 * Output files are written to a configurable directory (TRANSCODED_DIR) with
 * filenames based on the media's database ID (e.g. `42.mp4`), which avoids
 * filename collisions and makes cleanup straightforward.
 *
 * FFmpeg encoding settings:
 *  - `-c:v libx264`      -- H.264 video codec (universal browser support).
 *  - `-preset medium`    -- Balances encoding speed vs. compression ratio.
 *                           "medium" is the default; "fast" or "slow" can be
 *                           used to trade off speed for file size.
 *  - `-crf 23`           -- Constant Rate Factor controls quality.  Lower =
 *                           better quality / bigger file.  23 is FFmpeg's
 *                           default and produces visually transparent output
 *                           for most content.
 *  - `-c:a aac -b:a 128k` -- AAC audio at 128 kbps (good quality for speech
 *                           and music).
 *  - `-movflags +faststart` -- Moves the MP4 moov atom to the beginning of
 *                           the file so the browser can start playback before
 *                           the entire file is downloaded (essential for
 *                           streaming).
 *  - `-progress pipe:1`  -- Write machine-readable progress to stdout so we
 *                           can parse it and report completion percentage.
 *  - `-y`                -- Overwrite the output file without prompting
 *                           (important for re-transcodes).
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';

const FFMPEG_BIN = process.env.FFMPEG_BIN || ffmpegStatic;
console.log('[transcode] ffmpeg binary:', FFMPEG_BIN);

/**
 * Directory where transcoded MP4 files are stored.
 * Defaults to a `transcoded/` folder in the worker's current working
 * directory, but can be overridden via the TRANSCODED_DIR env var.
 *
 * @type {string}
 */
export function transcode(filePath, mediaId, onProgress) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  /* If the source is already .mp4 (wrong codec), avoid clobbering it. */
  const suffix = filePath.toLowerCase().endsWith('.mp4') ? '_h264' : '';
  const outputPath = path.join(dir, `${base}${suffix}.mp4`);

  return new Promise((resolve, reject) => {
    const args = [
      '-i', filePath,             // Input file
      '-c:v', 'libx264',         // Video codec: H.264
      '-preset', 'medium',       // Encoding speed / compression trade-off
      '-crf', '23',              // Quality level (lower = better, 23 = default)
      '-c:a', 'aac',             // Audio codec: AAC
      '-b:a', '128k',            // Audio bitrate
      '-movflags', '+faststart', // Enable progressive download / streaming
      '-progress', 'pipe:1',     // Write progress info to stdout
      '-y',                      // Overwrite output without asking
      outputPath
    ];

    const proc = spawn(FFMPEG_BIN, args);

    /**
     * Parse progress output from ffmpeg's `-progress pipe:1` mode.
     *
     * The output contains key=value pairs, one per line.  We look for
     * `out_time_ms` which gives the current output position in microseconds.
     * Dividing by 1,000,000 converts to seconds, which the caller can
     * compare against the media's total duration to compute a percentage.
     */
    proc.stdout.on('data', chunk => {
      const text = chunk.toString();
      const match = text.match(/out_time_ms=(\d+)/);
      if (match && onProgress) {
        /* Convert microseconds to seconds for the progress callback. */
        onProgress(parseInt(match[1]) / 1000000);
      }
    });

    const stderrChunks = [];
    proc.stderr.on('data', chunk => stderrChunks.push(chunk));

    proc.on('close', code => {
      if (code !== 0) {
        const errOutput = Buffer.concat(stderrChunks).toString().trim().split('\n').slice(-3).join(' | ');
        console.error(`[transcode] ffmpeg stderr: ${errOutput}`);
        return reject(new Error(`ffmpeg exited with code ${code}: ${errOutput}`));
      }
      resolve(outputPath);
    });

    /** Handle spawn errors (ffmpeg not installed, not on PATH, etc.). */
    proc.on('error', err => {
      reject(new Error(`Failed to spawn ffmpeg: ${err.message}`));
    });
  });
}
