import { ROOT_EDGE_PARSECS } from "./octree.js";

/** @param {number[]} positionParsecs @param {number} halfHeightParsecs @param {number} aspect @param {number} cellsPerAxis */
export function visibleSectorRange(positionParsecs, halfHeightParsecs, aspect, cellsPerAxis) {
  const edge = ROOT_EDGE_PARSECS / cellsPerAxis;
  const halfRoot = ROOT_EDGE_PARSECS / 2;
  const lower = (/** @type {number} */ coordinate, /** @type {number} */ halfSpan) => Math.max(0, Math.floor((coordinate - halfSpan + halfRoot) / edge));
  const upper = (/** @type {number} */ coordinate, /** @type {number} */ halfSpan) => Math.min(cellsPerAxis - 1, Math.ceil((coordinate + halfSpan + halfRoot) / edge) - 1);
  return {
    minX: lower(positionParsecs[0], halfHeightParsecs * aspect),
    maxX: upper(positionParsecs[0], halfHeightParsecs * aspect),
    minY: lower(positionParsecs[1], halfHeightParsecs),
    maxY: upper(positionParsecs[1], halfHeightParsecs),
    z: Math.max(0, Math.min(cellsPerAxis - 1, Math.floor((positionParsecs[2] + halfRoot) / edge))),
  };
}
