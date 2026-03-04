/**
 * @file FFprobe wrapper -- extracts metadata from media files.
 *
 * This module spawns `ffprobe` (part of the FFmpeg suite) as a child process
 * to inspect a media file and extract key properties: duration, resolution,
 * video codec, audio codec, and file size.
 *
 * Why spawn a child process instead of using a Node.js binding?
 *  - No native add-on compilation required (simpler install, especially on
 *    Windows).
 *  - ffprobe is already installed on most systems that have ffmpeg.
 *  - The JSON output format (`-print_format json`) gives us structured data
 *    without writing a parser.
 */

import { spawn } from 'node:child_process';

/**
 * Run ffprobe on a media file and return a normalised metadata object.
 *
 * The function spawns `ffprobe` with the following flags:
 *  - `-v quiet`          -- suppress noisy log output.
 *  - `-print_format json` -- output structured JSON instead of key=value.
 *  - `-show_format`      -- include container-level info (duration, size).
 *  - `-show_streams`     -- include per-stream info (codec, resolution).
 *
 * @param {string} filePath - Absolute path to the media file to probe.
 * @returns {Promise<{
 *   duration: number,
 *   width: number,
 *   height: number,
 *   codec: string,
 *   audioCodec: string | null,
 *   size: number
 * }>} Normalised metadata extracted from the ffprobe output.
 * @throws {Error} If ffprobe exits with a non-zero code, fails to spawn,
 *   or produces unparseable output.
 */
export function ffprobe(filePath) {
  return new Promise((resolve, reject) => {
    /* Build the argument list for ffprobe. */
    const args = [
      '-v', 'quiet',            // Suppress log output
      '-print_format', 'json',  // Output as JSON for easy parsing
      '-show_format',           // Include container-level metadata
      '-show_streams',          // Include per-stream metadata (video, audio)
      filePath
    ];

    const proc = spawn('ffprobe', args);

    /* Collect stdout chunks -- ffprobe writes its JSON output here. */
    const chunks = [];
    proc.stdout.on('data', chunk => chunks.push(chunk));

    /**
     * Handle process exit.  A non-zero exit code indicates ffprobe could not
     * read the file (corrupt file, unsupported format, etc.).
     */
    proc.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`ffprobe exited with code ${code}`));
      }

      try {
        const output = JSON.parse(Buffer.concat(chunks).toString());

        /* Find the first video and audio streams.  A file may have multiple
         * video streams (e.g. an embedded thumbnail), but we only care about
         * the primary one.  Audio may be absent for silent videos. */
        const videoStream = output.streams?.find(s => s.codec_type === 'video');
        const audioStream = output.streams?.find(s => s.codec_type === 'audio');

        resolve({
          /** Duration in seconds (fractional). Falls back to 0 for images
           *  or files where duration is not applicable. */
          duration: parseFloat(output.format?.duration) || 0,

          /** Video width in pixels, or 0 if no video stream exists. */
          width: videoStream?.width || 0,

          /** Video height in pixels, or 0 if no video stream exists. */
          height: videoStream?.height || 0,

          /** Video codec short name (e.g. "h264", "vp9", "hevc").  Used by
           *  the pipeline to decide whether transcoding is necessary. */
          codec: videoStream?.codec_name || 'unknown',

          /** Audio codec short name (e.g. "aac", "opus"), or null if the
           *  file has no audio track. */
          audioCodec: audioStream?.codec_name || null,

          /** File size in bytes, from the container format metadata. */
          size: parseInt(output.format?.size) || 0
        });
      } catch (err) {
        reject(new Error(`Failed to parse ffprobe output: ${err.message}`));
      }
    });

    /**
     * Handle spawn errors -- e.g. ffprobe is not installed or not on PATH.
     * This is a common first-time setup issue, so the error message is
     * explicit about what went wrong.
     */
    proc.on('error', err => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });
  });
}
