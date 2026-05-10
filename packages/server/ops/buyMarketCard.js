/**
 * @file Buy a single media card from the market.
 *
 * The "exposed via quest/memory" rule lives on the client (SEEN_MEDIA
 * IDB store gates what shows up in the market UI). Server only checks
 * the things that change during the request's flight: media exists,
 * not already owned, dust is sufficient. Memory game start deletes the
 * memory_game_cards rows server-side, so a server-side exposure check
 * would reject every memory card after the game starts.
 *
 * Cost: cardCost(infusion) — same as a quest take.
 *
 * Kojo op: accessed as `kojo.ops.buyMarketCard(mediaId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} mediaId
 * @returns {{ error?: string, item?: object, dust?: number } | null}
 */

import { cardCost } from '@photo-quest/shared';

export default function (mediaId) {
  const [kojo] = this;
  const db = kojo.get('db');
  const id = Number(mediaId);
  if (!Number.isFinite(id) || id <= 0) return { error: 'Invalid mediaId' };

  const row = db.prepare(
    `SELECT m.infusion, m.hidden,
            EXISTS (SELECT 1 FROM inventory WHERE media_id = m.id) AS owned
     FROM media m WHERE m.id = ?`
  ).get(id);
  if (!row) return null;
  if (row.hidden) return { error: 'Media not available' };
  if (row.owned)  return { error: 'Already in inventory' };

  const cost = cardCost(row.infusion);
  const dustResult = kojo.ops.updateDust(-cost);
  if (!dustResult) return { error: 'Insufficient magic dust' };

  const added = kojo.ops.addToInventory(id);
  if (!added?.item) {
    /* Refund — addToInventory shouldn't fail post-validation, but be safe. */
    kojo.ops.updateDust(cost);
    return { error: 'Inventory write failed' };
  }

  return { item: added.item, dust: dustResult.dust };
}
