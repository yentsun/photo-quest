/**
 * @file Pull/push engine for the local IndexedDB replica.
 *
 * Phase 0 stub — the public surface is defined so callers can wire it up
 * (e.g. `Router.jsx` calls `syncAll()` on mount), but no actual fetching
 * happens yet. Implementation lands in Phase 1.
 *
 * Pull strategy (planned):
 *  - Small tables (inventory, decks, deck_cards, quest_decks, quest_cards,
 *    player_stats) → full snapshot replace inside a Dexie transaction.
 *    Single-device assumption means anything missing from the server
 *    response is deleted locally — no tombstone log needed in v1.
 *  - Large table (media) → delta pull via `?since=<iso>` query param,
 *    upserted with `bulkPut`.
 *
 * Push strategy (planned): FIFO drain of `mutation_queue`. Server responses
 * are applied as mini-deltas; 4xx triggers a targeted re-pull to heal local
 * state; 5xx/network failures back off and retry.
 */

/**
 * Pull every table from the server. Called on app mount, focus, and after
 * relevant SSE events.
 *
 * Phase 0: no-op.
 */
export async function syncAll() {
  // TODO Phase 1: pull inventory, decks, deck_cards, quest_decks, quest_cards,
  // player_stats (full snapshot) and media (delta).
}

/**
 * Pull a single named table.
 *
 * @param {string} _table
 */
export async function syncTable(_table) {
  // TODO Phase 1.
}

/**
 * Delta-pull the media table using `?since=<iso>`.
 *
 * Phase 0: no-op.
 */
export async function syncMediaDelta() {
  // TODO Phase 3.
}

/**
 * Drain the mutation queue: serial FIFO push of pending mutations to the
 * server, with reconciliation of the response into the local store.
 *
 * Phase 0: no-op.
 */
export async function drainMutationQueue() {
  // TODO Phase 2.
}
