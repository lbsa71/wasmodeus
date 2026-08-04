/** One sidereal circuit at the Sun's galactocentric radius (about 8 kpc). */
export const SOLAR_ORBIT_DAYS = 230_000_000 * 365.25;

/**
 * Rotates a dormant galactic tracer around the galactic centre.
 * The flat-curve approximation gives periods proportional to radius, while
 * retaining a position query that is independent of simulation step history.
 *
 * @param {number[]} positionParsecs
 * @param {number} elapsedDays
 * @returns {number[]}
 */
export function rotateGalacticPosition(positionParsecs, elapsedDays) {
  const [x, y, z] = positionParsecs;
  const radiusParsecs = Math.hypot(x, y);
  if (radiusParsecs < 1e-9) return [x, y, z];
  const periodDays = SOLAR_ORBIT_DAYS * (radiusParsecs / 8_000);
  const angle = (elapsedDays / periodDays) * Math.PI * 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return [(x * cosine) - (y * sine), (x * sine) + (y * cosine), z];
}
