import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseStore } from "../src/storage/database-store.js";
import { startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "echoes3-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "games.json");
  return { path, store: new DatabaseStore(path) };
}

test("every save persists the complete independent snapshot and retains the preceding revision", async t => {
  const { path, store } = await setup(t);
  let db = await store.read();
  assert.equal(db.ruleset, "echoes3-v1");
  const changes = [
    db => startGame(db, { initialPosition: "(()())" }),
    db => humanMove(db, [0]),
    advanceGhost,
    db => humanMove(db, [0]),
    db => startGame(db, { initialPosition: "(()())" }),
    db => humanMove(db, [0]),
    advanceGhost,
  ];
  for (const [index, change] of changes.entries()) {
    const revision = index + 1;
    const previous = structuredClone(db);
    db = await store.save(change(db), db.revision);
    assert.equal(db.revision, revision);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), db);
    assert.deepEqual(JSON.parse(await readFile(path + ".bak", "utf8")), previous);
    assert.deepEqual(await new DatabaseStore(path).read(), db);
  }
  assert.equal(db.games.length, 2);
  assert.equal(currentGame(db).status, "ghost");
  assert.ok(currentGame(db).turns.at(-1).source, "the saved ghost retains its real human source");
  const returned = await store.read();
  returned.revision = 999;
  assert.equal((await store.read()).revision, changes.length);
});

test("concurrent stale writes cannot erase another tab's progress and do not block later saves", async t => {
  const { store } = await setup(t), db = await store.read();
  const results = await Promise.allSettled([store.save(db, 0), store.save(db, 0)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.statusCode, 409);
  const current = await store.read();
  assert.equal(current.revision, 1);
  assert.equal((await store.save(current, 1)).revision, 2);
});

test("bad input and corrupt files are retained without erasing history", async t => {
  const { path, store } = await setup(t), db = await store.read();
  await assert.rejects(store.save({ ...db, ruleset: "echoes2-charge-v1" }, 0));
  await assert.rejects(store.save({ ...db, revision: 4 }, 0));
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), db);
  await writeFile(path, "broken archive");
  await assert.rejects(new DatabaseStore(path).read());
  assert.equal(await readFile(path, "utf8"), "broken archive");
});
