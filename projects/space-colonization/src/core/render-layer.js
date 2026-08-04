/** @param {number} zoomParsecs @param {boolean} focused */
export function renderLayerFor(zoomParsecs, focused) {
  if (focused && zoomParsecs <= 0.001) return "STAR SYSTEM";
  if (zoomParsecs > 500) return "GALAXY OVERVIEW";
  if (zoomParsecs > 0.25) return "SECTOR GRID";
  return "STELLAR NEIGHBORHOOD";
}
