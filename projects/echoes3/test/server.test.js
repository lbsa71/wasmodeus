import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "../src/server.js";

test("local API persists complete snapshots and rejects stale, malformed and foreign saves", async t => {
  const dir = await mkdtemp(join(tmpdir(), "echoes3-http-"));
  const server = createServer({ databasePath: join(dir, "games.json") });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/api/database");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const db = await response.json();
  assert.equal(db.ruleset, "echoes3-v1");
  const save = await fetch(base + "/api/database", {
    method: "PUT", body: JSON.stringify({ expectedRevision: 0, database: db }),
  });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(await (await fetch(base + "/api/database")).json(), saved);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: JSON.stringify({ expectedRevision: 0, database: db }) })).status, 409);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: "{" })).status, 400);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: JSON.stringify({ database: db }) })).status, 400);
  assert.equal((await fetch(base + "/api/database", { method: "POST" })).status, 405);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", headers: { origin: "https://example.invalid" }, body: JSON.stringify({ expectedRevision: 1, database: saved }) })).status, 403);
  assert.deepEqual(await (await fetch(base + "/api/database")).json(), saved);
});
