import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/controller.js";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame, continueEncounter } from "../src/core/game.js";
const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };
const learned = () => advanceGhost(humanMove(startGame(createDatabase()), Y));
function memory(db) {
  return { db, writes: 0, async load() { return structuredClone(this.db); }, async save(value) { this.db = structuredClone(value); this.writes++; return this.db; } };
}

test("a rotated reply is saved, then visibly presented with input locked until its motion finishes", { timeout: 1000 }, async () => {
  const storage = memory(startGame(learned()));
  let finish;
  let shown;
  const animation = new Promise(resolve => { finish = resolve; });
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const controller = new GameController(storage, () => {}, async () => {}, async presentation => {
    shown = presentation;
    assert.equal(currentGame(storage.db).moves.at(-1).actor, "ghost", "animation follows durable save");
    started();
    await animation;
  });
  await controller.load();
  const playing = controller.play(Y);
  await ready;
  assert.equal(controller.busy, true);
  assert.equal(shown.kind, "reply");
  assert.equal(shown.turn.source.transform.orientation, 1);
  assert.deepEqual(shown.original.move, Y);
  assert.ok(shown.replyCount > 0);
  assert.equal(controller.ghostPresentation, shown);
  const writes = storage.writes;
  await controller.play(Y);
  assert.equal(storage.writes, writes, "clicks during ghost motion cannot submit another move");
  finish(); await playing;
  assert.equal(controller.ghostPresentation, null);
  assert.equal(controller.busy, false);
});

test("a learning echo is labeled separately and manual replay never changes history or score", async () => {
  const storage = memory(continueEncounter(learned()));
  const shown = [];
  const controller = new GameController(storage, () => {}, async () => {}, async p => { shown.push(p); });
  await controller.load();
  assert.equal(shown[0].kind, "learning");
  const before = structuredClone(storage.db);
  const writes = storage.writes;
  await controller.replayGhost();
  assert.equal(shown.length, 2);
  assert.equal(storage.writes, writes);
  assert.deepEqual(storage.db, before);
});

test("an unanswered frontier and a failed ghost save never animate an invented action", async () => {
  let presentations = 0;
  const present = async () => { presentations++; };
  const fresh = new GameController(memory(startGame(createDatabase())), () => {}, async () => {}, present);
  await fresh.load(); await fresh.play(Y);
  assert.equal(presentations, 0);
  const storage = memory(startGame(learned()));
  storage.save = async db => {
    if (currentGame(db).moves.at(-1)?.actor === "ghost") throw new Error("Disk full");
    storage.db = db; return db;
  };
  const failing = new GameController(storage, () => {}, async () => {}, present);
  await failing.load();
  await assert.rejects(failing.play(Y), /Disk full/);
  assert.equal(presentations, 0);
  assert.equal(failing.ghostPresentation, null);
  assert.equal(currentGame(failing.database).turn, "ghost");
});

test("automatic continuation invites a human choice before a real ghost reply when history supports it", async () => {
  const storage = memory(learned());
  const kinds = [];
  const controller = new GameController(storage, () => {}, async () => {}, async p => { kinds.push(p.kind); });
  await controller.load(); await controller.continueGame();
  assert.equal(currentGame(controller.database).moves.length, 0);
  assert.equal(currentGame(controller.database).turn, "human");
  assert.deepEqual(kinds, []);
  await controller.play(Y);
  assert.deepEqual(kinds, ["reply"]);
});
