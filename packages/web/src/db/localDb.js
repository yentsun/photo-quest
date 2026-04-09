/**
 * @file Dexie (IndexedDB) schema for the local-first PWA replica.
 *
 * The PWA mirrors the server's authoritative SQLite tables into IndexedDB so
 * that pages can read/write game state without a server round-trip. The
 * server (`packages/server`) remains the source of truth — `sync.js` keeps
 * the local replica in step.
 *
 * DB name `photo-quest-local` is intentionally distinct from
 * `photo-quest-fs` (used by `services/fileSystem.js` for File System Access
 * handles) so version chains never collide.
 *
 * Index notes:
 *  - `&` prefix marks a unique index.
 *  - `[a+b]` declares a compound index (used for unique constraints that
 *    mirror SQLite's `UNIQUE(a,b)`).
 *  - `inventory.media_id` is unique → mirrors server constraint and gives
 *    O(1) "is this card already owned?" lookups for quest skip logic.
 *  - `deck_cards.[deck_id+inventory_id]` is unique → mirrors
 *    `addToPile.js`'s `INSERT OR IGNORE` semantics so LAW 4.18's "+10
 *    infusion once per (card, deck)" rule can be enforced locally.
 *
 * Phase 0 only declares the schema; reads/writes against it land in later
 * phases.
 */

import Dexie from 'dexie';

export const db = new Dexie('photo-quest-local');

db.version(1).stores({
  /* Mirrors of server tables */
  media:          '&id, folder, type, infusion, hidden, updated_at, date_taken',
  inventory:      '&id, &media_id, card_type, ref_id, acquired_at',
  decks:          '&id, name, created_at',
  deck_cards:     '&id, deck_id, inventory_id, &[deck_id+inventory_id]',
  quest_decks:    '&id, date, deck_index, exhausted, &[date+deck_index]',
  quest_cards:    '&id, deck_id, media_id, [deck_id+position]',
  player_stats:   '&id', // singleton row id=1

  /* Sync plumbing */
  sync_state:     '&table',           // { table, lastPulledAt }
  mutation_queue: '++id, createdAt, status, type',
});
