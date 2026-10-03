import test from "node:test";
import assert from "node:assert/strict";
import { GameController } from "../src/controller.js";
import { createDatabase, startGame, startContest, humanMove, advanceGhost, currentGame, matchScore } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";
import { tactical, owners, win } from "./fixtures/contest.js";
const Y={from:{x:1,y:2},to:{x:2,y:1}};
function memory(initial){return {db:initial,async load(){return structuredClone(this.db);},async save(db){this.db=validateDatabase(db);this.db.revision++;return structuredClone(this.db);}};}

test("contest mode preserves the old game and starts the new goal exactly once on upgrade", async()=>{
  const original=humanMove(startGame(createDatabase()),Y);
  const storage=memory(original);
  const controller=new GameController(storage,()=>{},async()=>{},async()=>{},true);
  await controller.load();
  assert.ok(currentGame(controller.database).contest);
  assert.ok(["history","default"].includes(currentGame(controller.database).contest.start.kind));
  assert.equal(storage.db.games.length,2);
  assert.equal(storage.db.games[0].status,"abandoned");
  assert.deepEqual(storage.db.games[0].moves,original.games[0].moves);
  const id=currentGame(storage.db).id;
  await controller.load();
  assert.equal(currentGame(storage.db).id,id);
  assert.equal(storage.db.games.length,2);
});

test("a human line commits without asking for a ghost reply, then a new contest starts automatically", async()=>{
  const storage=memory(startContest(createDatabase(),{initialBoard:tactical,owners}));
  const controller=new GameController(storage,()=>{},async()=>{},async()=>{},true);
  await controller.load(); await controller.play(win);
  assert.equal(currentGame(storage.db).contest.winner,"human");
  assert.equal(currentGame(storage.db).moves.length,1);
  assert.deepEqual(matchScore(storage.db),{human:1,ghost:0});
  await controller.continueGame();
  assert.equal(currentGame(storage.db).status,"playing");
  assert.ok(currentGame(storage.db).contest);
  assert.equal(currentGame(storage.db).moves.length,0);
  assert.deepEqual(matchScore(storage.db),{human:1,ghost:0});
});

test("pending contest turns reload into recorded animated replies with goal intent", async()=>{
  const archive=advanceGhost(humanMove(startGame(createDatabase()),Y));
  const pending=humanMove(startContest(archive),Y);
  const storage=memory(pending),shown=[];
  const controller=new GameController(storage,()=>{},async()=>{},async p=>shown.push(p),true);
  await controller.load();
  assert.equal(shown.length,1);
  assert.equal(shown[0].owners.length,8);
  assert.equal(typeof shown[0].intent,"string");
  assert.equal(currentGame(storage.db).turn,"human");
});

test("the next match saves a safe historic opening once and reload never rerolls it", async t=>{
  const rectangle={stones:[{x:0,y:0},{x:1,y:0},{x:2,y:0},{x:3,y:0},{x:0,y:1},{x:1,y:1},{x:2,y:1},{x:3,y:1}],resting:{x:0,y:0}};
  const decision={from:{x:3,y:1},to:{x:4,y:0}};
  let db=advanceGhost(humanMove(startGame(createDatabase(),{initialBoard:rectangle}),decision));
  const sourceId=currentGame(db).id;
  db=humanMove(startContest(db,{initialBoard:tactical,owners}),win);
  const storage=memory(db);
  const controller=new GameController(storage,()=>{},async()=>{},async()=>{},true);
  await controller.load(); await controller.continueGame();
  const game=currentGame(storage.db);
  assert.equal(game.contest.start.kind,"history");
  assert.equal(game.contest.start.gameId,sourceId);
  assert.equal(game.moves.length,0);
  const saved=structuredClone(storage.db);
  t.mock.method(Math,"random",()=>{throw new Error("Reload must not choose another opening.");});
  await controller.load();
  const reloaded=new GameController(storage,()=>{},async()=>{},async()=>{},true);
  await reloaded.load();
  assert.deepEqual(storage.db,saved);
  assert.deepEqual(currentGame(reloaded.database),game);
});

test("the manual new-match action also chooses and saves a generated opening", async()=>{
  const storage=memory(startContest(createDatabase()));
  const controller=new GameController(storage,()=>{},async()=>{},async()=>{},true);
  await controller.load();
  const previousId=currentGame(storage.db).id;
  await controller.nextGame();
  assert.notEqual(currentGame(storage.db).id,previousId);
  assert.equal(currentGame(storage.db).contest.start.kind,"default");
  assert.equal(storage.db.games[0].status,"abandoned");
  assert.equal(storage.db.games.length,2);
});
