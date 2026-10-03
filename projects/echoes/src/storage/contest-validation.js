import { applyMove, samePoint, pointKey } from "../core/rules.js";
import { canonicalKey, transformBoard, transformMove } from "../core/symmetry.js";
import { archiveReplies, previouslyEncountered } from "../core/game.js";
import { winner } from "../core/contest.js";
import { DEFAULT_OWNERS, safeContestOpening } from "../core/contest-opening.js";
import { opening } from "../core/rules.js";
/** @typedef {import('../core/types.js').Database} Database */
/** @typedef {import('../core/types.js').Game} Game */
/** @typedef {import('../core/types.js').Board} Board */
/** @param {Board} a @param {Board} b */
function exact(a, b) { return samePoint(a.resting, b.resting) && a.stones.every((p, i) => samePoint(p, b.stones[i])); }
/** @param {Board} a @param {Board} b */
function geometry(a, b) { return samePoint(a.resting, b.resting) && a.stones.map(pointKey).sort().join(";") === b.stones.map(pointKey).sort().join(";"); }
/** @param {Database} db @param {Game} game @param {(value: unknown) => void} validateBoard */
export function validateContest(db, game, validateBoard) {
  const contest = game.contest;
  if (!contest || !Array.isArray(contest.owners) || contest.owners.length !== 8 || contest.owners.filter(s => s === "human").length !== 4 || contest.owners.filter(s => s === "ghost").length !== 4 || !Array.isArray(contest.discoveries) || ![null, "human", "ghost"].includes(contest.winner) || ![null, "line", "limit"].includes(contest.endReason)) throw new Error("Invalid contest colours or outcome.");
  if (!game.initialBoard || game.openingSource || !Array.isArray(game.handoffs) || new Set(game.handoffs).size !== game.handoffs.length || game.handoffs.some(i => !Number.isInteger(i) || i < 1 || i > game.moves.length)) throw new Error("Invalid contest opening or passes.");
  let cursor = game.initialBoard;
  validateBoard(cursor);
  if (winner(cursor, contest.owners)) throw new Error("A contest cannot start with a completed line.");
  if (contest.start !== undefined) {
    const start = contest.start;
    if (!start || !safeContestOpening(cursor,contest.owners)) throw new Error("Invalid safe contest opening.");
    if (start.kind === "default") {
      if (!exact(cursor,opening()) || JSON.stringify(contest.owners)!==JSON.stringify(DEFAULT_OWNERS)) throw new Error("Invalid default contest opening.");
    } else if (start.kind === "history") {
      if (!game.archiveGameIds.includes(start.gameId) || !Number.isInteger(start.step) || start.step<0) throw new Error("Invalid historic opening source.");
      const source = db.games.find(g=>g.id===start.gameId);
      const original = start.step===0 ? source?.initialBoard ?? (source ? opening() : undefined) : source?.moves[start.step-1]?.after;
      if (!original || !exact(cursor,original) || source?.contest && JSON.stringify(contest.owners)!==JSON.stringify(source.contest.owners)) throw new Error("Historic opening does not match its source.");
    } else throw new Error("Invalid contest opening kind.");
  }
  let expectedActor = "human", humanCount = 0;
  /** @type {import('../core/types.js').Side | null} */ let won = null;
  const discoveries = [], discovered = new Set();
  for (let i = 0; i < game.moves.length; i++) {
    const turn = game.moves[i];
    if (!turn || won || turn.actor !== expectedActor || !turn.move) throw new Error("Invalid contest turn.");
    validateBoard(turn.before); validateBoard(turn.after);
    if (!exact(cursor, turn.before) || !exact(applyMove(cursor, turn.move), turn.after)) throw new Error("Contest stone identities or movement changed.");
    if (turn.actor === "human") {
      if (turn.source !== null) throw new Error("Human move has ghost provenance.");
      humanCount++;
    } else {
      const source = turn.source;
      if (!source || !game.archiveGameIds.includes(source.gameId) || !Number.isInteger(source.moveIndex) || !source.transform) throw new Error("Missing contest ghost source.");
      const t = source.transform;
      if (!Number.isInteger(t.orientation) || t.orientation < 0 || t.orientation > 7 || !Number.isSafeInteger(t.dx) || !Number.isSafeInteger(t.dy)) throw new Error("Invalid contest ghost transform.");
      const original = db.games.find(g => g.id === source.gameId)?.moves[source.moveIndex];
      if (!original || original.actor !== "human" || !geometry(transformBoard(original.before, t), turn.before)) throw new Error("Contest ghost source does not fit.");
      const mapped = transformMove(original.move, t);
      if (!samePoint(mapped.from, turn.move.from) || !samePoint(mapped.to, turn.move.to)) throw new Error("Contest ghost move was never recorded.");
    }
    won = winner(turn.after, contest.owners);
    if (game.handoffs.includes(i + 1)) {
      if (won || turn.actor !== "human" || archiveReplies(db, turn.after, game).length) throw new Error("Invalid contest bonus turn.");
      const key = canonicalKey(turn.after);
      if (!previouslyEncountered(db, turn.after, game) && !discovered.has(key)) { discoveries.push(i + 1); discovered.add(key); }
      expectedActor = "human";
    } else expectedActor = turn.actor === "human" ? "ghost" : "human";
    cursor = turn.after;
  }
  if (humanCount > game.turnLimit || game.humanTurns !== humanCount || !exact(cursor, game.board) || JSON.stringify(discoveries) !== JSON.stringify(contest.discoveries)) throw new Error("Invalid contest progress or discovery points.");
  if (game.status === "playing") {
    if (won || contest.winner !== null || contest.endReason !== null || game.turn !== expectedActor || game.endedAt !== null || game.id !== db.activeGameId || (humanCount >= game.turnLimit && expectedActor === "human")) throw new Error("Invalid live contest.");
  } else {
    if (game.turn !== "finished" || typeof game.endedAt !== "string") throw new Error("Invalid finished contest.");
    if (game.status === "won" && (!won || contest.winner !== won || contest.endReason !== "line")) throw new Error("Invalid four-in-a-row victory.");
    if (game.status === "held" && (won || contest.winner !== null || contest.endReason !== "limit" || humanCount !== game.turnLimit || expectedActor !== "human")) throw new Error("Invalid contest draw.");
    if (game.status === "abandoned" && (won || contest.winner !== null || contest.endReason !== null)) throw new Error("Invalid abandoned contest.");
  }
}
