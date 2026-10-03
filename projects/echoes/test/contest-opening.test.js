import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, startContest, startNextContest, humanMove, advanceGhost, currentGame } from "../src/core/game.js";
import { opening, legalMoves } from "../src/core/rules.js";
import { canonicalKey, transformBoard } from "../src/core/symmetry.js";
import { progress, winner, winningMoves } from "../src/core/contest.js";
import { contestOpenings, openingWeight, pickOpening } from "../src/core/contest-opening.js";
import { validateDatabase } from "../src/storage/validation.js";
import { tactical, owners, win } from "./fixtures/contest.js";

function archive() {
  const board = {stones:Array.from({length:8},(_,i)=>({x:i%4,y:Math.floor(i/4)})),resting:{x:0,y:0}};
  let db = advanceGhost(humanMove(startGame(createDatabase(),{initialBoard:board}),legalMoves(board)[0]));
  db = startContest(db, {initialBoard:tactical, owners});
  return humanMove(db, win);
}
function safe(game) {
  assert.equal(winner(game.board, game.contest.owners), null);
  assert.equal(winningMoves(game.board, game.contest.owners, "human").length, 0);
  assert.equal(winningMoves(game.board, game.contest.owners, "ghost").length, 0);
  assert.equal(progress(game.board, game.contest.owners, "human"), progress(game.board, game.contest.owners, "ghost"));
  assert.ok(legalMoves(game.board).length);
}

test("next match samples an earlier historic state, not the winning match or its previous step", () => {
  const db = archive(), previous = structuredClone(currentGame(db));
  const next = startNextContest(db, {random:()=>0});
  const game = currentGame(next);
  assert.equal(game.contest.start.kind, "history");
  assert.equal(game.contest.start.gameId, db.games[0].id);
  assert.equal(game.contest.start.step, 1);
  assert.equal(canonicalKey(game.board), canonicalKey(db.games[0].board));
  assert.notEqual(canonicalKey(game.board), canonicalKey(previous.initialBoard));
  assert.notEqual(canonicalKey(game.board), canonicalKey(previous.board));
  assert.equal(game.turn, "human"); assert.equal(game.moves.length, 0);
  safe(game);
  assert.deepEqual(next.games.slice(0, -1), db.games);
  assert.doesNotThrow(()=>validateDatabase(next));
});

test("an empty or unsuitable archive falls back to the safe equal-colour opening", () => {
  for (const db of [createDatabase(), humanMove(startContest(createDatabase(), {initialBoard:tactical, owners}), win)]) {
    const next = startNextContest(db, {random:()=>0.9});
    assert.equal(currentGame(next).contest.start.kind, "default");
    assert.deepEqual(currentGame(next).board, opening()); safe(currentGame(next));
    assert.doesNotThrow(()=>validateDatabase(next));
  }
});

test("historic states are deduplicated across repetitions, rotations and translations", () => {
  const db = archive();
  const copy = structuredClone(db.games[0]); copy.id = "rotated-copy";
  const t = {orientation:5, dx:11, dy:-7};
  copy.initialBoard = transformBoard(copy.initialBoard, t);
  copy.board = transformBoard(copy.board, t);
  for (const turn of copy.moves) { turn.before = transformBoard(turn.before,t); turn.after = transformBoard(turn.after,t); }
  db.games.splice(1,0,copy);
  const candidates = contestOpenings(db);
  assert.equal(candidates.length, contestOpenings(archive()).length, "the repeated shape gets one chance in the draw");
  assert.deepEqual(candidates.map(c=>c.weight),contestOpenings(archive()).map(c=>c.weight),"repeated decisions do not add child states or alter weights");
  assert.equal(canonicalKey(candidates[0].board), canonicalKey(db.games[0].board));
});

test("weight rewards unexplored legal choices, and sampling keeps common states possible", () => {
  assert.ok(openingWeight(10,1)>openingWeight(10,5));
  assert.ok(openingWeight(10,1)>openingWeight(2,1));
  const candidate=contestOpenings(archive())[0];
  const rare={...candidate,weight:openingWeight(10,1)};
  const common={...candidate,weight:openingWeight(10,5)};
  assert.equal(pickOpening([rare,common],()=>0.6),rare,"uniform random would pick the common second state");
  assert.equal(pickOpening([rare,common],()=>0.99),common,"a weight is a bias, not a ban");
});

test("sparse starts with a possible ghost reply are preferred without forcing that reply", () => {
  const candidate=contestOpenings(archive())[0];
  const quiet={...candidate,weight:100,replyRoutes:0};
  const playable={...candidate,weight:1,replyRoutes:1};
  assert.equal(pickOpening([quiet,playable],()=>0),playable);
  assert.equal(pickOpening([quiet,playable],()=>0,false),quiet);
  assert.equal(pickOpening([quiet],()=>0),quiet,"an archive still learning to answer can keep growing");
});

test("a saved historic opening reloads exactly and forged opening provenance is rejected", () => {
  const next = startNextContest(archive(), {random:()=>0.75});
  assert.deepEqual(validateDatabase(JSON.parse(JSON.stringify(next))), next);
  for (const edit of [
    g=>{g.contest.start.gameId=g.id;},
    g=>{g.contest.start.step=999;},
    g=>{g.contest.start.step=0;},
    g=>{g.contest.start={kind:"default"};},
  ]) {
    const forged=structuredClone(next); edit(currentGame(forged));
    assert.throws(()=>validateDatabase(forged));
  }
});
