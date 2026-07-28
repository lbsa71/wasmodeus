/**
 * Builds a compact one-pixel-per-tile overview for the compatibility renderer.
 * @param {Uint8Array} roadTiles
 * @param {number} gridSize
 * @returns {Uint8ClampedArray}
 */
export function createRoadOverviewPixels(roadTiles, gridSize) {
  const tileCount = gridSize * gridSize;
  const pixels = new Uint8ClampedArray(tileCount * 4);

  for (let tile = 0; tile < tileCount; tile += 1) {
    const tileData = roadTiles[tile] ?? 0;
    const mask = tileData & 15;
    const buildable = (tileData & 16) !== 0;
    const pixel = tile * 4;
    if (!buildable) {
      pixels[pixel] = 4;
      pixels[pixel + 1] = 17;
      pixels[pixel + 2] = 15;
    } else if (mask === 0) {
      pixels[pixel] = 11;
      pixels[pixel + 1] = 31;
      pixels[pixel + 2] = 25;
    } else {
      const degree =
        Number((mask & 1) !== 0) +
        Number((mask & 2) !== 0) +
        Number((mask & 4) !== 0) +
        Number((mask & 8) !== 0);
      pixels[pixel] = 38 + degree * 8;
      pixels[pixel + 1] = 61 + degree * 9;
      pixels[pixel + 2] = 51 + degree * 8;
    }
    pixels[pixel + 3] = 255;
  }
  return pixels;
}
