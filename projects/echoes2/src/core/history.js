import { applyMove, legalMoves, territory, winner } from "./rules.js";

/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Reply} Reply */

const cross = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]];

/** @param {number} x @param {number} y @param {number} orientation */
function transform(x, y, orientation) {
  if (orientation >= 4) x = -x;
  for (let rotation = 0; rotation < orientation % 4; rotation += 1) [x, y] = [-y, x];
  return [x, y];
}

/** @param {Board} board @param {number} x @param {number} y @param {1|2} actor */
function cellKey(board, x, y, actor) {
  if (x < 0 || y < 0 || x >= board.size || y >= board.size) return "edge";
  const cell = board.cells[y * board.size + x];
  return `${cell.owner === 0 ? 0 : cell.owner === actor ? 1 : 2}:${cell.charge}`;
}

/** Match a recorded human cross to a ghost cross, preserving empty cells and board edges.
 * @param {Board} source @param {number} sourceMove @param {Board} target @param {number} targetMove @param {number} orientation
 */
export function matchPattern(source, sourceMove, target, targetMove, orientation) {
  if (!Number.isInteger(orientation) || orientation < 0 || orientation > 7) return false;
  const sx = sourceMove % source.size;
  const sy = Math.floor(sourceMove / source.size);
  const tx = targetMove % target.size;
  const ty = Math.floor(targetMove / target.size);
  return cross.every(([x, y]) => {
    const [dx, dy] = transform(x, y, orientation);
    return cellKey(source, sx + x, sy + y, 1) === cellKey(target, tx + dx, ty + dy, 2);
  });
}

/** Full-board symmetry key; colours are relative to the ghost, never interchangeable.
 * @param {Board} board
 */
export function canonicalBoard(board) {
  const edge = board.size - 1;
  const variants = Array.from({ length: 8 }, (_, orientation) => {
    const cells = Array(board.cells.length).fill("");
    for (let i = 0; i < board.cells.length; i += 1) {
      const [dx, dy] = transform(2 * (i % board.size) - edge, 2 * Math.floor(i / board.size) - edge, orientation);
      const cell = board.cells[i];
      cells[((dy + edge) / 2) * board.size + (dx + edge) / 2] = `${cell.owner === 0 ? 0 : cell.owner === 2 ? 1 : 2}:${cell.charge}`;
    }
    return `${board.size}|${cells.join(",")}`;
  });
  return variants.sort()[0];
}

/** @param {Board} board @param {number} move */
function replyScore(board, move) {
  const after = applyMove(board, move, 2).board;
  if (winner(after) === 2) return 100000;
  const charge = after.cells.reduce((sum, cell) => sum + (cell.owner === 2 ? cell.charge : cell.owner === 1 ? -cell.charge : 0), 0);
  return 100 * (territory(after, 2) - territory(after, 1)) + charge;
}

/** Only actual human actions in this match's frozen archive can become replies.
 * @param {Database} db @param {Board} board @param {Game|null} [game]
 * @returns {Reply[]}
 */
export function archiveReplies(db, board, game = db.games.find(candidate => candidate.id === db.activeGameId) ?? null) {
  if (!game) return [];
  const archiveIds = new Set(game.archiveIds);
  const targets = legalMoves(board, 2);
  /** @type {Map<number, Reply>} */
  const found = new Map();
  for (const oldGame of db.games) {
    if (!archiveIds.has(oldGame.id)) continue;
    oldGame.turns.forEach((turn, turnIndex) => {
      if (turn.actor !== 1 || turn.move === null || turn.source !== null) return;
      for (const move of targets) {
        if (found.has(move)) continue;
        for (let orientation = 0; orientation < 8; orientation += 1) {
          if (!matchPattern(turn.before, turn.move, board, move, orientation)) continue;
          found.set(move, { move, source: { gameId: oldGame.id, turnIndex, orientation } });
          break;
        }
      }
    });
  }
  return [...found.values()].map(reply => ({ reply, score: replyScore(board, reply.move) }))
    .sort((a, b) => b.score - a.score || a.reply.move - b.reply.move)
    .map(({ reply }) => reply);
}

/** @param {Database} db @param {Game} game @param {Board} board */
export function isDiscovery(db, game, board) {
  const key = canonicalBoard(board);
  const allowed = new Set([...game.archiveIds, game.id]);
  return !db.games.some(oldGame => allowed.has(oldGame.id) && oldGame.turns.some(turn =>
    turn.actor === 2 && turn.move === null && turn.discovery && canonicalBoard(turn.after) === key));
}
