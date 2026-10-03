import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBoard, matchPattern, archiveReplies } from "../src/core/history.js";
import { createDatabase, startGame, humanMove, currentGame } from "../src/core/game.js";

function board(entries) {
  const cells = Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 }));
  for (const [index, owner, charge] of entries) cells[index] = { owner, charge };
  return { size: 5, cells };
}

test("human local memories transfer to ghost colours through rotation and preserve boundaries", () => {
  const source = board([[6, 1, 1], [7, 2, 2], [1, 1, 3]]);
  const target = board([[18, 2, 1], [17, 1, 2], [23, 2, 3]]);
  assert.equal(matchPattern(source, 6, target, 18, 2), true);
  target.cells[0] = { owner: 1, charge: 3 };
  assert.equal(matchPattern(source, 6, target, 18, 2), true, "distant context does not erase a local memory");
  assert.equal(matchPattern(source, 6, target, 18, 0), false);
  target.cells[17].charge = 1;
  assert.equal(matchPattern(source, 6, target, 18, 2), false);
  assert.equal(matchPattern(board([[0, 1, 1]]), 0, board([[6, 2, 1]]), 6, 0), false);
});

test("the full-state key folds rotations but keeps charge and colour differences", () => {
  const original = board([[6, 1, 1], [7, 2, 2], [1, 1, 3]]);
  const rotated = board([[18, 1, 1], [17, 2, 2], [23, 1, 3]]);
  assert.equal(canonicalBoard(original), canonicalBoard(rotated));
  rotated.cells[23].charge = 2;
  assert.notEqual(canonicalBoard(original), canonicalBoard(rotated));
  assert.notEqual(canonicalBoard(original), canonicalBoard(board([[6, 2, 1], [7, 1, 2], [1, 2, 3]])));
});

test("only prior real human moves teach replies; one new move cannot teach the active match", () => {
  const initial = board([[6, 1, 1], [18, 2, 1]]);
  let db = startGame(createDatabase(), { initialBoard: initial });
  db = humanMove(db, 6);
  assert.deepEqual(archiveReplies(db, currentGame(db).board), []);
  const sourceId = currentGame(db).id;
  db = startGame(db, { initialBoard: initial });
  const replies = archiveReplies(db, initial);
  assert.deepEqual(replies.map(reply => reply.move), [18]);
  assert.equal(replies[0].source.gameId, sourceId);
  assert.equal(replies[0].source.turnIndex, 0);
  assert.equal(currentGame(db).archiveIds.includes(currentGame(db).id), false);
});

test("a recorded winning reply is ranked ahead of an ordinary recorded charge", () => {
  let db = humanMove(startGame(createDatabase(), { initialBoard: board([[6, 1, 3], [7, 2, 1], [24, 2, 1]]) }), 6);
  db = humanMove(startGame(db, { initialBoard: board([[6, 1, 1], [24, 2, 1]]) }), 6);
  const target = board([[6, 2, 1], [18, 2, 3], [19, 1, 1]]);
  db = startGame(db, { initialBoard: target });
  assert.deepEqual(archiveReplies(db, target).map(reply => reply.move), [18, 6]);
});
