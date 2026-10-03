import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/controller.js";
import { createDatabase,startGame,humanMove,advanceGhost,currentGame } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";
function memory(db=createDatabase()) {return {db,saves:[],fail:false,async load(){return structuredClone(this.db);},async save(next){if(this.fail)throw new Error("Disk unavailable");this.db=validateDatabase(next);this.db.revision++;this.saves.push(structuredClone(this.db));return structuredClone(this.db);}};}
test("turns commit before their animations, with input locked through human and ghost motion",async()=>{
  let db=advanceGhost(humanMove(startGame(createDatabase()),11));db=startGame(db);
  const storage=memory(db),seen=[];
  const controller=new GameController(storage,()=>{},async p=>{
    assert.equal(controller.busy,true);assert.deepEqual(currentGame(storage.db).board,p.turn.after);
    seen.push(p.actor);assert.ok(p.frames.length>0);
  });
  await controller.load();await controller.play(11);
  assert.deepEqual(seen,[1,2]);assert.equal(storage.saves.length,2);
  assert.equal(currentGame(controller.database).turn,1);assert.equal(controller.busy,false);
});
test("a saved pending ghost turn resumes exactly once",async()=>{
  let db=advanceGhost(humanMove(startGame(createDatabase()),11));db=humanMove(startGame(db),11);
  const storage=memory(db),shown=[];const controller=new GameController(storage,()=>{},async p=>shown.push(p.actor));
  await controller.load();assert.deepEqual(shown,[2]);assert.equal(currentGame(storage.db).turns.length,2);
  await controller.load();assert.deepEqual(shown,[2]);assert.equal(currentGame(storage.db).turns.length,2);
});
test("failed saves never publish or animate an uncommitted move",async()=>{
  const storage=memory(startGame(createDatabase())),shown=[];
  const controller=new GameController(storage,()=>{},async p=>shown.push(p));
  await controller.load();const original=structuredClone(controller.database);storage.fail=true;
  await assert.rejects(controller.play(11),/Disk/);
  assert.deepEqual(controller.database,original);assert.deepEqual(shown,[]);assert.equal(controller.busy,false);
});
test("an unmatched archive records a pass and never animates a fabricated move",async()=>{
  const storage=memory(startGame(createDatabase())),shown=[];
  const controller=new GameController(storage,()=>{},async p=>shown.push(p.actor));
  await controller.load();await controller.play(11);
  assert.deepEqual(shown,[1]);assert.equal(currentGame(storage.db).turns.at(-1).move,null);
});
test("replaying a ghost cascade changes no saved state",async()=>{
  let db=advanceGhost(humanMove(startGame(createDatabase()),11));db=advanceGhost(humanMove(startGame(db),11));
  const storage=memory(db),shown=[];const controller=new GameController(storage,()=>{},async p=>shown.push(p.actor));
  await controller.load();const original=structuredClone(storage.db);await controller.replayGhost();
  assert.deepEqual(shown,[2]);assert.deepEqual(storage.db,original);assert.equal(storage.saves.length,0);
});
test("a failed ghost save leaves the human decision durable and reload resumes it",async()=>{
  const storage=memory(startGame(createDatabase())),shown=[];
  const controller=new GameController(storage,()=>{},async p=>{shown.push(p.actor);storage.fail=true;});
  await controller.load();await assert.rejects(controller.play(11),/Disk/);
  assert.equal(currentGame(storage.db).turn,2);assert.equal(currentGame(storage.db).turns.length,1);
  assert.deepEqual(shown,[1]);storage.fail=false;
  const resumed=new GameController(storage);await resumed.load();
  assert.equal(currentGame(storage.db).turn,1);assert.equal(currentGame(storage.db).turns.length,2);
});
test("a WASM disagreement cannot save or animate a different board",async()=>{
  const storage=memory(startGame(createDatabase())),shown=[];
  const engine={applyMove(board){return {board,frames:[board],bursts:[[]]};}};
  const controller=new GameController(storage,()=>{},async p=>shown.push(p),engine);
  await controller.load();await assert.rejects(controller.play(11),/disagree/);
  assert.equal(storage.saves.length,0);assert.deepEqual(shown,[]);
});
test("automatic next match lets the human answer an earlier stuck ghost position",async()=>{
  let db=startGame(createDatabase());
  for(let i=0;i<4;i++) {db=humanMove(db,12);if(currentGame(db).turn===2)db=advanceGhost(db);}
  assert.equal(currentGame(db).status,"human");
  const storage=memory(db),controller=new GameController(storage);
  await controller.load();await controller.nextGame();
  assert.ok(currentGame(storage.db).startSource);
  assert.equal(currentGame(storage.db).turn,1);
});
