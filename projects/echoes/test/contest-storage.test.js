import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseStore } from "../src/storage/database-store.js";
import { validateDatabase } from "../src/storage/validation.js";
import { createDatabase, startGame, startContest, currentGame, humanMove, advanceGhost } from "../src/core/game.js";
import { tactical, owners, win } from "./fixtures/contest.js";
const Y = {from:{x:1,y:2},to:{x:2,y:1}};

test("colours, a frontier bonus, and a pending reply survive complete database saves", async t => {
  const dir=await mkdtemp(join(tmpdir(),"echoes-contest-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const store=new DatabaseStore(join(dir,"games.json"));
  let db=await store.read();
  db=await store.save(startContest(db),db.revision);
  db=await store.save(humanMove(db,Y),db.revision);
  assert.equal(currentGame(await store.read()).turn,"ghost");
  db=await store.save(advanceGhost(db),db.revision);
  assert.equal(currentGame(await store.read()).turn,"human");
  assert.deepEqual(currentGame(await store.read()).contest.discoveries,[1]);
  assert.deepEqual(await new DatabaseStore(join(dir,"games.json")).read(),db);
});

test("contest validation rejects forged colours, swapped stone identities, missing passes and fabricated wins", () => {
  const db=advanceGhost(humanMove(startContest(createDatabase()),Y));
  assert.doesNotThrow(()=>validateDatabase(db));
  const edits=[
    g=>{g.contest.owners[0]="ghost";},
    g=>{[g.moves[0].after.stones[0],g.moves[0].after.stones[1]]=[g.moves[0].after.stones[1],g.moves[0].after.stones[0]];},
    g=>{g.handoffs=[];},
    g=>{g.contest.discoveries=[];},
    g=>{g.contest.winner="human";g.contest.endReason="line";g.status="won";g.turn="finished";g.endedAt=new Date().toISOString();},
  ];
  for(const edit of edits){const forged=structuredClone(db);edit(currentGame(forged));assert.throws(()=>validateDatabase(forged));}
});

test("human and ghost line victories validate, including an enemy line completed by the human", () => {
  const human=humanMove(startContest(createDatabase(),{initialBoard:tactical,owners}),win);
  assert.doesNotThrow(()=>validateDatabase(human));
  const swapped=owners.map(s=>s==="human"?"ghost":"human");
  const accidental=humanMove(startContest(createDatabase(),{initialBoard:tactical,owners:swapped}),win);
  assert.doesNotThrow(()=>validateDatabase(accidental));
  let archive=advanceGhost(humanMove(startGame(createDatabase(),{initialBoard:tactical}),win));
  const before=structuredClone(tactical);before.stones[2]={x:2,y:0};before.resting={x:0,y:2};
  archive=startContest(archive,{initialBoard:before,owners:swapped});
  archive=advanceGhost(humanMove(archive,{from:{x:2,y:0},to:{x:1,y:0}}));
  assert.equal(currentGame(archive).moves.at(-1).actor,"ghost");
  assert.equal(currentGame(archive).contest.winner,"ghost");
  assert.doesNotThrow(()=>validateDatabase(archive));
});

test("the move budget ends in a draw after a pass or a reply, and older archive games remain unchanged", () => {
  const fresh=advanceGhost(humanMove(startContest(createDatabase(),{turnLimit:1}),Y));
  assert.equal(currentGame(fresh).status,"held");
  assert.equal(currentGame(fresh).contest.winner,null);
  assert.equal(currentGame(fresh).contest.endReason,"limit");
  assert.doesNotThrow(()=>validateDatabase(fresh));
  let legacy=advanceGhost(humanMove(startGame(createDatabase()),Y));
  const prior=structuredClone(legacy.games[0]);
  legacy=advanceGhost(humanMove(startContest(legacy,{turnLimit:1}),Y));
  assert.equal(currentGame(legacy).moves.at(-1).actor,"ghost");
  assert.equal(currentGame(legacy).contest.endReason,"limit");
  assert.deepEqual(legacy.games[0],prior);
  assert.doesNotThrow(()=>validateDatabase(legacy));
});
