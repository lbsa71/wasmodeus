import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/controller.js";
import { createDatabase, startGame, humanMove, currentGame, advanceGhost } from "../src/core/game.js";
const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };

test("controller saves each human move before resolving and saving the ghost, and resumes pending turns", async () => {
  let disk = createDatabase();
  const writes = [];
  const storage = { load: async () => structuredClone(disk), save: async db => { disk = structuredClone(db); disk.revision++; writes.push(structuredClone(disk)); return disk; } };
  const controller = new GameController(storage);
  await controller.load();
  await controller.play(Y);
  assert.deepEqual(writes.map(db => currentGame(db).turn), ["human", "ghost", "finished"]);
  assert.equal(currentGame(disk).status, "won");
  disk = humanMove(startGame(disk), Y);
  const resumed = new GameController(storage);
  await resumed.load();
  assert.equal(currentGame(resumed.database).turn, "human");
  assert.equal(currentGame(resumed.database).moves[1].actor, "ghost");
});
test("failed writes leave the displayed game at the last committed state and retain every prior game", async () => {
  const original = startGame(advanceGhost(humanMove(startGame(createDatabase()), Y)));
  const controller = new GameController({ load: async () => original, save: async () => { throw new Error("Disk full"); } });
  await controller.load();
  await assert.rejects(controller.play(Y), /Disk full/);
  assert.deepEqual(controller.database, original);
  assert.equal(controller.busy, false);
});
test("a failed first save never publishes an encounter that was not committed", async () => {
  const controller = new GameController({ load: async () => createDatabase(), save: async () => { throw new Error("Read-only disk"); } });
  await assert.rejects(controller.load(), /Read-only disk/);
  assert.equal(controller.database, null);
  assert.equal(controller.busy, false);
});
test("failure to save the ghost preserves the human move and reload safely completes it", async () => {
  let disk = startGame(advanceGhost(humanMove(startGame(createDatabase()), Y)));
  let failGhost = true;
  const storage = {
    load: async () => structuredClone(disk),
    save: async db => {
      if (currentGame(db).moves.at(-1)?.actor === "ghost" && failGhost) throw new Error("Connection lost");
      disk = structuredClone(db); disk.revision++; return disk;
    },
  };
  const controller = new GameController(storage);
  await controller.load();
  await assert.rejects(controller.play(Y), /Connection lost/);
  assert.equal(currentGame(controller.database).turn, "ghost");
  assert.equal(currentGame(disk).moves.length, 1);
  failGhost = false;
  await controller.load();
  assert.equal(currentGame(controller.database).turn, "human");
  assert.equal(currentGame(disk).moves.length, 2);
});
