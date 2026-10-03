import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame, continueEncounter, discoveryScore } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";
import { transformBoard } from "../src/core/symmetry.js";
import { GameController } from "../src/controller.js";
const move = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
const won = () => advanceGhost(humanMove(startGame(createDatabase()), move));

test("a discovery rewinds one move, then the ghost replays that exact human decision", () => {
  const previous = won();
  const original = structuredClone(previous);
  const next = continueEncounter(previous);
  assert.equal(currentGame(next).turn, "ghost");
  assert.deepEqual(currentGame(next).board, currentGame(previous).moves.at(-1).before);
  assert.equal(discoveryScore(next), 1);
  assert.doesNotThrow(() => validateDatabase(next));
  const answered = advanceGhost(next);
  const game = currentGame(answered);
  assert.equal(game.turn, "human");
  assert.equal(game.humanTurns, 0);
  assert.deepEqual(game.board, currentGame(previous).board);
  assert.deepEqual(game.moves[0].move, move);
  assert.equal(game.moves[0].source.gameId, currentGame(previous).id);
  assert.doesNotThrow(() => validateDatabase(answered));
  assert.throws(() => continueEncounter(answered), /finished/i);
  assert.deepEqual(previous, original);
});

test("points count unique discoveries, including rotated legacy duplicate wins", () => {
  const db = won();
  const copy = structuredClone(db.games[0]);
  copy.id = "legacy-duplicate";
  copy.board = transformBoard(copy.board, { orientation: 5, dx: 17, dy: -9 });
  db.games.push(copy);
  assert.equal(discoveryScore(db), 1);
  assert.equal(discoveryScore(continueEncounter(won())), 1);
});

test("continuation saves rewind and replay separately; an interrupted replay resumes without duplicate points", async () => {
  let disk = won();
  let failReplay = true;
  const storage = {
    load: async () => structuredClone(disk),
    save: async db => {
      if (failReplay && currentGame(db).moves[0]?.actor === "ghost") throw new Error("Interrupted replay");
      disk = validateDatabase(db); disk.revision++; return structuredClone(disk);
    },
  };
  const controller = new GameController(storage);
  await controller.load();
  await assert.rejects(controller.continueGame(), /Interrupted replay/);
  assert.equal(disk.games.length, 2);
  assert.equal(currentGame(disk).turn, "ghost");
  assert.equal(discoveryScore(disk), 1);
  failReplay = false;
  const resumed = new GameController(storage);
  await resumed.load();
  assert.equal(currentGame(resumed.database).turn, "human");
  assert.deepEqual(currentGame(resumed.database).board, disk.games[0].board);
  assert.equal(disk.games.length, 2);
  assert.equal(discoveryScore(disk), 1);
});
