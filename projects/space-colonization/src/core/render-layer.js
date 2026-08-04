import { LEAF_EDGE_PARSECS } from "./octree.js";

/** Keep a focused system visible until several leaf sectors fit on screen. */
export const FOCUSED_SYSTEM_MAX_ZOOM_PARSECS = LEAF_EDGE_PARSECS * 4;

/** @param {number} zoomParsecs @param {boolean} focused */
export function renderLayerFor(zoomParsecs, focused) {
  if (focused && zoomParsecs <= FOCUSED_SYSTEM_MAX_ZOOM_PARSECS) return "STAR SYSTEM";
  if (zoomParsecs > 500) return "GALAXY OVERVIEW";
  if (zoomParsecs > 0.25) return "SECTOR GRID";
  return "STELLAR NEIGHBORHOOD";
}
