import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, startEncounter, growOpening, currentGame, humanMove, advanceGhost } from "../src/core/game.js";
import { eligibleOpening } from "../src/core/encounter.js";
import { opening, pieceCount, validPosition } from "../src/core/rules.js";
import { validateDatabase } from "../src/storage/validation.js";

function archivedPass() {
  let db = advanceGhost(humanMove(startGame(createDatabase()), [1]));
  const source = currentGame(db).id;
  db = advanceGhost(humanMove(db, [0, 1]));
  db = startGame(db);
  return { db, source };
}

function twoFrontiers() {
  let db = advanceGhost(humanMove(startGame(createDatabase()), [1]));
  const older = currentGame(db).position;
  db = advanceGhost(humanMove(startGame(db), [0, 0, 0]));
  const newer = currentGame(db).position;
  db = startGame(db);
  return { db, older, newer };
}

test("encounters fall back to opening and preserve a qualifying historical pass exactly", () => {
  assert.equal(currentGame(startEncounter(createDatabase())).position, opening());
  let playing = advanceGhost(humanMove(startGame(createDatabase()), [1]));
  playing = startEncounter(playing);
  assert.equal(currentGame(playing).startSource, undefined);
  const { db: archive, source } = archivedPass();
  const db = startEncounter(archive);
  assert.deepEqual(currentGame(db).startSource, { gameId: source, turnIndex: 1 });
  assert.equal(currentGame(db).initialPosition, archive.games[0].turns[1].after);
  assert.deepEqual(validateDatabase(db), db);
});

test("restart seeds need several pieces and genuinely distinct choices", () => {
  assert.equal(eligibleOpening("(()()()())"), false, "four symmetric leaves still have only one child outcome");
  assert.equal(eligibleOpening("((())())"), false, "too few pieces");
  assert.equal(eligibleOpening(opening()), true);
});

test("unanswered frontiers outrank explored ones, with newness and reuse breaking ties", () => {
  const { db: archive, older, newer } = twoFrontiers();
  assert.equal(currentGame(startEncounter(archive)).initialPosition, newer, "equally unexplored starts favour newer evidence");
  let used = startGame(archive, { initialPosition: newer });
  used = startGame(used);
  assert.equal(currentGame(startEncounter(used)).initialPosition, older, "a used seed loses to an equally unexplored unused seed");
  let taught = humanMove(startGame(archive, { initialPosition: newer }), [0, 0]);
  taught = startGame(taught);
  assert.equal(currentGame(startEncounter(taught)).initialPosition, older, "actual recorded child coverage lowers restart priority");
  const next = startEncounter(startEncounter(archive));
  assert.equal(currentGame(next).initialPosition, older, "another viable seed replaces the preceding opening");
});

test("growing an opening adds one piece within a branch without a fixed size cap", () => {
  for (const initial of [opening(), "(()())", "()", `(${'()'.repeat(200)})`]) {
    const grown = growOpening(initial);
    assert.equal(validPosition(grown), true);
    assert.equal(pieceCount(grown), pieceCount(initial) + (initial === opening() ? 1 : 2));
  }
  assert.throws(() => growOpening("(()(()))"));
});

test("restart provenance cannot name a different position, human move, current match or trivial pass", () => {
  const { db: archive } = archivedPass();
  const valid = startEncounter(archive);
  for (const mutate of [
    game => { game.startSource.turnIndex = 0; },
    game => { game.startSource.gameId = game.id; },
    game => { game.startSource = null; },
  ]) {
    const db = structuredClone(valid); mutate(currentGame(db));
    assert.throws(() => validateDatabase(db));
  }
});
