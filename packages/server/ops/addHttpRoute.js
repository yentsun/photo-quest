/**
 * @file Register an HTTP route with the dispatcher.
 *
 * Kojo op: accessed as `kojo.ops.addHttpRoute(config, handler)`.
 *
 * Pushes a route entry onto the shared route table stored in kojo state.
 * The HTTP dispatcher (`endpoints/http.js`) reads this table when matching
 * incoming requests via URLPattern.
 *
 * @param {Object} config - Route configuration.
 * @param {string} config.method - HTTP method (GET, POST, DELETE, etc.).
 * @param {string} config.pathname - URL pattern string (e.g. '/media/:id').
 * @param {string[]} [config.access] - Access control descriptors (future use).
 * @param {Object} [config.schema] - Request validation schema (future use).
 * @param {function} handler - Async handler `(req, res, params) => {}`.
 */

export default function (config, handler) {
  const [kojo] = this;

  /* Lazy-initialise the routes array on first call. */
  let routes = kojo.get('routes');
  if (!routes) {
    routes = [];
    kojo.set('routes', routes);
  }

  /* Compile the pathname into a URLPattern for fast matching. */
  const pattern = new URLPattern({ pathname: config.pathname });

  routes.push({
    pattern,
    method: config.method.toUpperCase(),
    handler,
    access: config.access || null,
    schema: config.schema || null,
  });
}
