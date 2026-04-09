/**
 * @file Optimistic mutation API for the local IndexedDB replica.
 *
 * Every mutation triggered by a page (sell card, take quest card, etc.)
 * should go through this module rather than calling `utils/api.js` directly.
 *
 * Pattern: each action runs a Dexie `rw` transaction that updates all
 * affected tables atomically (e.g. `inventory` + `player_stats` + `media`),
 * then enqueues a row in `mutation_queue` for the sync engine to push to the
 * server. UI updates instantly via `useLiveQuery`; the server is reconciled
 * in the background.
 *
 * Phase 0 stub — actions land in Phase 2 (inventory), Phase 3 (quest),
 * Phase 4 (memory game).
 */

// Phase 2 — inventory:
//   sellInventory(invId)
//   destroyInventory(invId)
//   addToInventory(mediaId, infuseBonus)
//   createDeck(name)
//   renameDeck(deckId, name)
//   deleteDeck(deckId)
//   addToDeck(deckId, invIds)        // enforces LAW 4.18 via compound unique
//   removeFromDeck(deckId, invId)
//   consumeMemoryTicket(invId)

// Phase 3 — quest (re-exported from ./actions/quest.js):
//   advanceLocal(deckId)
//   takeLocal(deckId)
//   destroyLocal(deckId)
//   freeInfuseLocal(mediaId, amount)
