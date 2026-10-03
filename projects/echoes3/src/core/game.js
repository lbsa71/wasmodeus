import { opening, validPosition, applyMove } from "./rules.js";
import { archiveReplies, isDiscovery } from "./history.js";
import { selectOpening } from "./encounter.js";
export { archiveReplies } from "./history.js";
export { growOpening } from "./encounter.js";

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Move} Move */

/** @returns {Database} */
export function createDatabase() {
  const now = new Date().toISOString();
  return { schemaVersion: 1, ruleset: "echoes3-v1", revision: 0, createdAt: now, updatedAt: now, games: [], activeGameId: null };
}

/** @param {Database} db @returns {Game} */
export function currentGame(db) {
  const game = db.games.find(candidate => candidate.id === db.activeGameId);
  if (!game) throw new Error("There is no active match.");
  return game;
}

/** @param {Database} db @param {1|2} actor */
function requireTurn(db, actor) {
  const game = currentGame(db);
  if (game.status !== "playing" || game.turn !== actor) throw new Error("It is not that side's turn.");
  return game;
}

/** @param {Game} game @param {1|2} actor */
function finish(game, actor) {
  game.status = actor === 1 ? "human" : "ghost";
  game.turn = 0;
  game.endedAt = new Date().toISOString();
}

/** @param {Database} input @param {{initialPosition?:string}} [options] */
export function startGame(input, { initialPosition = opening() } = {}) {
  if (!validPosition(initialPosition) || initialPosition === "()") throw new Error("A match needs a canonical nonterminal tree.");
  const db = structuredClone(input);
  const now = new Date().toISOString();
  const old = db.activeGameId ? currentGame(db) : null;
  if (old?.status === "playing") { old.status = "abandoned"; old.turn = 0; old.endedAt = now; }
  /** @type {Game} */
  const game = {
    id: crypto.randomUUID(), createdAt: now, endedAt: null, status: "playing", turn: 1,
    initialPosition, position: initialPosition, turns: [], archiveIds: db.games.map(prior => prior.id)
  };
  db.games.push(game); db.activeGameId = game.id; db.updatedAt = now;
  return db;
}

/** @param {Database} input */
export function startEncounter(input) {
  const selected = selectOpening(input);
  const db = startGame(input, { initialPosition: selected.position });
  if (selected.source) currentGame(db).startSource = selected.source;
  return db;
}

/** @param {Database} input @param {Move} move */
export function humanMove(input, move) {
  const db = structuredClone(input);
  const game = requireTurn(db, 1);
  const before = game.position;
  const after = applyMove(before, move).position;
  game.turns.push({ actor: 1, move: [...move], before, after, source: null, discovery: false });
  game.position = after; game.turn = 2;
  if (after === "()") finish(game, 1);
  db.updatedAt = new Date().toISOString();
  return db;
}

/** @param {Database} input */
export function advanceGhost(input) {
  const db = structuredClone(input);
  const game = requireTurn(db, 2);
  const before = game.position;
  const reply = archiveReplies(db, before, game)[0];
  const after = reply?.after ?? before;
  game.turns.push({ actor: 2, move: reply ? [...reply.move] : null, before, after, source: reply ? { ...reply.source } : null, discovery: !reply && isDiscovery(db, game, before) });
  game.position = after; game.turn = 1;
  if (after === "()") finish(game, 2);
  db.updatedAt = new Date().toISOString();
  return db;
}

/** @param {Database} db */
export function discoveryScore(db) {
  return new Set(db.games.flatMap(game => game.turns.filter(turn => turn.discovery).map(turn => turn.after))).size;
}

/** @param {Database} db */
export function matchScore(db) {
  return { human: db.games.filter(game => game.status === "human").length, ghost: db.games.filter(game => game.status === "ghost").length };
}
