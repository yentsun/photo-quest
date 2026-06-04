export default async (kojo) => {
  kojo.ops.addHttpRoute({
    method: 'POST',
    pathname: '/media/:id/transcode',
  }, (req, res, params) => {
    kojo.ops.transcodeNow(params.id);
    res.writeHead(204);
    res.end();
  });
};
