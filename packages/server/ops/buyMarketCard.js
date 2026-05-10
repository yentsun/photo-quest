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
 * Cost: max(2, infusion * 2) — same as a quest take.
 *
 * Kojo op: accessed as `kojo.ops.buyMarketCard(mediaId)`.
 * Must use `function()` syntax (not arrow) to receive kojo context via `this`.
 *
 * @param {number} mediaId
 * @returns {{ error?: string, item?: object, dust?: number } | null}
 */

export default function (mediaId) {
  const [kojo] = this;
  const db = kojo.get('db');
  const id = Number(mediaId);
  if (!Number.isFinite(id) || id <= 0) return { error: 'Invalid mediaId' };

  const media = db.prepare(
    'SELECT id, infusion, hidden FROM media WHERE id = ?'
  ).get(id);
  if (!media) return null;
  if (media.hidden) return { error: 'Media not available' };

  const owned = db.prepare(
    'SELECT 1 FROM inventory WHERE media_id = ?'
  ).get(id);
  if (owned) return { error: 'Already in inventory' };

  const cost = Math.max(2, (media.infusion || 0) * 2);
  const dustResult = kojo.ops.updateDust(-cost);
  if (!dustResult) return { error: 'Insufficient magic dust' };

  const added = kojo.ops.addToInventory(id);
  if (!added?.item) {
    /* Refund — addToInventory shouldn't fail post-validation, but be safe. */
    kojo.ops.updateDust(cost);
    return null;
  }

  return { item: added.item, dust: dustResult.dust };
}
