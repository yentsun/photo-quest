/**
 * @file Kojo op: increment the in-memory version counter for a table and
 * broadcast a `{table, version}` SSE event. Callers name the logical
 * table affected by their write (e.g. 'inventory', 'decks').
 *
 * Accessed as `kojo.ops.bumpVersion(table)`.
 */

import { bumpTableVersion } from '../src/changes.js';

export default function (table) {
  return bumpTableVersion(table);
}
