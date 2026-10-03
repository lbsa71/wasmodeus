import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseStore } from "../src/storage/database-store.js";
import { startGame, humanMove, advanceGhost, currentGame } from "../src/core/game.js";
async function setup(t) {
  const dir=await mkdtemp(join(tmpdir(),"echoes2-store-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"games.json");return {path,store:new DatabaseStore(path)};
}
test("each step persists the complete independent database, including an interrupted ghost turn",async t=>{
  const {path,store}=await setup(t);
  let db=await store.read(); assert.equal(db.ruleset,"echoes2-charge-v1");
  db=await store.save(startGame(db),db.revision);
  db=await store.save(humanMove(db,11),db.revision);
  assert.equal(currentGame(await new DatabaseStore(path).read()).turn,2);
  db=await store.save(advanceGhost(db),db.revision);
  db=await store.save(startGame(db),db.revision);
  assert.equal(db.games.length,2);
  assert.deepEqual(await new DatabaseStore(path).read(),db);
  assert.equal(JSON.parse(await readFile(path+".bak","utf8")).revision,db.revision-1);
});
test("stale writes cannot erase another tab's games",async t=>{
  const {store}=await setup(t),db=await store.read();
  const results=await Promise.allSettled([store.save(startGame(db),0),store.save(startGame(db),0)]);
  assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
  assert.equal(results.find(r=>r.status==="rejected").reason.statusCode,409);
  assert.equal((await store.read()).games.length,1);
});
test("bad input and corrupt files are retained without erasing history",async t=>{
  const {path,store}=await setup(t),db=await store.read();
  await assert.rejects(store.save({...db,ruleset:"echoes-eight-rest-v1"},0));
  assert.deepEqual(JSON.parse(await readFile(path,"utf8")),db);
  await writeFile(path,"broken archive");
  await assert.rejects(new DatabaseStore(path).read());
  assert.equal(await readFile(path,"utf8"),"broken archive");
});
