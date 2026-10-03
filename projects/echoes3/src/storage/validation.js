import { validPosition } from "../core/rules.js";
import { createDatabase, startGame, currentGame, humanMove, advanceGhost } from "../core/game.js";
import { eligibleOpening } from "../core/encounter.js";

/** @typedef {import('../core/types.js').Database} Database */

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function ensure(condition, message) {
  if (!condition) throw new Error(`Invalid Echoes3 save: ${message}`);
}

/** @param {unknown} value */
function date(value) { return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)); }

/** @param {unknown} left @param {unknown} right @returns {boolean} */
function same(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object" || Array.isArray(left) !== Array.isArray(right)) return false;
  const a = /** @type {Record<string, unknown>} */ (left), b = /** @type {Record<string, unknown>} */ (right);
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}

/** Replay every recorded turn using precisely the frozen knowledge available at its start.
 * @param {unknown} input @returns {Database}
 */
export function validateDatabase(input) {
  ensure(input && typeof input === "object" && !Array.isArray(input), "database object required");
  const db = /** @type {Database} */ (structuredClone(input));
  ensure(db.schemaVersion === 1 && db.ruleset === "echoes3-v1", "unsupported ruleset");
  ensure(Number.isSafeInteger(db.revision) && db.revision >= 0, "revision");
  ensure(date(db.createdAt) && date(db.updatedAt), "database dates");
  ensure(Array.isArray(db.games), "games array");
  ensure(db.activeGameId === (db.games.at(-1)?.id ?? null), "active match must be latest");
  const ids = new Set();
  let replay = createDatabase();
  for (const [index, game] of db.games.entries()) {
    ensure(game && typeof game === "object", "game object");
    ensure(typeof game.id === "string" && game.id.length > 0 && game.id.length <= 128 && !ids.has(game.id), "unique game id");
    ensure(date(game.createdAt), "game date");
    ensure(game.status !== "playing" || index === db.games.length - 1, "only the latest match can be playing");
    ensure(validPosition(game.initialPosition) && validPosition(game.position), "canonical positions");
    ensure(Array.isArray(game.turns), "turn list");
    ensure(same(game.archiveIds, [...ids]), "frozen archive membership");
    if (Object.hasOwn(game, "startSource")) {
      const source = game.startSource;
      ensure(source && typeof source === "object" && Number.isInteger(source.turnIndex) && source.turnIndex >= 0, "opening source");
      ensure(game.archiveIds.includes(source.gameId), "opening source is archived");
      const sourceTurn = replay.games.find(old => old.id === source.gameId)?.turns[source.turnIndex];
      ensure(sourceTurn && sourceTurn.actor === 2 && sourceTurn.move === null, "opening source is a real ghost pass");
      ensure(game.initialPosition === sourceTurn.after && eligibleOpening(game.initialPosition), "opening is a suitable exact historic position");
    }
    replay = startGame(replay, { initialPosition: game.initialPosition });
    currentGame(replay).id = game.id; replay.activeGameId = game.id;
    for (const turn of game.turns) {
      ensure(turn && (turn.actor === 1 || turn.actor === 2), "turn actor");
      ensure(validPosition(turn.before) && validPosition(turn.after), "canonical turn positions");
      if (turn.actor === 1) {
        ensure(Array.isArray(turn.move), "human cut path");
        replay = humanMove(replay, turn.move);
      } else replay = advanceGhost(replay);
      ensure(same(turn, currentGame(replay).turns.at(-1)), "recorded action does not match replay");
    }
    const expected = currentGame(replay);
    if (game.status === "abandoned") {
      ensure(index < db.games.length - 1 && expected.status === "playing", "only an unfinished prior match can be abandoned");
      expected.status = "abandoned"; expected.turn = 0;
    }
    ensure(game.status === expected.status && game.turn === expected.turn && game.position === expected.position, "outcome or current position");
    ensure(game.status === "playing" ? game.endedAt === null : date(game.endedAt), "finish date");
    ids.add(game.id);
    replay.games[replay.games.length - 1] = structuredClone(game);
  }
  return db;
}
