/**
 * @file React hooks that read from the local IndexedDB replica via
 * `useLiveQuery` from `dexie-react-hooks`.
 *
 * Pages import these instead of calling `utils/api.js` directly. Live queries
 * automatically re-render the UI whenever the underlying Dexie tables change,
 * so the existing `RefreshContext` plumbing is no longer needed for game
 * state.
 *
 * Phase 0 stub — concrete hooks land alongside their owning pages:
 *   Phase 1: useInventory, useInventoryMedia, useDecks, useDeckCards,
 *            useQuestDecks, usePlayerStats
 *   Phase 3: useQuestDeck, useMedia
 */
