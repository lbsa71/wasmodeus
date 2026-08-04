export const MINIMUM_PEAK_DEMAND = 2;

/**
 * Estimate congestion relief delivered per newly constructed tile.
 *
 * @param {{peakDemand: number, pressure: number, newTiles: number}} candidate
 * @returns {number}
 */
export function constructionValue({ peakDemand, pressure, newTiles }) {
  if (
    peakDemand < MINIMUM_PEAK_DEMAND ||
    pressure <= 0 ||
    newTiles <= 0
  ) {
    return 0;
  }
  return (peakDemand * pressure) / newTiles;
}

/**
 * @template {{tile: number, peakDemand: number, pressure: number, newTiles: number}} T
 * @param {T[]} candidates
 * @param {number} remainingBudget
 * @returns {T|undefined}
 */
export function selectFrugalUpgrade(candidates, remainingBudget) {
  let best;
  let bestValue = 0;
  for (const candidate of candidates) {
    if (candidate.newTiles > remainingBudget) continue;
    const value = constructionValue(candidate);
    if (
      value > bestValue ||
      (value === bestValue &&
        best &&
        (candidate.newTiles < best.newTiles ||
          (candidate.newTiles === best.newTiles &&
            candidate.tile < best.tile)))
    ) {
      best = candidate;
      bestValue = value;
    }
  }
  return best;
}
