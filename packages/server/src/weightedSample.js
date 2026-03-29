/**
 * @file Weighted random sampling without replacement.
 *
 * Weight = infusion + 1 so 0-infusion items still appear.
 */

/**
 * @param {Array<{ id: number, infusion?: number }>} items
 * @param {number} count
 * @returns {Array}
 */
export function weightedSample(items, count) {
  const pool = items.map(m => ({ ...m, weight: (m.infusion || 0) + 1 }));
  const picked = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
    let r = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}
