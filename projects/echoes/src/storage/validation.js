import { validateContest } from "./contest-validation.js";
import { RULESET, opening, connected, samePoint, pointKey, applyMove } from "../core/rules.js";
import { archiveReplies, previouslyEncountered } from "../core/game.js";
import { transformBoard, transformMove } from "../core/symmetry.js";
/** @typedef {import('../core/types.js').Database} Database */
/** @typedef {import('../core/types.js').Board} Board */

/** @param {unknown} value */
function object(value) { return value !== null && typeof value === "object"; }
/** @param {unknown} value */
function point(value) {
  if (!object(value)) return false;
  const p = /** @type {import('../core/types.js').Point} */ (value);
  return Number.isInteger(p.x) && Number.isInteger(p.y) && Math.abs(p.x) <= 1000000 && Math.abs(p.y) <= 1000000;
}
/** @param {unknown} value @returns {asserts value is Board} */
function board(value) {
  if (!object(value)) throw new Error("Invalid board.");
  const b = /** @type {Board} */ (value);
  if (!Array.isArray(b.stones) || b.stones.length !== 8 || !b.stones.every(point) || !point(b.resting)) throw new Error("Invalid stones.");
  if (new Set(b.stones.map(pointKey)).size !== 8 || !connected(b.stones) || !b.stones.some(p => samePoint(p, b.resting))) throw new Error("Invalid constellation.");
}
/** @param {Board} a @param {Board} b */
export function boardsEqual(a, b) {
  return samePoint(a.resting, b.resting) && a.stones.map(pointKey).sort().join(";") === b.stones.map(pointKey).sort().join(";");
}
/** @param {unknown} input @returns {Database} */
export function validateDatabase(input) {
  if (!object(input)) throw new Error("Invalid database.");
  const db = /** @type {Database} */ (input);
  if (db.schemaVersion !== 1 || db.ruleset !== RULESET || !Number.isSafeInteger(db.revision) || db.revision < 0 || !Array.isArray(db.games) || typeof db.createdAt !== "string" || typeof db.updatedAt !== "string") throw new Error("Unsupported or invalid database.");
  const ids = new Set();
  let playing = 0;
  for (const game of db.games) {
    if (!object(game) || typeof game.id !== "string" || ids.has(game.id) || typeof game.createdAt !== "string" || !["playing", "won", "held", "abandoned"].includes(game.status)) throw new Error("Invalid encounter.");
    if (!Number.isInteger(game.turnLimit) || game.turnLimit < 1 || game.turnLimit > 100 || !Array.isArray(game.moves) || game.moves.length > game.turnLimit * 2 + (game.openingSource ? 1 : 0) || !Array.isArray(game.archiveGameIds) || game.archiveGameIds.some(id => !ids.has(id)) || new Set(game.archiveGameIds).size !== game.archiveGameIds.length) throw new Error("Invalid encounter history.");
    board(game.board);
    if (game.contest !== undefined) {
      validateContest(db, game, board);
      if (game.status === "playing") playing++;
      ids.add(game.id);
      continue;
    }
    const handoffs = game.handoffs ?? [];
    if (!Array.isArray(handoffs) || new Set(handoffs).size !== handoffs.length || handoffs.some(i => !Number.isInteger(i) || i < 1 || i > game.moves.length)) throw new Error("Invalid teaching handoffs.");
    let cursor = game.initialBoard ?? opening();
    board(cursor);
    if (game.openingSource !== undefined) {
      const source = game.openingSource;
      if (!object(source) || !source || !game.archiveGameIds.includes(source.gameId)) throw new Error("Invalid opening source.");
      const previous = db.games.find(g => g.id === source.gameId);
      const original = previous?.moves[source.moveIndex];
      if (previous?.status !== "won" || source.moveIndex !== previous.moves.length - 1 || original?.actor !== "human" || !boardsEqual(original.before, cursor) || source.transform?.orientation !== 0 || source.transform.dx !== 0 || source.transform.dy !== 0) throw new Error("Invalid opening source.");
      const first = game.moves[0];
      if (first && (first.source?.gameId !== source.gameId || first.source.moveIndex !== source.moveIndex || !samePoint(first.move.from, original.move.from) || !samePoint(first.move.to, original.move.to))) throw new Error("Opening must replay its exact source.");
    }
    let expectedActor = game.openingSource ? "ghost" : "human";
    let humanCount = 0;
    for (let i = 0; i < game.moves.length; i++) {
      const turn = game.moves[i];
      if (!object(turn) || turn.actor !== expectedActor || !object(turn.move) || !point(turn.move.from) || !point(turn.move.to)) throw new Error("Invalid recorded turn.");
      board(turn.before); board(turn.after);
      if (!boardsEqual(cursor, turn.before) || !boardsEqual(applyMove(cursor, turn.move), turn.after)) throw new Error("Recorded movement does not match its position.");
      if (turn.actor === "human") {
        if (turn.source !== null) throw new Error("A human move cannot invent provenance.");
        humanCount++;
      } else {
        const source = turn.source;
        if (!object(source) || !source || !game.archiveGameIds.includes(source.gameId) || !Number.isInteger(source.moveIndex) || !object(source.transform)) throw new Error("Missing ghost provenance.");
        const t = source.transform;
        if (!Number.isInteger(t.orientation) || t.orientation < 0 || t.orientation > 7 || !Number.isSafeInteger(t.dx) || !Number.isSafeInteger(t.dy)) throw new Error("Invalid ghost transformation.");
        const original = db.games.find(g => g.id === source.gameId)?.moves[source.moveIndex];
        if (!original || original.actor !== "human" || !boardsEqual(transformBoard(original.before, t), turn.before)) throw new Error("Ghost source does not match.");
        const mapped = transformMove(original.move, t);
        if (!samePoint(mapped.from, turn.move.from) || !samePoint(mapped.to, turn.move.to)) throw new Error("Ghost move was not recorded by a human.");
      }
      if (handoffs.includes(i + 1)) {
        if (turn.actor !== "human" || archiveReplies(db, turn.after, game).length || !previouslyEncountered(db, turn.after, game)) throw new Error("Invalid frontier handoff.");
        expectedActor = "human";
      } else expectedActor = turn.actor === "human" ? "ghost" : "human";
      cursor = turn.after;
    }
    if (game.humanTurns !== humanCount || !boardsEqual(cursor, game.board)) throw new Error("Encounter progress does not match its recorded turns.");
    if (game.status === "playing") {
      playing++;
      if (game.endedAt !== null || game.turn !== expectedActor || game.id !== db.activeGameId) throw new Error("Invalid active turn.");
    } else if (game.turn !== "finished" || typeof game.endedAt !== "string") throw new Error("Invalid finished encounter.");
    if (game.status === "won" && (game.moves.at(-1)?.actor !== "human" || expectedActor !== "ghost")) throw new Error("A frontier must follow a human move.");
    if (game.status === "held" && (humanCount !== game.turnLimit || expectedActor !== "human")) throw new Error("Invalid archive victory.");
    if (game.initialBoard && game.status === "won" && (previouslyEncountered(db, game.board, game) || archiveReplies(db, game.board, game).length)) throw new Error("Invalid discovery victory.");
    ids.add(game.id);
  }
  if (playing > 1 || (db.activeGameId !== null && !ids.has(db.activeGameId)) || (db.games.length > 0 && db.activeGameId === null)) throw new Error("Invalid active encounter.");
  return structuredClone(db);
}
