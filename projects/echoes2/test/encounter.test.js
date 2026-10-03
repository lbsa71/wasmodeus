import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, currentGame, startGame, startEncounter, humanMove, advanceGhost, archiveReplies } from "../src/core/game.js";
import { swapColours, safeOpening } from "../src/core/encounter.js";
import { opening, legalMoves } from "../src/core/rules.js";
import { canonicalBoard } from "../src/core/history.js";
import { validateDatabase } from "../src/storage/validation.js";

function centreWin() {
  let db = startGame(createDatabase());
  for (let i = 0; i < 4; i += 1) {
    db = humanMove(db, 12);
    if (currentGame(db).turn === 2) db = advanceGhost(db);
  }
  assert.equal(currentGame(db).status, "human");
  return db;
}

test("a fresh encounter falls back to the fixed opening and never takes a still-playing source", () => {
  let db = startEncounter(createDatabase());
  assert.deepEqual(currentGame(db).initialBoard, opening());
  assert.equal(currentGame(db).startSource, undefined);
  db = advanceGhost(humanMove(db, 12));
  const pending = structuredClone(db);
  db = startEncounter(db);
  assert.deepEqual(currentGame(db).initialBoard, opening());
  assert.equal(currentGame(db).startSource, undefined);
  assert.equal(currentGame(pending).status, "playing");
});

test("a centre-only victory restarts at a safe unanswered position with exchanged colours", () => {
  const old = centreWin();
  const previous = currentGame(old);
  const db = startEncounter(old);
  const game = currentGame(db);
  assert.deepEqual(game.startSource, { gameId: previous.id, turnIndex: 3 });
  assert.deepEqual(game.initialBoard, swapColours(previous.turns[3].after));
  assert.equal(safeOpening(game.initialBoard), true);
  assert.equal(safeOpening(swapColours(previous.turns[5].after)), false);
  assert.equal(currentGame(old).id, previous.id);
  assert.deepEqual(validateDatabase(db), db);
});

test("playing the ghost's stuck perspective teaches an applicable future response", () => {
  let db = centreWin();
  const stuck = currentGame(db).turns[3].after;
  db = startEncounter(db);
  assert.equal(legalMoves(currentGame(db).board, 1).includes(13), true);
  const teacher = currentGame(db).id;
  db = humanMove(db, 13);
  db = startGame(db, { initialBoard: stuck });
  assert.equal(archiveReplies(db, stuck).some(reply => reply.move === 13 && reply.source.gameId === teacher), true);
  assert.deepEqual(validateDatabase(db), db);
});

test("restarts prefer less-used positions and avoid the previous opening when another is available", () => {
  let db = centreWin();
  const source = currentGame(db);
  const newer = swapColours(source.turns[3].after);
  const older = swapColours(source.turns[1].after);
  db = startEncounter(db);
  assert.deepEqual(currentGame(db).initialBoard, newer);
  db = startEncounter(db);
  assert.deepEqual(currentGame(db).initialBoard, older);
  db = startGame(db, { initialBoard: newer });
  db = startGame(db);
  db = startEncounter(db);
  assert.deepEqual(currentGame(db).initialBoard, older);
  assert.notEqual(canonicalBoard(older), canonicalBoard(newer));
});

test("source markers must cite an exact safe colour-swapped frozen ghost pass", () => {
  const valid = startEncounter(centreWin());
  for (const mutation of [
    game => { game.startSource.gameId = game.id; },
    game => { game.startSource.turnIndex = 0; },
    game => { game.startSource.turnIndex = 1; },
    game => { game.startSource = null; },
  ]) {
    const db = structuredClone(valid);
    mutation(currentGame(db));
    assert.throws(() => validateDatabase(db));
  }
  const archive = centreWin();
  const source = currentGame(archive);
  const unsafe = startGame(archive, { initialBoard: swapColours(source.turns[5].after) });
  currentGame(unsafe).startSource = { gameId: source.id, turnIndex: 5 };
  assert.throws(() => validateDatabase(unsafe));
  delete currentGame(unsafe).startSource;
  assert.deepEqual(validateDatabase(unsafe), unsafe, "unmarked existing saves keep their original rules");
});
