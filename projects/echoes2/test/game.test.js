import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, currentGame, startGame, humanMove, advanceGhost, discoveryScore, matchScore } from "../src/core/game.js";

function board(entries) {
  const cells = Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 }));
  for (const [index, owner, charge] of entries) cells[index] = { owner, charge };
  return { size: 5, cells };
}

test("a fresh archive passes, awards a discovery, and keeps the same match and board", () => {
  const input = createDatabase();
  let db = startGame(input, { initialBoard: board([[6, 1, 1], [18, 2, 1]]) });
  const id = currentGame(db).id;
  db = humanMove(db, 6);
  const pending = structuredClone(db);
  db = advanceGhost(db);
  assert.equal(currentGame(db).id, id);
  assert.equal(currentGame(db).turn, 1);
  assert.deepEqual(currentGame(db).board, currentGame(pending).board);
  assert.deepEqual(currentGame(db).turns.at(-1), {
    actor: 2, move: null, before: currentGame(pending).board, after: currentGame(pending).board, source: null, discovery: true
  });
  assert.equal(discoveryScore(db), 1);
  assert.equal(currentGame(pending).turn, 2);
  assert.equal(input.games.length, 0);
});

test("an archived human action becomes a visible legal ghost action in the next match", () => {
  const initialBoard = board([[6, 1, 1], [18, 2, 1]]);
  let db = humanMove(startGame(createDatabase(), { initialBoard }), 6);
  const sourceId = currentGame(db).id;
  db = startGame(db, { initialBoard });
  db = advanceGhost(humanMove(db, 6));
  const game = currentGame(db);
  assert.equal(game.turns.at(-1).move, 18);
  assert.equal(game.turns.at(-1).source.gameId, sourceId);
  assert.equal(game.board.cells[18].charge, 2);
  assert.equal(game.turns.at(-1).discovery, false);
  assert.equal(discoveryScore(db), 0);
});

test("repeated unanswered states do not farm discoveries, while passing is still allowed", () => {
  const initialBoard = board([[6, 1, 1], [18, 2, 3]]);
  let db = advanceGhost(humanMove(startGame(createDatabase(), { initialBoard }), 6));
  assert.equal(discoveryScore(db), 1);
  db = advanceGhost(humanMove(startGame(db, { initialBoard }), 6));
  assert.equal(currentGame(db).turns.at(-1).move, null);
  assert.equal(currentGame(db).turns.at(-1).discovery, false);
  assert.equal(discoveryScore(db), 1);
});

test("elimination ends immediately and skips the ghost; the turn budget first lets the ghost respond", () => {
  let db = startGame(createDatabase(), { initialBoard: board([[6, 1, 3], [7, 2, 1]]) });
  db = humanMove(db, 6);
  assert.equal(currentGame(db).status, "human");
  assert.equal(currentGame(db).turn, 0);
  assert.deepEqual(matchScore(db), { human: 1, ghost: 0, draw: 0 });
  assert.throws(() => advanceGhost(db));
  db = startGame(db, { initialBoard: board([[6, 1, 1], [18, 2, 1]]), limit: 1 });
  db = humanMove(db, 6);
  assert.equal(currentGame(db).status, "playing");
  assert.equal(currentGame(db).turn, 2);
  db = advanceGhost(db);
  assert.equal(currentGame(db).status, "draw");
  assert.equal(currentGame(db).turn, 0);
});

test("turn order, illegal actions and limits reject without changing input", () => {
  assert.throws(() => currentGame(createDatabase()));
  const db = startGame(createDatabase());
  const snapshot = structuredClone(db);
  assert.throws(() => advanceGhost(db));
  assert.throws(() => humanMove(db, -1));
  assert.throws(() => startGame(db, { limit: 0 }));
  assert.deepEqual(db, snapshot);
});

test("the real opening learns a human charge in one match and replays it as amber in the next", () => {
  let db = humanMove(startGame(createDatabase()), 11);
  const sourceId = currentGame(db).id;
  db = startGame(db);
  db = advanceGhost(humanMove(db, 11));
  const reply = currentGame(db).turns.at(-1);
  assert.equal(reply.move, 13);
  assert.equal(reply.source.gameId, sourceId);
  assert.equal(reply.after.cells[13].owner, 2);
  assert.equal(reply.after.cells[13].charge, 3);
});
