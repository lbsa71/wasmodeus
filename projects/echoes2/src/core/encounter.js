import { opening, validBoard, legalMoves, applyMove, territory, winner } from "./rules.js";
import { canonicalBoard } from "./history.js";

/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').StartSource} StartSource */

/** Let a human try the position where the ghost previously had no response.
 * @param {Board} board @returns {Board}
 */
export function swapColours(board) {
  return { size: board.size, cells: board.cells.map(cell => ({ owner: cell.owner === 1 ? 2 : cell.owner === 2 ? 1 : 0, charge: cell.charge })) };
}

/** A restart gives both sides time to act before either can eliminate the other.
 * @param {Board} board
 */
export function safeOpening(board) {
  if (!validBoard(board) || territory(board, 1) === 0 || territory(board, 2) === 0) return false;
  return [1, 2].every(actor => legalMoves(board, actor).every(move => winner(applyMove(board, move, actor).board) === 0));
}

/** Choose an underplayed, safe historic pass; newest evidence breaks equal-use ties.
 * @param {Database} db @returns {{board: Board, source?: StartSource}}
 */
export function selectOpening(db) {
  const uses = new Map();
  for (const game of db.games) {
    const key = canonicalBoard(game.initialBoard);
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  /** @type {Map<string, {board:Board, source:StartSource, key:string, order:number}>} */
  const distinct = new Map();
  let order = 0;
  for (const game of db.games) {
    if (game.status === "playing") continue;
    game.turns.forEach((turn, turnIndex) => {
      if (turn.actor !== 2 || turn.move !== null) return;
      const board = swapColours(turn.after);
      const key = canonicalBoard(board);
      distinct.set(key, { board, source: { gameId: game.id, turnIndex }, key, order: order++ });
    });
  }
  let candidates = [...distinct.values()].filter(candidate => safeOpening(candidate.board));
  const previous = db.games.at(-1);
  if (previous) {
    const previousKey = canonicalBoard(previous.initialBoard);
    const different = candidates.filter(candidate => candidate.key !== previousKey);
    if (different.length) candidates = different;
  }
  candidates.sort((a, b) => (uses.get(a.key) ?? 0) - (uses.get(b.key) ?? 0) || b.order - a.order);
  const chosen = candidates[0];
  return chosen ? { board: structuredClone(chosen.board), source: { ...chosen.source } } : { board: opening() };
}
