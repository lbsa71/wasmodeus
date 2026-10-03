import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { createServer } from "../src/server.js";
import { MAX_SNAPSHOT_BYTES } from "../src/storage/validation.js";

async function setup(t) {
  const dir = await mkdtemp(join(tmpdir(), "echoes4-http-"));
  await writeFile(join(dir, "index.html"), "<h1>Aquarium fixture</h1>");
  const server = createServer({ databasePath: join(dir, "dives.json"), publicPath: dir });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test("HTTP snapshots persist fully and reject stale, malformed and foreign saves", async t => {
  const base = await setup(t);
  const first = await fetch(base + "/api/database");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const database = await first.json();
  assert.equal(database.version, 1);
  const save = await fetch(base + "/api/database", { method: "PUT", headers: { origin: base }, body: JSON.stringify({ expectedRevision: 0, database }) });
  assert.equal(save.status, 200);
  const saved = await save.json();
  assert.equal(saved.revision, 1);
  assert.deepEqual(await (await fetch(base + "/api/database")).json(), saved);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: JSON.stringify({ expectedRevision: 0, database }) })).status, 409);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: "{" })).status, 400);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", body: JSON.stringify({ database }) })).status, 400);
  assert.equal((await fetch(base + "/api/database", { method: "POST" })).status, 405);
  assert.equal((await fetch(base + "/api/database", { method: "PUT", headers: { origin: "https://example.invalid" }, body: JSON.stringify({ expectedRevision: 1, database: saved }) })).status, 403);
  assert.deepEqual(await (await fetch(base + "/api/database")).json(), saved);
});

test("static routes support GET and HEAD while missing routes and writes reject", async t => {
  const base = await setup(t);
  const page = await fetch(base + "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /Aquarium fixture/);
  const head = await fetch(base + "/", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(base + "/missing.txt")).status, 404);
  assert.equal((await fetch(base + "/", { method: "PUT" })).status, 405);
  assert.equal((await fetch(base + "/%2e%2e%2fprivate.txt")).status, 403);
});

test("oversized saves fail with a clear 64 MiB limit before reading their body", async t => {
  const base = await setup(t);
  const result = await new Promise((resolve, reject) => {
    const req = request(base + "/api/database", { method: "PUT", headers: { "Content-Length": MAX_SNAPSHOT_BYTES + 1 } }, response => {
      let body = "";
      response.on("data", chunk => { body += chunk; });
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    req.on("error", reject); req.end();
  });
  assert.equal(result.status, 413);
  assert.match(result.body, /64 MiB/);
});
