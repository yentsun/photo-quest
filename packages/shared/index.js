/**
 * @file Shared package barrel export.
 *
 * This is the public API surface for the @photo-quest/shared package.
 * It re-exports every constant, schema definition, and route map that the
 * rest of the monorepo (web, server, worker) depends on.
 *
 * By centralising these values in a single shared package we guarantee that
 * the client and every back-end service agree on things like job statuses,
 * media statuses, supported file extensions, route paths, and database
 * schemas -- eliminating an entire class of bugs caused by duplicated or
 * out-of-sync string literals.
 */

/* Action types, label dictionaries, toaster timing, and every enum-like
 * constant used across the app. */
export { actions, words, toasterTimeout, slideshowInterval, JOB_TYPE, JOB_STATUS, MEDIA_STATUS, MEDIA_TYPE, SUPPORTED_EXTENSIONS, VIDEO_EXTENSIONS, IMAGE_EXTENSIONS } from './constants.js';

/* SQL CREATE TABLE statements consumed by both the server and the worker so
 * that either process can safely initialise the database on its own. */
export { CREATE_MEDIA_TABLE, CREATE_JOBS_TABLE } from './schema.js';

/* Route maps for the React client (clientRoutes) and the Express-like HTTP
 * API (apiRoutes). Keeping them here lets the front-end and back-end reference
 * the same canonical paths without risk of typos. */
export { clientRoutes, apiRoutes } from './routes.js';
