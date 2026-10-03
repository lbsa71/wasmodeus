import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";
import { startGame } from "../src/core/game.js";

test("local API persists progress, detects stale saves, and serves the runnable project", async t => {
  const dir = await mkdtemp(join(tmpdir(), "echoes-http-"));
  const server = createServer({ databasePath: join(dir, "games.json") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const db = await (await fetch(`${base}/api/database`)).json();
  const save = await fetch(`${base}/api/database`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedRevision: 0, database: startGame(db) }) });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).revision, 1);
  const stale = await fetch(`${base}/api/database`, { method: "PUT", body: JSON.stringify({ expectedRevision: 0, database: db }) });
  assert.equal(stale.status, 409);
  const bad = await fetch(`${base}/api/database`, { method: "PUT", body: "{" });
  assert.equal(bad.status, 400);
  assert.equal((await (await fetch(`${base}/api/database`)).json()).games.length, 1);
  const foreign = await fetch(`${base}/api/database`, { method: "PUT", headers: { origin: "https://example.invalid" }, body: JSON.stringify({ expectedRevision: 1, database: db }) });
  assert.equal(foreign.status, 403);
  assert.equal((await fetch(base)).status, 200);
  assert.match(await (await fetch(base)).text(), /Echoes/);
});
