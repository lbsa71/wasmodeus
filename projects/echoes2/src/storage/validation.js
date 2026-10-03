import { validBoard } from "../core/rules.js";
import { createDatabase, startGame, currentGame, humanMove, advanceGhost } from "../core/game.js";
import { swapColours, safeOpening } from "../core/encounter.js";

/** @typedef {import('../core/types.js').Database} Database */

/** @param {unknown} condition @param {string} message @returns {asserts condition} */
function ensure(condition, message) {
  if (!condition) throw new Error(`Invalid Echoes2 save: ${message}`);
}

/** @param {unknown} value */
function date(value) {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

/** Compare JSON data independently of object property order.
 * @param {unknown} left @param {unknown} right @returns {boolean}
 */
function same(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const a = /** @type {Record<string, unknown>} */ (left);
  const b = /** @type {Record<string, unknown>} */ (right);
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}

/** Validate the complete history by replaying every accepted action against its frozen archive.
 * @param {unknown} input @returns {Database}
 */
export function validateDatabase(input) {
  ensure(input && typeof input === "object" && !Array.isArray(input), "database object required");
  const db = /** @type {Database} */ (structuredClone(input));
  ensure(db.schemaVersion === 1 && db.ruleset === "echoes2-charge-v1", "unsupported ruleset");
  ensure(Number.isSafeInteger(db.revision) && db.revision >= 0, "revision");
  ensure(date(db.createdAt) && date(db.updatedAt), "database dates");
  ensure(Array.isArray(db.games), "games array");
  ensure(db.activeGameId === (db.games.at(-1)?.id ?? null), "active game must be the latest game");
  const ids = new Set();
  let replay = createDatabase();
  for (const [index, game] of db.games.entries()) {
    ensure(game && typeof game === "object", "game object");
    ensure(typeof game.id === "string" && game.id.length > 0 && game.id.length <= 128 && !ids.has(game.id), "unique game id");
    ensure(date(game.createdAt), "game date");
    ensure(game.status !== "playing" || index === db.games.length - 1, "only the latest match can still be playing");
    ensure(validBoard(game.initialBoard) && validBoard(game.board), "stable game boards");
    ensure(Array.isArray(game.turns) && game.turns.length <= 128, "turn list");
    ensure(same(game.archiveIds, [...ids]), "frozen archive membership");
    ensure(Number.isInteger(game.humanTurns) && game.humanTurns >= 0, "human turn count");
    ensure(Number.isInteger(game.limit) && game.limit >= 1 && game.limit <= 64, "move limit");
    if (Object.hasOwn(game, "startSource")) {
      const source = game.startSource;
      ensure(source && typeof source === "object" && Number.isInteger(source.turnIndex) && source.turnIndex >= 0, "opening source");
      ensure(game.archiveIds.includes(source.gameId), "opening source belongs to the frozen archive");
      const oldGame = replay.games.find(old => old.id === source.gameId);
      const oldTurn = oldGame?.turns[source.turnIndex];
      ensure(oldTurn && oldTurn.actor === 2 && oldTurn.move === null, "opening source is a real ghost pass");
      ensure(same(game.initialBoard, swapColours(oldTurn.after)), "opening must exchange the source board's colours exactly");
      ensure(safeOpening(game.initialBoard), "opening cannot offer an immediate elimination");
    }
    replay = startGame(replay, { initialBoard: game.initialBoard, limit: game.limit });
    const initial = currentGame(replay);
    ensure(initial, "replay game");
    initial.id = game.id;
    replay.activeGameId = game.id;
    for (const turn of game.turns) {
      ensure(turn && (turn.actor === 1 || turn.actor === 2), "turn actor");
      ensure(validBoard(turn.before) && validBoard(turn.after), "stable turn boards");
      if (turn.actor === 1) {
        ensure(Number.isInteger(turn.move) && turn.move !== null, "human action");
        replay = humanMove(replay, turn.move);
      } else replay = advanceGhost(replay);
      const actual = currentGame(replay)?.turns.at(-1);
      ensure(same(turn, actual), "recorded action does not match replay");
    }
    const expected = currentGame(replay);
    ensure(expected, "replay outcome");
    if (game.status === "abandoned") {
      ensure(index < db.games.length - 1 && expected.status === "playing", "only an unfinished preceding match can be abandoned");
      expected.status = "abandoned";
      expected.turn = 0;
    }
    ensure(game.status === expected.status && game.turn === expected.turn, "outcome or next actor");
    ensure(same(game.board, expected.board) && game.humanTurns === expected.humanTurns, "final position or move count");
    ensure(game.status === "playing" ? game.endedAt === null : date(game.endedAt), "finish date");
    ids.add(game.id);
    // Preserve original metadata for the next game's source references.
    replay.games[replay.games.length - 1] = structuredClone(game);
  }
  return db;
}
