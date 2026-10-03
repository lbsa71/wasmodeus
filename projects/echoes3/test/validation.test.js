import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, currentGame, startGame, humanMove, advanceGhost } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";

function example() { return advanceGhost(humanMove(startGame(createDatabase(), { initialPosition: "(()())" }), [0])); }

test("pending decisions, passes, abandonment and terminal outcomes round-trip exactly", () => {
  let db = humanMove(startGame(createDatabase(), { initialPosition: "(()())" }), [0]);
  assert.deepEqual(validateDatabase(db), db);
  db = advanceGhost(db);
  const copy = validateDatabase(db);
  assert.deepEqual(copy, db);
  assert.notEqual(copy.games, db.games);
  db = humanMove(db, [0]);
  assert.deepEqual(validateDatabase(db), db);
  db = advanceGhost(humanMove(startGame(db, { initialPosition: "(()())" }), [0]));
  assert.equal(currentGame(db).status, "ghost");
  assert.deepEqual(validateDatabase(db), db);
});

test("forged state, source, discovery, outcome, turn and frozen archive membership reject", () => {
  for (const mutate of [
    game => { game.position = "((()))"; },
    game => { game.turns[0].after = "()"; },
    game => { game.turns[1].discovery = false; },
    game => { game.turns[1].actor = 1; },
    game => { game.turns[1].move = [0]; },
    game => { game.turns[0].source = { gameId: game.id, turnIndex: 0 }; },
    game => { game.status = "human"; game.turn = 0; },
    game => { game.archiveIds.push(game.id); },
  ]) {
    const db = example();
    mutate(currentGame(db));
    assert.throws(() => validateDatabase(db));
  }
});

test("a known reply cannot be replaced by a pass or a forged provenance", () => {
  let db = humanMove(example(), [0]);
  db = advanceGhost(humanMove(startGame(db, { initialPosition: "(()())" }), [0]));
  const fake = structuredClone(db);
  currentGame(fake).turns[1].source.turnIndex = 0;
  assert.throws(() => validateDatabase(fake));
  const pass = structuredClone(db);
  const game = currentGame(pass);
  game.turns[1] = { actor: 2, move: null, before: "(())", after: "(())", source: null, discovery: false };
  game.position = "(())"; game.status = "playing"; game.turn = 1; game.endedAt = null;
  assert.throws(() => validateDatabase(pass));
});

test("a match with more than 128 recorded actions remains valid without a gameplay cap", () => {
  let db = startGame(createDatabase(), { initialPosition: `(${'()'.repeat(66)})` });
  for (let i = 0; i < 66; i += 1) {
    db = humanMove(db, [0]);
    if (currentGame(db).turn === 2) db = advanceGhost(db);
  }
  assert.equal(currentGame(db).turns.length, 131);
  assert.deepEqual(validateDatabase(db), db);
});

test("there can only be one playing match and metadata cannot redirect the active game", () => {
  const db = startGame(example());
  const multiple = structuredClone(db);
  multiple.games[0].status = "playing";
  multiple.games[0].turn = 1;
  multiple.games[0].endedAt = null;
  assert.throws(() => validateDatabase(multiple));
  const stale = structuredClone(db);
  stale.activeGameId = stale.games[0].id;
  assert.throws(() => validateDatabase(stale));
});
