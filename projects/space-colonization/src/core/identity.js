export const GALAXY_MODEL_VERSION = "mw-v1";

/** @param {bigint} seed */
export function galaxyId(seed) {
  return `${GALAXY_MODEL_VERSION}:${BigInt.asUintN(64, seed).toString(16).padStart(16, "0")}`;
}

/** @param {number} bodyPath */
export function bodyKind(bodyPath) {
  const planet = (bodyPath >>> 24) & 0xff;
  const moon = (bodyPath >>> 16) & 0xff;
  if (planet === 0) return "STAR";
  if (moon === 0) return `PLANET ${planet}`;
  return `MOON ${moon} OF PLANET ${planet}`;
}
