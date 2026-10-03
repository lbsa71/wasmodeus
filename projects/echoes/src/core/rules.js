/** @typedef {import('./types.js').Point} Point */
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Move} Move */

export const RULESET = "echoes-eight-rest-v1";
/** @param {Point} a @param {Point} b */
export const samePoint = (a, b) => a.x === b.x && a.y === b.y;
/** @param {Point} point */
export const pointKey = point => `${point.x},${point.y}`;
/** @returns {Board} */
export function opening() {
  return { stones: [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    { x: 0, y: 1 }, { x: 1, y: 1 },
    { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
  ], resting: { x: 1, y: 0 } };
}
/** @param {Point[]} stones */
export function connected(stones) {
  if (!stones.length) return false;
  const seen = new Set([0]);
  const pending = [0];
  while (pending.length) {
    const i = /** @type {number} */ (pending.pop());
    for (let j = 0; j < stones.length; j++) {
      if (!seen.has(j) && Math.abs(stones[i].x - stones[j].x) + Math.abs(stones[i].y - stones[j].y) === 1) {
        seen.add(j); pending.push(j);
      }
    }
  }
  return seen.size === stones.length;
}
/** @param {Board} board @param {Move} move */
export function isLegal(board, move) {
  if (![move.from.x, move.from.y, move.to.x, move.to.y].every(Number.isSafeInteger)) return false;
  if (samePoint(move.from, board.resting) || !board.stones.some(p => samePoint(p, move.from))) return false;
  const distance = Math.max(Math.abs(move.to.x - move.from.x), Math.abs(move.to.y - move.from.y));
  if (distance !== 1 || board.stones.some(p => samePoint(p, move.to))) return false;
  return connected(board.stones.map(p => samePoint(p, move.from) ? move.to : p));
}
/** @param {Board} board @param {Move} move @returns {Board} */
export function applyMove(board, move) {
  if (!isLegal(board, move)) throw new Error("Move an available stone one cell and keep the constellation connected.");
  return { stones: board.stones.map(p => ({ ...(samePoint(p, move.from) ? move.to : p) })), resting: { ...move.to } };
}
/** @param {Board} board @returns {Move[]} */
export function legalMoves(board) {
  const moves = [];
  for (const from of board.stones) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const move = { from: { ...from }, to: { x: from.x + dx, y: from.y + dy } };
      if (isLegal(board, move)) moves.push(move);
    }
  }
  return moves;
}
