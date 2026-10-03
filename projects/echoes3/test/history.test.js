import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";
import { archiveReplies } from "../src/core/history.js";
import { opening, legalMoves } from "../src/core/rules.js";

test("only earlier human actions in the exact canonical position teach the ghost", () => {
  let db = humanMove(startGame(createDatabase(), { initialPosition: "(()())" }), [0]);
  assert.deepEqual(archiveReplies(db, "(()())"), []);
  const teacher = currentGame(db).id;
  db = startGame(db);
  const replies = archiveReplies(db, "(()())");
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0], { move: [0], after: "(())", source: { gameId: teacher, turnIndex: 0 }, wins: 0, losses: 0 });
  assert.deepEqual(archiveReplies(db, "((()))"), [], "same size and similar shape are insufficient");
});

test("symmetric cuts share one child outcome while provenance keeps a real recorded path", () => {
  let db = humanMove(startGame(createDatabase(), { initialPosition: "(()())" }), [1]);
  const teacher = currentGame(db).id;
  db = humanMove(startGame(db, { initialPosition: "(()())" }), [0]);
  db = startGame(db);
  const replies = archiveReplies(db, "(()())");
  assert.equal(replies.length, 1);
  assert.deepEqual(replies[0].move, [1]);
  assert.equal(replies[0].source.gameId, teacher);
});

test("replies favour actual human victories while unfinished games still teach legal choices", () => {
  let db = humanMove(startGame(createDatabase()), [1]);
  db = humanMove(startGame(db), [0, 1]);
  while (currentGame(db).status === "playing") {
    if (currentGame(db).turn === 2) db = advanceGhost(db);
    else db = humanMove(db, legalMoves(currentGame(db).position).at(-1));
  }
  assert.equal(currentGame(db).status, "human");
  db = startGame(db);
  const replies = archiveReplies(db, opening());
  assert.deepEqual(replies[0].move, [0, 1]);
  assert.equal(replies[0].wins, 1);
  assert.equal(replies[0].losses, 0);
  assert.equal(replies[1].wins, 0);
});
