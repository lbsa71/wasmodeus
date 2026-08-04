export const TILE_LENGTH_METERS = 50;
export const SIM_MINUTES_PER_REAL_SECOND = 1;
export const MIN_DESIRED_SPEED_TILES_PER_SECOND = 6;
export const MAX_DESIRED_SPEED_TILES_PER_SECOND = 12;
export const MAX_COMMUTE_TILES = 240;
export const MAX_EARLY_ARRIVAL_MINUTES = 45;

/**
 * Convert the accelerated renderer's tile speed into simulated km/h.
 *
 * @param {number} tilesPerRealSecond
 * @returns {number}
 */
export function speedKilometersPerHour(tilesPerRealSecond) {
  const simulatedSecondsPerRealSecond =
    SIM_MINUTES_PER_REAL_SECOND * 60;
  return (
    (tilesPerRealSecond * TILE_LENGTH_METERS * 3.6) /
    simulatedSecondsPerRealSecond
  );
}

/**
 * Estimate free-flow simulated travel time.
 *
 * @param {number} distanceTiles
 * @param {number} speedTilesPerRealSecond
 * @returns {number}
 */
export function commuteMinutes(distanceTiles, speedTilesPerRealSecond) {
  return (
    (distanceTiles / speedTilesPerRealSecond) *
    SIM_MINUTES_PER_REAL_SECOND
  );
}
