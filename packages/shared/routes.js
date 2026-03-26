/**
 * @file Canonical route definitions for both the React client and the HTTP API.
 *
 * Having a single source of truth for every route path eliminates a whole
 * class of 404-style bugs caused by a typo in one place but not another.
 * Both the front-end (React Router) and the back-end (custom Node router)
 * import from this file.
 */

// ---------------------------------------------------------------------------
// Client-side routes (React Router)
// ---------------------------------------------------------------------------

/**
 * Route paths used by React Router in the web package.
 *
 * `root` is the top-level layout route.  Visiting "/" automatically redirects
 * to `dashboard` via a `<Navigate>` component.
 *
 * @readonly
 * @type {{ root: string, login: string, dashboard: string }}
 */
export const clientRoutes = {
  /** The root layout route that wraps all other pages. */
  root: '/',

  /** Authentication page (reserved for future use). */
  login: '/login',

  /** Main media library dashboard -- the default landing page. */
  dashboard: '/dashboard',

  /** Liked media section -- shows items with likes > 0. */
  liked: '/liked',

  /** Folder view -- shows media filtered by folder ID. */
  folder: '/folder/:id',

  /** Single media item view. */
  media: '/media/:id',

  /** Memory card game. */
  memoryGame: '/memory'
};

// ---------------------------------------------------------------------------
// Server-side API routes
// ---------------------------------------------------------------------------

/**
 * HTTP API endpoint paths consumed by both the server router and (eventually)
 * the web client's fetch calls.
 *
 * Paths that contain `:id` are parameterised -- the server's `matchRoute`
 * helper extracts the value at runtime.
 *
 * @readonly
 * @type {{
 *   media: string,
 *   mediaById: string,
 *   mediaScan: string,
 *   stream: string,
 *   jobs: string,
 *   jobEvents: string
 * }}
 */
export const apiRoutes = {
  /** GET  -- list all media items. */
  media: '/media',

  /** GET / DELETE -- fetch or remove a single media item by its numeric ID. */
  mediaById: '/media/:id',

  /** PATCH -- increment the like count for a media item. */
  mediaLike: '/media/:id/like',

  /** POST -- trigger a directory scan.  Body: { path: "/absolute/dir" }. */
  mediaScan: '/media/scan',

  /** POST -- add media items from client-side folder scan. */
  mediaAdd: '/media/add',

  /** POST -- find folder by name in server's configured media paths. */
  mediaFindFolder: '/media/find-folder',

  /** GET  -- list all folders with IDs. */
  folders: '/folders',

  /** DELETE -- remove a folder from library (hides records, preserves likes). */
  mediaFolder: '/media/folder/:id',

  /** GET  -- stream the video file for a given media ID (supports HTTP range
   *  requests for seeking). */
  stream: '/stream/:id',

  /** GET  -- serve an image file for a given media ID. */
  image: '/image/:id',

  /** GET  -- list all jobs (probe + transcode). */
  jobs: '/jobs',

  /** GET  -- Server-Sent Events (SSE) endpoint.  The server pushes real-time
   *  job progress updates to connected clients over this long-lived
   *  connection. */
  jobEvents: '/jobs/events',

  /** GET  -- Server network info for connecting from other devices. */
  network: '/network'
};
