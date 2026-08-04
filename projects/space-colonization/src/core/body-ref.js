/** @typedef {{ sectorPathHi: number, sectorPathLo: number, ordinal: number, bodyPath: number }} BodyRef */

/** @param {number} sectorPathHi @param {number} sectorPathLo @param {number} ordinal @returns {BodyRef} */
export function starBodyRef(sectorPathHi, sectorPathLo, ordinal) {
  return { sectorPathHi: sectorPathHi >>> 0, sectorPathLo: sectorPathLo >>> 0, ordinal: ordinal >>> 0, bodyPath: 0 };
}

/** @param {number} planetIndex */
export function planetBodyPath(planetIndex) {
  if (!Number.isInteger(planetIndex) || planetIndex < 1 || planetIndex > 255) throw new RangeError("Planet index must be 1..255.");
  return (planetIndex << 24) >>> 0;
}

/** @param {BodyRef} left @param {BodyRef} right */
export function bodyRefEquals(left, right) {
  return left.sectorPathHi === right.sectorPathHi && left.sectorPathLo === right.sectorPathLo && left.ordinal === right.ordinal && left.bodyPath === right.bodyPath;
}

/** @param {BodyRef} body */
export function formatBodyRef(body) {
  return [body.sectorPathHi, body.sectorPathLo, body.ordinal, body.bodyPath].map((part) => part.toString(16).padStart(8, "0")).join(":");
}
