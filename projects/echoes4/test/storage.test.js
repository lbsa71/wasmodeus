import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseStore } from "../src/storage/database-store.js";
import { createDatabase, validateDatabase } from "../src/storage/validation.js";

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "echoes4-store-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "dives.json");
  return { path, store: new DatabaseStore(path) };
}

test("empty aquarium databases are independent finite versioned snapshots", () => {
  const database = createDatabase();
  assert.equal(database.version, 1);
  assert.equal(database.revision, 0);
  assert.equal(database.active, null);
  assert.deepEqual(database.runs, []);
  const copy = validateDatabase(database);
  assert.deepEqual(copy, database);
  assert.notEqual(copy.config, database.config);
  database.config.extra = NaN;
  assert.throws(() => validateDatabase(database), /finite|number|JSON/i);
});

test("every full snapshot survives atomic reopen and preserves the preceding revision", async t => {
  const { path, store } = await setup(t);
  let database = await store.read();
  for (let i = 0; i < 3; i += 1) {
    const previous = structuredClone(database);
    database = await store.save(database, database.revision);
    assert.equal(database.revision, i + 1);
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), database);
    assert.deepEqual(JSON.parse(await readFile(path + ".bak", "utf8")), previous);
    assert.deepEqual(await new DatabaseStore(path).read(), database);
  }
  const detached = await store.read();
  detached.revision = 1000;
  assert.equal((await store.read()).revision, 3);
});

test("concurrent stale saves cannot erase progress and the queue recovers after rejection", async t => {
  const { store } = await setup(t);
  const db = await store.read();
  const results = await Promise.allSettled([store.save(db, 0), store.save(db, 0)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.find(result => result.status === "rejected").reason.statusCode, 409);
  const current = await store.read();
  assert.equal((await store.save(current, current.revision)).revision, 2);
});

test("invalid snapshots and corrupt disk files reject without erasing the archive", async t => {
  const { store, path } = await setup(t);
  const db = await store.read();
  for (const invalid of [{ ...db, version: 2 }, { ...db, revision: 3 }, { ...db, runs: {} }, { ...db, active: {} }, { ...db, updatedAt: "bad" }]) {
    await assert.rejects(store.save(invalid, 0));
  }
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), db);
  await writeFile(path, "broken dive archive");
  await assert.rejects(new DatabaseStore(path).read(), /database/i);
  assert.equal(await readFile(path, "utf8"), "broken dive archive");
});

test("nonfinite values and non-JSON values cannot silently change when serialized", () => {
  for (const invalid of [NaN, Infinity, -Infinity, undefined, BigInt(1), () => 3, new Date()]) {
    const db = createDatabase(); db.extra = invalid;
    assert.throws(() => validateDatabase(db), /finite|JSON/i);
  }
  const db = createDatabase(); db.extra = db;
  assert.throws(() => validateDatabase(db), /cyclic|JSON/i);
});
