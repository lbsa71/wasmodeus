import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, currentGame, startGame, humanMove, advanceGhost, discoveryScore, matchScore } from "../src/core/game.js";

test("unknown exact positions cause an honest pass and the next human action teaches that missing response", () => {
  const fresh = createDatabase();
  let db = humanMove(startGame(fresh, { initialPosition: "(()())" }), [0]);
  const pending = structuredClone(db);
  db = advanceGhost(db);
  assert.deepEqual(currentGame(db).turns.at(-1), { actor: 2, move: null, before: "(())", after: "(())", source: null, discovery: true });
  assert.equal(currentGame(db).turn, 1);
  assert.equal(discoveryScore(db), 1);
  db = humanMove(db, [0]);
  assert.equal(currentGame(db).status, "human");
  db = humanMove(startGame(db, { initialPosition: "(()())" }), [1]);
  db = advanceGhost(db);
  assert.equal(currentGame(db).status, "ghost");
  assert.deepEqual(currentGame(db).turns.at(-1).move, [0]);
  assert.deepEqual(matchScore(db), { human: 1, ghost: 1 });
  assert.equal(currentGame(pending).turn, 2);
  assert.equal(fresh.games.length, 0);
});

test("repeated unknown positions pass again without awarding another discovery", () => {
  let db = advanceGhost(humanMove(startGame(createDatabase(), { initialPosition: "(()())" }), [0]));
  db = advanceGhost(humanMove(startGame(db, { initialPosition: "(()())" }), [1]));
  assert.equal(currentGame(db).turns.at(-1).move, null);
  assert.equal(currentGame(db).turns.at(-1).discovery, false);
  assert.equal(discoveryScore(db), 1);
});

test("last cutter wins immediately, turn order is strict, and only canonical live seeds can start", () => {
  assert.throws(() => currentGame(createDatabase()));
  let db = startGame(createDatabase(), { initialPosition: "(())" });
  assert.throws(() => advanceGhost(db));
  assert.throws(() => humanMove(db, []));
  db = humanMove(db, [0]);
  assert.equal(currentGame(db).status, "human");
  assert.equal(currentGame(db).turn, 0);
  assert.equal(currentGame(db).turns.length, 1);
  assert.throws(() => humanMove(db, [0]));
  assert.throws(() => advanceGhost(db));
  for (const initialPosition of ["()", "(()(()))", "(broken)"]) assert.throws(() => startGame(db, { initialPosition }));
});

test("starting another match preserves and abandons unfinished progress", () => {
  const input = humanMove(startGame(createDatabase()), [1]);
  const db = startGame(input);
  assert.equal(db.games[0].status, "abandoned");
  assert.equal(db.games[0].turn, 0);
  assert.deepEqual(currentGame(db).archiveIds, [input.activeGameId]);
  assert.deepEqual(db.games[0].turns, input.games[0].turns);
  assert.equal(input.games[0].status, "playing");
});
