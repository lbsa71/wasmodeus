import { pointKey } from "./rules.js";
/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Move} Move */
/** @typedef {import('./types.js').Transform} Transform */

/** @param {Point} point @param {Transform} t @returns {Point} */
export function transformPoint(point, t) {
  let { x, y } = point;
  if (t.orientation >= 4) x = -x;
  for (let i = 0; i < t.orientation % 4; i++) [x, y] = [-y, x];
  return { x: x + t.dx, y: y + t.dy };
}
/** @param {Board} board @param {Transform} t @returns {Board} */
export function transformBoard(board, t) {
  return { stones: board.stones.map(p => transformPoint(p, t)), resting: transformPoint(board.resting, t) };
}
/** @param {Move} move @param {Transform} t @returns {Move} */
export function transformMove(move, t) {
  return { from: transformPoint(move.from, t), to: transformPoint(move.to, t) };
}
/** @param {Board} board */
function exactKey(board) {
  return `${board.stones.map(pointKey).sort().join(";")}|${pointKey(board.resting)}`;
}
/** @param {Board} board */
function minimum(board) {
  return { x: Math.min(...board.stones.map(p => p.x)), y: Math.min(...board.stones.map(p => p.y)) };
}
/** @param {Board} board */
export function canonicalKey(board) {
  const keys = [];
  for (let orientation = 0; orientation < 8; orientation++) {
    const rotated = transformBoard(board, { orientation, dx: 0, dy: 0 });
    const min = minimum(rotated);
    keys.push(exactKey(transformBoard(rotated, { orientation: 0, dx: -min.x, dy: -min.y })));
  }
  return keys.sort()[0];
}
/** @param {Board} source @param {Board} target @returns {Transform[]} */
export function matchingTransforms(source, target) {
  const matches = [];
  const targetMin = minimum(target);
  for (let orientation = 0; orientation < 8; orientation++) {
    const rotatedMin = minimum(transformBoard(source, { orientation, dx: 0, dy: 0 }));
    const t = { orientation, dx: targetMin.x - rotatedMin.x, dy: targetMin.y - rotatedMin.y };
    if (exactKey(transformBoard(source, t)) === exactKey(target)) matches.push(t);
  }
  return matches;
}
/** @param {Transform} t */
export function transformLabel(t) {
  const rotations = ["Aligned", "Rotated 90°", "Rotated 180°", "Rotated 270°"];
  return `${t.orientation >= 4 ? "Mirrored, " : ""}${rotations[t.orientation % 4].toLowerCase()}`;
}
