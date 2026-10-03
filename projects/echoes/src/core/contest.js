import { legalMoves, applyMove, pointKey } from "./rules.js";
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Side} Side */
/** @typedef {import('./types.js').Reply} Reply */
/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Move} Move */
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]];
/** @param {Board} board @param {Side[]} owners @param {Side} side */
export function line(board, owners, side) {
  const points = board.stones.filter((_, i) => owners[i] === side);
  const keys = new Set(points.map(pointKey));
  for (const p of points) for (const [dx, dy] of directions) {
    const row = [0, 1, 2, 3].map(k => ({ x: p.x + k * dx, y: p.y + k * dy }));
    if (row.every(q => keys.has(pointKey(q)))) return row;
  }
  return [];
}
/** @param {Board} board @param {Side[]} owners @returns {Side | null} */
export function winner(board, owners) {
  if (line(board, owners, "human").length) return "human";
  if (line(board, owners, "ghost").length) return "ghost";
  return null;
}
/** @param {Board} board @param {Side[]} owners @param {Side} side */
export function winningMoves(board, owners, side) {
  return legalMoves(board).filter(move => winner(applyMove(board, move), owners) === side);
}
/** Longest contiguous line gives a small preference after immediate tactics.
 * @param {Board} board @param {Side[]} owners @param {Side} side */
export function progress(board, owners, side) {
  const points = board.stones.filter((_, i) => owners[i] === side);
  const keys = new Set(points.map(pointKey));
  let best = 1;
  for (const p of points) for (const [dx, dy] of directions) {
    let length = 1;
    while (keys.has(`${p.x + length * dx},${p.y + length * dy}`)) length++;
    best = Math.max(best, length);
  }
  return best;
}
/** Rank only real archived candidates; evaluation never manufactures an action.
 * @param {Board} board @param {Side[]} owners @param {Reply[]} replies @returns {Reply | undefined} */
export function chooseReply(board, owners, replies) {
  let best, bestScore = -Infinity;
  for (const reply of replies) {
    const after = applyMove(board, reply.move), won = winner(after, owners);
    const score = won === "ghost" ? 100000 : won === "human" ? -100000
      : -1000 * winningMoves(after, owners, "human").length + 80 * winningMoves(after, owners, "ghost").length
        + 5 * progress(after, owners, "ghost") - progress(after, owners, "human");
    if (score > bestScore) { best = reply; bestScore = score; }
  }
  return best;
}
/** @param {Board} board @param {Side[]} owners @param {Move} move */
export function moveIntent(board, owners, move) {
  const after = applyMove(board, move);
  if (winner(after, owners) === "ghost") return "Completing its four";
  if (winningMoves(board, owners, "human").length && !winningMoves(after, owners, "human").length) return "Blocking your winning move";
  if (winningMoves(after, owners, "ghost").length) return "Creating a winning threat";
  return "Building its line";
}
/** @param {Game} game @returns {boolean} */
export function finishLine(game) {
  if (!game.contest) return false;
  const won = winner(game.board, game.contest.owners);
  if (!won) return false;
  game.contest.winner = won; game.contest.endReason = "line";
  game.status = "won"; game.turn = "finished"; game.endedAt = new Date().toISOString();
  return true;
}
/** @param {Game} game */
export function finishLimit(game) {
  if (!game.contest) return;
  game.contest.endReason = "limit"; game.status = "held"; game.turn = "finished"; game.endedAt = new Date().toISOString();
}
