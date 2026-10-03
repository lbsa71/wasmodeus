import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame, archiveReplies } from "../src/core/game.js";
import { canonicalKey, transformBoard, transformMove } from "../src/core/symmetry.js";
import { opening, legalMoves } from "../src/core/rules.js";
const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };
const W = { from: { x: 2, y: 0 }, to: { x: 3, y: 1 } };

function wonFirstGame() {
  return advanceGhost(humanMove(startGame(createDatabase()), Y));
}
test("first game wins; its own pending moves never become ghost knowledge", () => {
  const fresh = startGame(createDatabase());
  const pending = humanMove(fresh, Y);
  assert.equal(currentGame(pending).turn, "ghost");
  assert.equal(archiveReplies(pending, currentGame(pending).board).length, 0);
  const won = advanceGhost(pending);
  assert.equal(currentGame(won).status, "won");
  assert.equal(currentGame(fresh).moves.length, 0);
});
test("game two repeats Y, gets transformed Y as Z, and escapes through W", () => {
  const db = wonFirstGame();
  const game2 = advanceGhost(humanMove(startGame(db), Y));
  const ghost = currentGame(game2).moves[1];
  assert.equal(ghost.actor, "ghost");
  assert.equal(ghost.source.gameId, db.games[0].id);
  assert.deepEqual(ghost.move, { from: { x: 0, y: 1 }, to: { x: 1, y: 2 } });
  assert.equal(currentGame(advanceGhost(humanMove(game2, W))).status, "won");
});
test("the next encounter starts at the unanswered frontier and a human teaches its missing response", () => {
  let db = wonFirstGame();
  db = advanceGhost(humanMove(startGame(db), Y));
  db = advanceGhost(humanMove(db, W));
  const frontier = canonicalKey(currentGame(db).board);
  db = startGame(db);
  assert.equal(canonicalKey(currentGame(db).board), frontier);
  assert.equal(currentGame(db).moves.length, 0, "the living player answers the previous winning endpoint");
  const reply = legalMoves(currentGame(db).board)[0];
  db = advanceGhost(humanMove(db, reply));
  const next = startGame(db);
  assert.ok(archiveReplies(next, db.games[1].board).length > 0, "previous frontier now has a recorded answer");
});
test("the user's exact repeated corner move cannot win the same discovery twice", () => {
  const repeated = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
  let db = advanceGhost(humanMove(startGame(createDatabase()), repeated));
  const frontier = currentGame(db).board;
  const next = startGame(db);
  assert.equal(canonicalKey(currentGame(next).board), canonicalKey(frontier));
  assert.deepEqual(currentGame(next).initialBoard, frontier);
  // Even if this old opening is explicitly replayed, it is no longer a discovery.
  db = advanceGhost(humanMove(startGame(db, { initialBoard: opening() }), repeated));
  assert.equal(currentGame(db).status, "playing");
  assert.equal(currentGame(db).turn, "human");
  assert.deepEqual(currentGame(db).handoffs, [1]);
  assert.equal(currentGame(db).moves.length, 1, "never invent an archived answer");
  db = advanceGhost(humanMove(db, legalMoves(currentGame(db).board)[0]));
  assert.ok(currentGame(db).moves.filter(m => m.actor === "human").length >= 2);
});
test("mirrored and rotated versions of an already discovered frontier cannot earn duplicate wins", () => {
  const repeated = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
  const learned = advanceGhost(humanMove(startGame(createDatabase()), repeated));
  for (let orientation = 0; orientation < 8; orientation++) {
    const t = { orientation, dx: 10, dy: -9 };
    const db = advanceGhost(humanMove(startGame(learned, { initialBoard: transformBoard(opening(), t) }), transformMove(repeated, t)));
    assert.notEqual(currentGame(db).status, "won");
    assert.equal(currentGame(db).turn, "human");
  }
});
test("the archive holds at the turn limit if a previously discovered frontier still has no answer", () => {
  const repeated = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
  const learned = advanceGhost(humanMove(startGame(createDatabase()), repeated));
  const db = advanceGhost(humanMove(startGame(learned, { initialBoard: opening(), turnLimit: 1 }), repeated));
  assert.equal(currentGame(db).status, "held");
});
test("pending ghost turns survive serialization, limits hold only after an available reply, and snapshots freeze", () => {
  let db = wonFirstGame();
  db = startGame(db, { turnLimit: 1 });
  const ids = [...currentGame(db).archiveGameIds];
  db = humanMove(db, Y);
  db = advanceGhost(JSON.parse(JSON.stringify(db)));
  assert.equal(currentGame(db).status, "held");
  assert.deepEqual(currentGame(db).archiveGameIds, ids);
  assert.throws(() => humanMove(db, Y));
});
test("starting another encounter preserves and archives every abandoned move", () => {
  const pending = humanMove(startGame(createDatabase()), Y);
  const next = startGame(pending);
  assert.equal(next.games[0].status, "abandoned");
  assert.equal(next.games[0].moves.length, 1);
  assert.ok(currentGame(next).archiveGameIds.includes(next.games[0].id));
});
