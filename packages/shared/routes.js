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

  /** (removed — replaced by inventory) */
  // liked: '/liked',

  /** Folder view -- shows media filtered by folder ID. */
  folder: '/folder/:id',

  /** Single media item view. */
  media: '/media/:id',

  /** Memory card game. */
  memoryGame: '/memory',

  /** Player inventory — owned media items. */
  inventory: '/inventory',

  /** Daily quest — browse card decks and collect media. */
  quest: '/quest',

  /** User-created deck — view cards in a deck. */
  deck: '/deck/:id',

  /** Market — buy decks and tickets. */
  market: '/market'
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

  /** PATCH -- infuse a media item with 1 magic dust. */
  mediaInfuse: '/media/:id/infuse',

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
  network: '/network',

  /** GET  -- Player stats (dust balance). */
  player: '/player',

  /** PATCH -- Add or spend magic dust.  Body: { delta: number }. */
  playerDust: '/player/dust',

  /** GET / POST -- List inventory or add an item.  Body (POST): { mediaId }. */
  inventory: '/inventory',

  /** DELETE -- Remove an item from the player's inventory by inventory ID. */
  inventoryById: '/inventory/:id',

  /** DELETE -- Destroy an inventory card (delete media from DB/disk, award dust). */
  inventoryDestroy: '/inventory/:id/destroy',

  /** GET  -- List today's quest decks. */
  questDecks: '/quest/decks',

  /** GET  -- Get a specific deck with current card.
   *  POST -- Advance to next card (subpath /next) or take card (subpath /take). */
  questDeckById: '/quest/decks/:id',

  /** POST -- Advance to the next card in a deck. */
  questDeckNext: '/quest/decks/:id/next',

  /** POST -- Spend dust to take the current card into inventory. */
  questDeckTake: '/quest/decks/:id/take',

  /** POST -- Buy an extra quest deck. */
  marketBuyDeck: '/market/buy-deck',

  /** POST -- Buy a memory game ticket. */
  marketBuyTicket: '/market/buy-ticket',

  /** GET -- Get unused memory ticket count. */
  marketTickets: '/market/tickets',

  /** POST -- Use a memory game ticket. */
  marketUseTicket: '/market/use-ticket',

  /** GET / POST -- List decks or create a new deck. */
  decks: '/decks',

  /** PATCH / DELETE -- Rename or delete a deck. */
  deckById: '/decks/:id',

  /** POST -- Add cards to a deck.  Body: { inventoryIds: [] }. */
  deckCards: '/decks/:id/cards',

  /** DELETE -- Remove a card from a deck. */
  deckCardById: '/decks/:id/cards/:inventoryId'
};
