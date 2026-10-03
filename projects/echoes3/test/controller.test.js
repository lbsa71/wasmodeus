import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/controller.js";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";

function memory(db = createDatabase()) {
  return { db, saves: [], fail: false,
    async load() { return structuredClone(this.db); },
    async save(next) {
      if (this.fail) throw new Error("Disk unavailable");
      this.db = validateDatabase(next); this.db.revision++;
      this.saves.push(structuredClone(this.db)); return structuredClone(this.db);
    }
  };
}
function lesson() {
  let db = startGame(createDatabase(), { initialPosition: "(()())" });
  db = advanceGhost(humanMove(db, [0]));
  return humanMove(db, [0]);
}
function rematch() { return startGame(lesson(), { initialPosition: "(()())" }); }

test("human and ghost cuts save before animation, and the ghost can take the last branch", async () => {
  const storage = memory(rematch()), seen = [];
  const controller = new GameController(storage, () => {}, async presentation => {
    assert.equal(controller.busy, true);
    assert.equal(currentGame(storage.db).position, presentation.turn.after);
    seen.push(presentation.actor);
  });
  await controller.load(); await controller.play([0]);
  assert.deepEqual(seen, [1, 2]);
  assert.equal(storage.saves.length, 2);
  assert.equal(currentGame(storage.db).status, "ghost");
  assert.equal(controller.busy, false);
});

test("a pending saved ghost cut resumes once after reload", async () => {
  const storage = memory(humanMove(rematch(), [0])), seen = [];
  const controller = new GameController(storage, () => {}, async p => seen.push(p.actor));
  await controller.load(); await controller.load();
  assert.deepEqual(seen, [2]); assert.equal(storage.saves.length, 1);
  assert.equal(currentGame(storage.db).status, "ghost");
});

test("unknown positions save a pass and return the identical tree to the human", async () => {
  const storage = memory(startGame(createDatabase(), { initialPosition: "(()())" })), seen = [];
  const controller = new GameController(storage, () => {}, async p => seen.push(p.actor));
  await controller.load(); await controller.play([0]);
  assert.deepEqual(seen, [1]);
  const game = currentGame(storage.db);
  assert.equal(game.turn, 1); assert.equal(game.position, "(())");
  assert.equal(game.turns.at(-1).move, null);
  assert.equal(game.turns.at(-1).before, game.turns.at(-1).after);
  assert.equal(storage.saves.length, 2);
});

test("failed human saves cannot animate or publish uncommitted progress", async () => {
  const storage = memory(rematch()), seen = [];
  const controller = new GameController(storage, () => {}, async p => seen.push(p.actor));
  await controller.load(); const original = structuredClone(controller.database); storage.fail = true;
  await assert.rejects(controller.play([0]), /Disk/);
  assert.deepEqual(controller.database, original); assert.deepEqual(seen, []);
  assert.equal(controller.busy, false);
});

test("a failed ghost save preserves the human cut for reload recovery", async () => {
  const storage = memory(rematch());
  const controller = new GameController(storage, () => {}, async () => { storage.fail = true; });
  await controller.load(); await assert.rejects(controller.play([0]), /Disk/);
  assert.equal(currentGame(storage.db).turn, 2);
  storage.fail = false;
  await new GameController(storage).load();
  assert.equal(currentGame(storage.db).status, "ghost");
  assert.equal(currentGame(storage.db).turns.length, 2);
});

test("replaying a remembered ghost cut leaves the complete database unchanged", async () => {
  const storage = memory(advanceGhost(humanMove(rematch(), [0]))), seen = [];
  const controller = new GameController(storage, () => {}, async p => seen.push(p.actor));
  await controller.load(); const original = structuredClone(storage.db);
  await controller.replayGhost();
  assert.deepEqual(seen, [2]); assert.deepEqual(storage.db, original);
  assert.equal(storage.saves.length, 0);
});

test("a WASM disagreement cannot save an incorrect tree", async () => {
  const storage = memory(rematch()), seen = [];
  const engine = { applyMove: () => ({ position: "()", regrown: false, beforePieces: 2, afterPieces: 0 }) };
  const controller = new GameController(storage, () => {}, async p => seen.push(p.actor), engine);
  await controller.load(); await assert.rejects(controller.play([0]), /disagree/);
  assert.equal(storage.saves.length, 0); assert.deepEqual(seen, []);
});

test("larger seeds and explicit seed choices are separate saved encounters", async () => {
  const storage = memory(startGame(createDatabase()));
  const controller = new GameController(storage); await controller.load();
  const old = currentGame(storage.db).initialPosition;
  await controller.growSeed();
  assert.ok(currentGame(storage.db).initialPosition.length > old.length);
  assert.equal(storage.db.games[0].status, "abandoned");
  await controller.nextGame("(()())");
  assert.equal(currentGame(storage.db).initialPosition, "(()())");
  assert.equal(storage.saves.length, 2);
});
