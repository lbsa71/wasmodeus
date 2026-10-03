import test from "node:test";
import assert from "node:assert/strict";
import { continueAgainstArchive } from "../src/core/continuation.js";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame, continueEncounter, discoveryScore, previouslyEncountered } from "../src/core/game.js";
import { applyMove, legalMoves } from "../src/core/rules.js";
import { validateDatabase } from "../src/storage/validation.js";

const firstMove = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
const firstDiscovery = (turnLimit = 12) => advanceGhost(humanMove(startGame(createDatabase(), { turnLimit }), firstMove));

function threeDiscoveries() {
  let db = firstDiscovery(7);
  for (let i = 0; i < 2; i++) {
    db = advanceGhost(continueEncounter(db));
    const move = legalMoves(currentGame(db).board).find(move => !previouslyEncountered(db, applyMove(currentGame(db).board, move)));
    assert.ok(move, "the fixture can reach another undiscovered frontier");
    db = advanceGhost(humanMove(db, move));
    assert.equal(currentGame(db).status, "won");
  }
  return db;
}

test("restart at the most recent human decision whose result the archive can actually answer", () => {
  const history = threeDiscoveries();
  const untouched = structuredClone(history);
  const candidate = history.games[1].moves.at(-1);
  const next = continueAgainstArchive(history);
  const game = currentGame(next);
  assert.deepEqual(game.board, candidate.before);
  assert.deepEqual(game.initialBoard, candidate.before);
  assert.equal(game.turn, "human");
  assert.equal(game.status, "playing");
  assert.equal(game.openingSource, undefined, "the player acts before the archive responds");
  assert.equal(game.moves.length, 0);
  assert.equal(game.humanTurns, 0);
  assert.equal(game.turnLimit, 7);
  assert.deepEqual(game.archiveGameIds, history.games.map(g => g.id));
  assert.deepEqual(history, untouched, "the restart preserves the entire prior database");
  assert.doesNotThrow(() => validateDatabase(next));
});

test("repeating the chosen decision gets a genuine recorded reply without another discovery point", () => {
  const history = threeDiscoveries();
  const candidate = history.games[1].moves.at(-1);
  const next = continueAgainstArchive(history);
  const pending = humanMove(next, candidate.move);
  const recovered = validateDatabase(JSON.parse(JSON.stringify(pending)));
  const answered = advanceGhost(recovered);
  const game = currentGame(answered);
  assert.deepEqual(game.moves.map(m => m.actor), ["human", "ghost"]);
  assert.equal(game.moves[1].source.gameId, history.games[2].id);
  assert.equal(game.moves[1].source.moveIndex, history.games[2].moves.length - 1);
  assert.equal(game.turn, "human");
  assert.equal(game.status, "playing");
  assert.equal(discoveryScore(answered), discoveryScore(history));
  assert.deepEqual(validateDatabase(JSON.parse(JSON.stringify(answered))), answered);
});

test("the newest answered decision is preferred, including one from the latest finished encounter", () => {
  // This legal move produces an equivalent marked board, so its own archived decision answers it.
  const move = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };
  const history = advanceGhost(humanMove(startGame(createDatabase()), move));
  const next = continueAgainstArchive(history);
  assert.equal(currentGame(next).turn, "human");
  assert.deepEqual(currentGame(next).board, currentGame(history).moves[0].before);
  const answered = advanceGhost(humanMove(next, move));
  assert.equal(currentGame(answered).moves[1].actor, "ghost");
  assert.notEqual(currentGame(answered).moves[1].source.transform.orientation, 0);
  assert.doesNotThrow(() => validateDatabase(answered));
});

test("an archive without an answered result falls back to the single-step learning echo", () => {
  const history = firstDiscovery(3);
  const next = continueAgainstArchive(history);
  const game = currentGame(next);
  assert.equal(game.turn, "ghost");
  assert.equal(game.openingSource.gameId, currentGame(history).id);
  assert.equal(game.turnLimit, 3);
  assert.deepEqual(game.board, currentGame(history).moves.at(-1).before);
  assert.deepEqual(currentGame(advanceGhost(next)).board, currentGame(history).board);
  assert.doesNotThrow(() => validateDatabase(next));
});

test("an active encounter cannot be replaced by an automatic archive restart", () => {
  const playing = startGame(createDatabase());
  assert.throws(() => continueAgainstArchive(playing), /finished/i);
});
