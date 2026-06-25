export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/:id/transcode',
  }, (req, res, params) => {
    logger.debug(`[POST /media/:id/transcode] id=${params.id}`);
    kojo.ops.transcodeNow(params.id);
    logger.debug(`[POST /media/:id/transcode] transcode triggered for id=${params.id}`);
    res.writeHead(204);
    res.end();
  });
};
