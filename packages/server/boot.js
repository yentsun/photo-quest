/**
 * @file Server bootstrap -- initialises all services and returns a ready
 * kojo instance.
 *
 * Boot sequence:
 *  1. Create the kojo instance with custom directory names.
 *  2. Initialise the SQLite database (sql.js WASM) and store it in state.
 *  3. Store config values (port, routes table).
 *  4. Call kojo.ready() to auto-discover ops/ and endpoints/.
 *     Endpoints register their routes via the addHttpRoute op.
 *  5. Start the HTTP server via kojo.ops.http().
 *  6. Return the kojo instance for external use.
 */

import Kojo from 'kojo';
import { initDb } from './src/db.js';

export default async function boot() {

  const PORT = process.env.PORT || 4000;

  /* Kojo -- event-driven microservice framework.
   * `functionsDir: 'ops'`  → business logic lives in ops/
   * `subsDir: 'endpoints'` → route handlers live in endpoints/ */
  const kojo = new Kojo({
    name: 'photo-quest',
    functionsDir: 'ops',
    subsDir: 'endpoints',
    logLevel: 'debug',
  });

  /* HTTP route table -- endpoints push into this via addHttpRoute op. */
  kojo.set('routes', []);

  /* Config values that ops and endpoints need. */
  kojo.set('port', PORT);

  /* SQLite database (sql.js WASM, no native compilation needed).
   * Stored in kojo state so all ops can access it via kojo.get('db'). */
  console.debug('[boot] Initialising database...');
  const db = await initDb();
  kojo.set('db', db);

  /* Auto-discover ops/ and endpoints/. During this phase every
   * endpoint file calls kojo.ops.addHttpRoute() to register its route. */
  console.debug('[boot] Loading ops and endpoints...');
  await kojo.ready();

  /* Unpack ops for direct access. */
  const { requestMiddleware } = kojo.ops;

  /* All routes are now registered -- start the HTTP server. */
  const routes = kojo.get('routes') || [];
  console.debug(`[boot] ${routes.length} routes registered`);
  requestMiddleware();

  return kojo;
}

/* Self-invoke when run directly (e.g. `node boot.js`). */
boot();
