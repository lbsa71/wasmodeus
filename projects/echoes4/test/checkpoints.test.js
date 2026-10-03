import test from "node:test";
import assert from "node:assert/strict";
import { Checkpoints } from "../src/checkpoints.js";

test("saving while swimming preserves new progress and serializes revisions", async () => {
  const db = { revision: 3, updatedAt: "", active: { tick: 30 }, runs: [] };
  const pending = [], snapshots = [];
  const store = { save(snapshot) { snapshots.push(snapshot); return new Promise(resolve => pending.push(() => resolve({ ...snapshot, revision: snapshot.revision + 1, updatedAt: "saved" }))); } };
  const saves = new Checkpoints(db, store);
  const first = saves.request();
  assert.equal(saves.busy, true);
  db.active.tick = 60;
  saves.request();
  pending.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(db.active.tick, 60);
  assert.equal(snapshots[0].active.tick, 30);
  assert.equal(snapshots[1].active.tick, 60);
  assert.equal(snapshots[1].revision, 4);
  pending.shift()();
  await first;
  assert.equal(db.revision, 5);
  assert.equal(saves.busy, false);
});

test("failed checkpoint retains unsaved data and reports failure", async () => {
  const db = { revision: 1, updatedAt: "", active: { tick: 60 }, runs: [] };
  const saves = new Checkpoints(db, { async save() { throw new Error("Disk full"); } });
  await assert.rejects(saves.request(), /Disk full/);
  assert.equal(db.active.tick, 60);
  assert.equal(db.revision, 1);
  assert.equal(saves.busy, false);
});
