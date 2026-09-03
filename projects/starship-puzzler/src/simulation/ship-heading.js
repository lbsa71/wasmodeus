/**
 * @param {{x: number, y: number}} current
 * @param {{x: number, y: number}|null} previous
 * @param {number} fallback
 */
export function headingFromDelta(current, previous, fallback) {
  if (!previous) return fallback;
  const deltaX = current.x - previous.x;
  const deltaY = current.y - previous.y;
  return deltaX * deltaX + deltaY * deltaY > 1e-8 ? Math.atan2(deltaY, deltaX) : fallback;
}
