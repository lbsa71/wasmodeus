import { opening, applyMove, validBoard, winner, territory } from "./rules.js";
import { archiveReplies, canonicalBoard, isDiscovery } from "./history.js";
import { selectOpening } from "./encounter.js";
export { archiveReplies } from "./history.js";

/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Game} Game */

/** @returns {Database} */
export function createDatabase() {
  const now = new Date().toISOString();
  return { schemaVersion: 1, ruleset: "echoes2-charge-v1", revision: 0, createdAt: now, updatedAt: now, games: [], activeGameId: null };
}

/** @param {Database} db @returns {Game} */
export function currentGame(db) {
  const game = db.games.find(game => game.id === db.activeGameId);
  if (!game) throw new Error("There is no active match.");
  return game;
}

/** @param {Database} db @param {1|2} actor @returns {Game} */
function requireTurn(db, actor) {
  const game = currentGame(db);
  if (!game || game.status !== "playing" || game.turn !== actor) throw new Error("It is not that side's turn.");
  return game;
}

/** @param {Game} game @param {0|1|2} result */
function finish(game, result) {
  game.status = result === 1 ? "human" : result === 2 ? "ghost" : "draw";
  game.turn = 0;
  game.endedAt = new Date().toISOString();
}

/** @param {Database} input @param {{ initialBoard?: Board, limit?: number }} [options] */
export function startGame(input, { initialBoard = opening(), limit = 16 } = {}) {
  if (!validBoard(initialBoard) || winner(initialBoard) !== 0 || territory(initialBoard, 1) === 0 || territory(initialBoard, 2) === 0) throw new Error("A new match needs a stable board with both colours.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 64) throw new Error("The move limit must be between 1 and 64.");
  const db = structuredClone(input);
  const now = new Date().toISOString();
  const previous = db.activeGameId ? currentGame(db) : null;
  if (previous?.status === "playing") {
    previous.status = "abandoned";
    previous.turn = 0;
    previous.endedAt = now;
  }
  /** @type {Game} */
  const game = {
    id: crypto.randomUUID(), createdAt: now, endedAt: null, status: "playing", turn: 1,
    initialBoard: structuredClone(initialBoard), board: structuredClone(initialBoard), turns: [],
    humanTurns: 0, limit, archiveIds: db.games.map(old => old.id)
  };
  db.games.push(game);
  db.activeGameId = game.id;
  db.updatedAt = now;
  return db;
}

/** Start a playable encounter from an underused historical frontier when available.
 * @param {Database} input
 */
export function startEncounter(input) {
  const selected = selectOpening(input);
  const db = startGame(input, { initialBoard: selected.board });
  if (selected.source) currentGame(db).startSource = selected.source;
  return db;
}

/** @param {Database} input @param {number} move */
export function humanMove(input, move) {
  const db = structuredClone(input);
  const game = requireTurn(db, 1);
  const before = structuredClone(game.board);
  const { board } = applyMove(before, move, 1);
  game.turns.push({ actor: 1, move, before, after: structuredClone(board), source: null, discovery: false });
  game.board = board;
  game.humanTurns += 1;
  game.turn = 2;
  const result = winner(board);
  if (result !== 0) finish(game, result);
  db.updatedAt = new Date().toISOString();
  return db;
}

/** @param {Database} input */
export function advanceGhost(input) {
  const db = structuredClone(input);
  const game = requireTurn(db, 2);
  const before = structuredClone(game.board);
  const reply = archiveReplies(db, before, game)[0];
  const after = reply ? applyMove(before, reply.move, 2).board : structuredClone(before);
  const discovery = !reply && isDiscovery(db, game, before);
  game.turns.push({ actor: 2, move: reply?.move ?? null, before, after: structuredClone(after), source: reply?.source ?? null, discovery });
  game.board = after;
  game.turn = 1;
  const result = winner(after);
  if (result !== 0) finish(game, result);
  else if (game.humanTurns >= game.limit) {
    const margin = territory(after, 1) - territory(after, 2);
    finish(game, margin > 0 ? 1 : margin < 0 ? 2 : 0);
  }
  db.updatedAt = new Date().toISOString();
  return db;
}

/** @param {Database} db */
export function discoveryScore(db) {
  return new Set(db.games.flatMap(game => game.turns.filter(turn => turn.discovery).map(turn => canonicalBoard(turn.after)))).size;
}

/** @param {Database} db */
export function matchScore(db) {
  return {
    human: db.games.filter(game => game.status === "human").length,
    ghost: db.games.filter(game => game.status === "ghost").length,
    draw: db.games.filter(game => game.status === "draw").length
  };
}
