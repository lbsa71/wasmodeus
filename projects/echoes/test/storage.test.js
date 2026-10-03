import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseStore } from "../src/storage/database-store.js";
import { validateDatabase } from "../src/storage/validation.js";
import { opening, legalMoves } from "../src/core/rules.js";
import { startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";

const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "echoes-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "games.json");
  return { path, store: new DatabaseStore(path) };
}
test("every progress rewrites the whole database and restores pending turns and all older games", async t => {
  const { path, store } = await fixture(t);
  let db = await store.read();
  db = await store.save(startGame(db), db.revision);
  db = await store.save(humanMove(db, Y), db.revision);
  assert.equal(JSON.parse(await readFile(path, "utf8")).games[0].turn, "ghost");
  assert.deepEqual(await new DatabaseStore(path).read(), db);
  db = await store.save(advanceGhost(db), db.revision);
  db = await store.save(startGame(db), db.revision);
  const disk = JSON.parse(await readFile(path, "utf8"));
  assert.equal(disk.games.length, 2);
  assert.equal(disk.games[0].status, "won");
  assert.deepEqual(disk.games[0].moves[0].move, Y);
  assert.equal(disk.revision, 4);
  assert.deepEqual(await new DatabaseStore(path).read(), disk);
  const backup = JSON.parse(await readFile(`${path}.bak`, "utf8"));
  assert.equal(backup.revision, 3);
});
test("concurrent stale writes are rejected instead of erasing another tab's progress", async t => {
  const { store } = await fixture(t);
  const original = await store.read();
  const saves = await Promise.allSettled([store.save(startGame(original), 0), store.save(startGame(original), 0)]);
  assert.equal(saves.filter(result => result.status === "fulfilled").length, 1);
  const failure = saves.find(result => result.status === "rejected");
  assert.equal(failure.reason.statusCode, 409);
  assert.equal((await store.read()).games.length, 1);
});
test("malformed and corrupt files are preserved and cannot silently reset history", async t => {
  const { path, store } = await fixture(t);
  const initial = await store.read();
  await assert.rejects(store.save({ ...initial, ruleset: "unknown" }, 0));
  assert.deepEqual(JSON.parse(await readFile(path, "utf8")), initial);
  await writeFile(path, "broken history");
  await assert.rejects(new DatabaseStore(path).read(), /database|JSON/i);
  assert.equal(await readFile(path, "utf8"), "broken history");
});
test("database validation rejects forged moves, wrong resting markers, and invented ghost provenance", async t => {
  const { store } = await fixture(t);
  const db = humanMove(startGame(await store.read()), Y);
  assert.doesNotThrow(() => validateDatabase(db));
  const forged = structuredClone(db);
  forged.games[0].moves[0].move.to.x = 90;
  assert.throws(() => validateDatabase(forged));
  const wrongBoard = structuredClone(db);
  wrongBoard.games[0].board.resting = { x: 0, y: 0 };
  assert.throws(() => validateDatabase(wrongBoard));
  const game2 = advanceGhost(humanMove(startGame(advanceGhost(db)), Y));
  assert.doesNotThrow(() => validateDatabase(game2));
  game2.games[1].moves[1].source.moveIndex = 99;
  assert.throws(() => validateDatabase(game2));
});

test("frontier seeds and consecutive teaching turns survive complete saves; forged handoffs fail", async t => {
  const { store } = await fixture(t);
  const move = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
  let db = await store.read();
  db = await store.save(advanceGhost(humanMove(startGame(db), move)), db.revision);
  const seeded = startGame(db);
  assert.doesNotThrow(() => validateDatabase(seeded));
  db = await store.save(startGame(db, { initialBoard: opening() }), db.revision);
  db = await store.save(humanMove(db, move), db.revision);
  db = await store.save(advanceGhost(db), db.revision);
  assert.equal(currentGame(await store.read()).turn, "human");
  const forged = structuredClone(db);
  currentGame(forged).handoffs = [];
  assert.throws(() => validateDatabase(forged));
  db = await store.save(humanMove(db, legalMoves(currentGame(db).board)[0]), db.revision);
  db = await store.save(advanceGhost(db), db.revision);
  assert.deepEqual(await store.read(), db);
});
test("new saves cannot claim discovery wins at known frontiers or ignore an available ghost reply", async t => {
  const { store } = await fixture(t);
  const move = { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } };
  const learned = advanceGhost(humanMove(startGame(await store.read()), move));
  const forged = humanMove(startGame(learned, { initialBoard: opening() }), move);
  const game = currentGame(forged);
  game.status = "won"; game.turn = "finished"; game.endedAt = new Date().toISOString();
  assert.throws(() => validateDatabase(forged), /discovery/i);
  const answered = humanMove(startGame(advanceGhost(humanMove(startGame(await store.read()), Y))), Y);
  const fakeWin = currentGame(answered);
  fakeWin.status = "won"; fakeWin.turn = "finished"; fakeWin.endedAt = new Date().toISOString();
  assert.throws(() => validateDatabase(answered), /discovery/i);
});
