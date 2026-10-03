import { transformPoint } from "../core/symmetry.js";
/** @typedef {import('../core/types.js').Point} Point */
/** @typedef {import('../core/types.js').Board} Board */
/** @typedef {import('../core/types.js').Transform} Transform */
/** @typedef {{minX: number, minY: number, columns: number, rows: number}} Viewport */

/** Convert a logical cell to its center in the board's SVG coordinate system.
 * @param {Viewport} view @param {Point} point @returns {Point} */
export function boardPoint(view, point) {
  return {
    x: (point.x - view.minX + 0.5) * 100 / view.columns,
    y: (view.minY + view.rows - point.y - 0.5) * 100 / view.rows,
  };
}

/** @param {Point[]} points @returns {Point} */
function centroid(points) {
  return {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
}

/** Center the original diagram over the live board, then map it to its exact recorded orientation.
 * The affine matrix includes the inverted screen y-axis and unequal viewport axis scales.
 * @param {Board} original @param {Board} target @param {Transform} transform @param {Viewport} view
 * @returns {{stones: Point[], resting: Point, matrix: [number, number, number, number, number, number]}} */
export function ghostGeometry(original, target, transform, view) {
  const sourceCenter = centroid(original.stones);
  const targetCenter = centroid(target.stones);
  const displayCenter = boardPoint(view, targetCenter);
  /** @param {Point} point */
  const centered = point => boardPoint(view, {
    x: point.x - sourceCenter.x + targetCenter.x,
    y: point.y - sourceCenter.y + targetCenter.y,
  });
  const orientation = { orientation: transform.orientation, dx: 0, dy: 0 };
  const xAxis = transformPoint({ x: 1, y: 0 }, orientation);
  const yAxis = transformPoint({ x: 0, y: 1 }, orientation);
  const a = xAxis.x, b = -xAxis.y * view.columns / view.rows;
  const c = -yAxis.x * view.rows / view.columns, d = yAxis.y;
  const destinationCenter = boardPoint(view, transformPoint(sourceCenter, transform));
  const e = destinationCenter.x - a * displayCenter.x - c * displayCenter.y;
  const f = destinationCenter.y - b * displayCenter.x - d * displayCenter.y;
  return { stones: original.stones.map(centered), resting: centered(original.resting), matrix: [a, b, c, d, e, f] };
}
