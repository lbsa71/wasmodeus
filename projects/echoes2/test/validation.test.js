import test from "node:test";
import assert from "node:assert/strict";
import { validateDatabase } from "../src/storage/validation.js";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";

function board(entries) {
  const cells = Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 }));
  for (const [index, owner, charge] of entries) cells[index] = { owner, charge };
  return { size: 5, cells };
}

function passingDatabase() {
  return advanceGhost(humanMove(startGame(createDatabase(), { initialBoard: board([[6, 1, 1], [18, 2, 3]]) }), 6));
}

test("full saves validate and clone both pending and answered states", () => {
  let db = humanMove(startGame(createDatabase(), { initialBoard: board([[6, 1, 1], [18, 2, 1]]) }), 6);
  assert.deepEqual(validateDatabase(db), db);
  db = advanceGhost(db);
  const restored = validateDatabase(db);
  assert.deepEqual(restored, db);
  assert.notEqual(restored.games, db.games);
  db = startGame(db);
  assert.deepEqual(validateDatabase(db), db);
});

test("forged moves, colours, discoveries, sequence, outcome and archive membership are rejected", () => {
  const mutations = [
    game => { game.turns[0].after.cells[6].owner = 2; },
    game => { game.turns[1].discovery = false; },
    game => { game.turns[0].move = 18; },
    game => { game.turns[1].actor = 1; },
    game => { game.status = "human"; game.turn = 0; },
    game => { game.archiveIds.push(game.id); },
    game => { game.humanTurns += 1; },
    game => { game.board.cells[0].charge = 4; },
    game => { delete game.limit; },
  ];
  for (const mutate of mutations) {
    const db = passingDatabase();
    mutate(currentGame(db));
    assert.throws(() => validateDatabase(db));
  }
});

test("ghost actions must cite an actual frozen human memory and passes cannot ignore it", () => {
  const initialBoard = board([[6, 1, 1], [18, 2, 1]]);
  let db = humanMove(startGame(createDatabase(), { initialBoard }), 6);
  db = advanceGhost(humanMove(startGame(db, { initialBoard }), 6));
  assert.deepEqual(validateDatabase(db), db);
  const forged = structuredClone(db);
  currentGame(forged).turns[1].source.turnIndex = 99;
  assert.throws(() => validateDatabase(forged));
  const pass = structuredClone(db);
  const game = currentGame(pass);
  game.turns[1] = { actor: 2, move: null, before: game.turns[1].before, after: game.turns[1].before, source: null, discovery: true };
  game.board = game.turns[1].after;
  assert.throws(() => validateDatabase(pass));
});

test("a save cannot keep an earlier match active alongside the current match", () => {
  let db = humanMove(startGame(createDatabase()), 11);
  db = startGame(db);
  db.games[0].status = "playing";
  db.games[0].turn = 2;
  db.games[0].endedAt = null;
  assert.throws(() => validateDatabase(db));
});
