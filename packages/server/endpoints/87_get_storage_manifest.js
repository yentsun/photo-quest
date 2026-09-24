/**
 * @file GET /storage/manifest -- Download a manifest of every media record.
 *
 * The manifest lists the metadata needed to verify or rebuild a library
 * (path, title, type, size, likes, tags, hash, date taken, transcoded output),
 * which together with the database backup forms the backup story — the media
 * files themselves stay as the originals on disk.
 *
 * `?format=json` returns structured JSON; anything else (the default) returns
 * CSV.
 */

import { json } from '../src/http.js';
import { buildManifest } from '../src/storage.js';

/** `YYYY-MM-DD` for the download filename. */
function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/storage/manifest',
  }, (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const format = url.searchParams.get('format') === 'json' ? 'json' : 'csv';

    try {
      const { contentType, body, count } = buildManifest(kojo.get('db'), format);
      logger.debug(`[GET /storage/manifest] format=${format} items=${count}`);

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(body),
        'Content-Disposition': `attachment; filename="photo-quest-manifest-${dateStamp()}.${format}"`,
      });
      res.end(body);
    } catch (err) {
      logger.error(`[GET /storage/manifest] failed: ${err.message}`);
      json(res, 500, { error: 'Could not build the media manifest' });
    }
  });
};
