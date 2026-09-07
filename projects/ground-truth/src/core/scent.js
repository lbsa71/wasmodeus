/**
 * The scent of gold.
 *
 * A lemming senses gold as a direction and a distance to the nearest nugget.
 * Finding that per lemming per frame would mean scanning every nugget, so it
 * is baked once at generation into a coarse grid: each coarse cell holds the
 * centre of the nugget nearest to it, and the shader takes the vector from the
 * lemming's true position to that centre. The grid only decides *which* nugget
 * is nearest, so its coarseness costs nothing but a little error right at the
 * boundary between two nuggets' territories.
 *
 * It is small enough to live in a uniform buffer — 64 KB is the limit, and
 * that is what sets the cell size for a given world.
 */

/** Two floats a cell, so this many cells is exactly the 64 KB uniform limit. */
export const MAX_SCENT_CELLS = 8192;
/** Bytes of the uniform, whatever the world size: the shader declares it fixed. */
export const SCENT_BYTES = MAX_SCENT_CELLS * 8;
/** Written where there is no gold at all. Far enough that nothing can smell it. */
export const NO_SCENT = -1e6;

/**
 * The smallest power-of-two cell that fits the world into the uniform.
 *
 * @param {{ width: number, height: number }} world
 * @returns {number}
 */
export function scentCellSize({ width, height }) {
  let size = 16;
  while (Math.ceil(width / size) * Math.ceil(height / size) > MAX_SCENT_CELLS) size *= 2;
  return size;
}

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ cellSize: number, cols: number, rows: number, data: Float32Array }} Scent
 *   `data` holds `cols * rows` pairs, the nearest nugget centre per coarse cell,
 *   row-major from the bottom-left.
 */

/**
 * @param {Point[]} nuggets
 * @param {{ width: number, height: number }} world
 * @param {number} [cellSize]
 * @returns {Scent}
 */
export function bakeScent(nuggets, world, cellSize = scentCellSize(world)) {
  const cols = Math.ceil(world.width / cellSize);
  const rows = Math.ceil(world.height / cellSize);
  if (cols * rows > MAX_SCENT_CELLS) {
    throw new Error(`A ${cols} x ${rows} scent grid does not fit the uniform.`);
  }
  const data = new Float32Array(cols * rows * 2);
  for (let row = 0; row < rows; row += 1) {
    const cy = (row + 0.5) * cellSize;
    for (let col = 0; col < cols; col += 1) {
      const cx = (col + 0.5) * cellSize;
      let best = NO_SCENT;
      let bestY = NO_SCENT;
      let nearest = Infinity;
      for (const nugget of nuggets) {
        const dx = nugget.x - cx;
        const dy = nugget.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearest) { nearest = d2; best = nugget.x; bestY = nugget.y; }
      }
      const index = (row * cols + col) * 2;
      data[index] = best;
      data[index + 1] = bestY;
    }
  }
  return { cellSize, cols, rows, data };
}

/**
 * The coarse cell a world position falls in, as the shader computes it.
 *
 * @param {Scent} scent
 * @param {number} x @param {number} y
 * @returns {Point} the nearest nugget centre
 */
export function scentAt(scent, x, y) {
  const col = Math.min(scent.cols - 1, Math.max(0, Math.floor(x / scent.cellSize)));
  const row = Math.min(scent.rows - 1, Math.max(0, Math.floor(y / scent.cellSize)));
  const index = (row * scent.cols + col) * 2;
  return { x: scent.data[index], y: scent.data[index + 1] };
}
