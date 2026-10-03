import { chooseReply, finishLine, finishLimit } from "./contest.js";
import { selectContestOpening } from "./contest-opening.js";
import { RULESET, opening, applyMove, isLegal, pointKey } from "./rules.js";
import { canonicalKey, matchingTransforms, transformMove } from "./symmetry.js";
/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Move} Move */
/** @typedef {import('./types.js').Reply} Reply */
/** @typedef {import('./types.js').Side} Side */

/** @returns {Database} */
export function createDatabase() {
  const now = new Date().toISOString();
  return { schemaVersion: 1, ruleset: RULESET, revision: 0, createdAt: now, updatedAt: now, games: [], activeGameId: null };
}
/** @param {Database} db @returns {Game} */
export function currentGame(db) {
  const game = db.games.find(g => g.id === db.activeGameId);
  if (!game) throw new Error("No active encounter.");
  return game;
}
/** @param {Database} input @param {{turnLimit?: number, initialBoard?: Board}} [options] @returns {Database} */
export function startGame(input, options = {}) {
  const db = structuredClone(input);
  if (db.activeGameId) {
    const previous = currentGame(db);
    if (previous.status === "playing") {
      previous.status = "abandoned"; previous.turn = "finished"; previous.endedAt = new Date().toISOString();
    }
  }
  const turnLimit = options.turnLimit ?? 12;
  if (!Number.isInteger(turnLimit) || turnLimit < 1 || turnLimit > 100) throw new Error("Invalid encounter limit.");
  const archiveGameIds = db.games.filter(g => g.status !== "playing").map(g => g.id);
  const snapshot = { archiveGameIds };
  const initialBoard = structuredClone(options.initialBoard ?? unansweredFrontier(db, snapshot) ?? opening());
  const game = /** @type {Game} */ ({
    id: crypto.randomUUID(), createdAt: new Date().toISOString(), endedAt: null,
    status: "playing", turn: "human", board: initialBoard, initialBoard: structuredClone(initialBoard), handoffs: [], moves: [], humanTurns: 0, turnLimit,
    archiveGameIds,
  });
  db.games.push(game); db.activeGameId = game.id;
  return db;
}
/** @param {Database} input @param {Move} move @returns {Database} */
export function humanMove(input, move) {
  const db = structuredClone(input);
  const game = currentGame(db);
  if (game.status !== "playing" || game.turn !== "human") throw new Error("Wait for your turn.");
  const before = structuredClone(game.board);
  game.board = applyMove(before, move);
  game.moves.push({ actor: "human", before, after: structuredClone(game.board), move: structuredClone(move), source: null });
  game.humanTurns++; game.turn = "ghost";
  finishLine(game);
  return db;
}
/** @param {Database} db @param {Board} board @param {Pick<Game, "archiveGameIds">} [game] @returns {Reply[]} */
export function archiveReplies(db, board, game = currentGame(db)) {
  const ids = new Set(game.archiveGameIds);
  const key = canonicalKey(board);
  const seen = new Set();
  const replies = [];
  for (const history of [...db.games].reverse()) {
    if (!ids.has(history.id)) continue;
    for (let i = history.moves.length - 1; i >= 0; i--) {
      const turn = history.moves[i];
      if (turn.actor !== "human" || canonicalKey(turn.before) !== key) continue;
      for (const transform of matchingTransforms(turn.before, board)) {
        const move = transformMove(turn.move, transform);
        const moveKey = `${pointKey(move.from)}>${pointKey(move.to)}`;
        if (seen.has(moveKey) || !isLegal(board, move)) continue;
        seen.add(moveKey);
        replies.push({ move, source: { gameId: history.id, moveIndex: i, transform } });
      }
    }
  }
  return replies;
}
/** @param {Database} db @param {Pick<Game, "archiveGameIds">} game @returns {Board[]} */
function archivedPositions(db, game) {
  const ids = new Set(game.archiveGameIds);
  return db.games.filter(g => ids.has(g.id) && g.moves.some(m => m.actor === "human"))
    .flatMap(g => [g.initialBoard ?? opening(), ...g.moves.map(m => m.after)]);
}
/** @param {Database} db @param {Board} board @param {Pick<Game, "archiveGameIds">} [game] */
export function previouslyEncountered(db, board, game = currentGame(db)) {
  const key = canonicalKey(board);
  return archivedPositions(db, game).some(b => canonicalKey(b) === key);
}
/** @param {Database} db @param {Pick<Game, "archiveGameIds">} game @returns {Board | undefined} */
function unansweredFrontier(db, game) {
  return archivedPositions(db, game).reverse().find(b => archiveReplies(db, b, game).length === 0);
}
/** @param {Database} input @returns {Database} */
export function advanceGhost(input) {
  const db = structuredClone(input);
  const game = currentGame(db);
  if (game.status !== "playing" || game.turn !== "ghost") throw new Error("The archive is not due to answer.");
  const replies = archiveReplies(db, game.board);
  let reply = game.contest ? chooseReply(game.board, game.contest.owners, replies) : replies[0];
  if (game.moves.length === 0 && game.openingSource) {
    const source = game.openingSource;
    const original = db.games.find(g => g.id === source.gameId)?.moves[source.moveIndex];
    if (!original || original.actor !== "human" || !game.archiveGameIds.includes(source.gameId)) throw new Error("Missing recorded opening.");
    reply = { move: transformMove(original.move, source.transform), source };
  }
  if (!reply) {
    if (game.contest) {
      const key = canonicalKey(game.board);
      const alreadyFound = game.contest.discoveries.some(i => canonicalKey(game.moves[i - 1].after) === key);
      if (!previouslyEncountered(db, game.board) && !alreadyFound) game.contest.discoveries.push(game.moves.length);
      (game.handoffs ??= []).push(game.moves.length);
      if (game.humanTurns >= game.turnLimit) finishLimit(game);
      else game.turn = "human";
      return db;
    }
    if (previouslyEncountered(db, game.board)) {
      (game.handoffs ??= []).push(game.moves.length);
      if (game.humanTurns < game.turnLimit) { game.turn = "human"; return db; }
      game.status = "held";
    } else game.status = "won";
    game.turn = "finished"; game.endedAt = new Date().toISOString();
    return db;
  }
  const before = structuredClone(game.board);
  game.board = applyMove(before, reply.move);
  game.moves.push({ actor: "ghost", before, after: structuredClone(game.board), move: reply.move, source: reply.source });
  if (finishLine(game)) return db;
  if (game.contest && game.humanTurns >= game.turnLimit) { finishLimit(game); return db; }
  if (game.humanTurns >= game.turnLimit) {
    game.status = "held"; game.turn = "finished"; game.endedAt = new Date().toISOString();
  } else game.turn = "human";
  return db;
}

/** Rewind a discovery so its exact winning human action becomes the next ghost opening.
 * @param {Database} input @returns {Database} */
export function continueEncounter(input) {
  const previous = currentGame(input);
  if (previous.status === "playing") throw new Error("Continue only a finished encounter.");
  const last = previous.moves.at(-1);
  if (previous.status !== "won" || last?.actor !== "human") return startGame(input);
  const db = startGame(input, { initialBoard: last.before, turnLimit: previous.turnLimit });
  const game = currentGame(db);
  game.openingSource = { gameId: previous.id, moveIndex: previous.moves.length - 1, transform: { orientation: 0, dx: 0, dy: 0 } };
  game.turn = "ghost";
  return db;
}
/** One point per distinct frontier; old duplicate awards cannot inflate the score.
 * @param {Database} db */
export function discoveryScore(db) {
  const keys = db.games.flatMap(g => g.contest
    ? g.contest.discoveries.map(i => canonicalKey(g.moves[i - 1].after))
    : g.status === "won" ? [canonicalKey(g.board)] : []);
  return new Set(keys).size;
}

/** Start a colour contest using the same geometric archive and unchanged movement rules.
 * @param {Database} input @param {{initialBoard?: Board, owners?: Side[], turnLimit?: number}} [options] @returns {Database} */
export function startContest(input, options = {}) {
  const db = startGame(input, { initialBoard: options.initialBoard ?? opening(), turnLimit: options.turnLimit ?? 24 });
  const owners = options.owners ?? ["human", "ghost", "human", "ghost", "human", "ghost", "human", "ghost"];
  if (owners.length !== 8 || owners.filter(s => s === "human").length !== 4 || owners.filter(s => s === "ghost").length !== 4) throw new Error("A contest needs four stones per side.");
  currentGame(db).contest = { owners: [...owners], winner: null, discoveries: [], endReason: null };
  return db;
}
/** Start a fresh match, weighted toward less explored historical positions.
 * @param {Database} input @param {{random?: () => number, preferReplies?: boolean}} [options] */
export function startNextContest(input, options = {}) {
  const selected = selectContestOpening(input, options);
  const db = startContest(input, {initialBoard:selected.board,owners:selected.owners});
  const contest = currentGame(db).contest;
  if (contest) contest.start = selected.start;
  return db;
}
/** @param {Database} db */
export function matchScore(db) {
  return { human: db.games.filter(g => g.contest?.winner === "human").length, ghost: db.games.filter(g => g.contest?.winner === "ghost").length };
}
