import { planetIndexFromBodyPath } from "./system-view.js";

/**
 * Returns the frame origin for a focused body. Moon body paths deliberately
 * resolve to their parent planet: the planet/moon frame follows that barycentre.
 * @param {number} bodyPath
 * @param {number[]} starPositionParsecs
 * @param {number[][]} planetPositionsParsecs
 */
export function lockPositionForBody(bodyPath, starPositionParsecs, planetPositionsParsecs) {
  if (bodyPath === 0) return starPositionParsecs;
  return planetPositionsParsecs[planetIndexFromBodyPath(bodyPath)] ?? starPositionParsecs;
}
