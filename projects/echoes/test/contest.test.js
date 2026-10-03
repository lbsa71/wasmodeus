import test from "node:test";
import assert from "node:assert/strict";
import { winner, winningMoves, chooseReply } from "../src/core/contest.js";
import { createDatabase, startGame, startContest, currentGame, humanMove, advanceGhost, discoveryScore } from "../src/core/game.js";
import { opening, applyMove, legalMoves } from "../src/core/rules.js";
import { transformBoard } from "../src/core/symmetry.js";

import { tactical, owners, win, block } from "./fixtures/contest.js";
const Y = {from:{x:1,y:2},to:{x:2,y:1}};
const reply = (move, index) => ({move, source:{gameId:"record",moveIndex:index,transform:{orientation:0,dx:0,dy:0}}});

test("both colours have four stones, any stone remains movable, and the opening has no instant win", () => {
  const db = startContest(createDatabase());
  const game = currentGame(db);
  assert.equal(game.contest.owners.filter(s=>s==="human").length,4);
  assert.equal(game.contest.owners.filter(s=>s==="ghost").length,4);
  assert.deepEqual(game.board,opening());
  assert.equal(winner(game.board,game.contest.owners),null);
  assert.equal(winningMoves(game.board,game.contest.owners,"human").length,0);
  assert.equal(winningMoves(game.board,game.contest.owners,"ghost").length,0);
  assert.ok(legalMoves(game.board).some(m=>game.contest.owners[game.board.stones.findIndex(p=>p.x===m.from.x&&p.y===m.from.y)]==="ghost"));
});

test("a connected four wins in every orientation, while mixed colours and gaps do not", () => {
  assert.equal(winner(tactical,owners),null);
  const after=applyMove(tactical,win);
  for(let orientation=0;orientation<8;orientation++) assert.equal(winner(transformBoard(after,{orientation,dx:17,dy:-4}),owners),"human");
  assert.equal(winner(after,["ghost","human","ghost","human","ghost","human","ghost","human"]),"ghost");
});

test("the ghost selects a winning recorded action, or blocks a human threat; it never invents a move", () => {
  const choices=[reply(win,0),reply(block,1)];
  assert.equal(chooseReply(tactical,owners.map(s=>s==="human"?"ghost":"human"),choices).source.moveIndex,0);
  const weak=legalMoves(tactical).find(m=>winningMoves(applyMove(tactical,m),owners,"human").length && winner(applyMove(tactical,m),owners)!=="human");
  assert.ok(weak);
  const restricted=[reply(weak,2),reply(block,1)];
  assert.equal(chooseReply(tactical,owners,restricted).source.moveIndex,1);
  assert.equal(chooseReply(tactical,owners,[reply(weak,2)]).source.moveIndex,2,"only recorded actions are available even if all are weak");
});

test("a missing reply awards an extra turn inside the same match, and repeating a frontier cannot farm points", () => {
  let db=startContest(createDatabase());
  const id=currentGame(db).id;
  db=advanceGhost(humanMove(db,Y));
  assert.equal(currentGame(db).id,id);
  assert.equal(currentGame(db).status,"playing");
  assert.equal(currentGame(db).turn,"human");
  assert.deepEqual(currentGame(db).handoffs,[1]);
  assert.equal(currentGame(db).contest.discoveries.length,1);
  assert.equal(discoveryScore(db),1);
  db=advanceGhost(humanMove(db,{from:{x:0,y:1},to:{x:1,y:2}}));
  assert.equal(discoveryScore(db),1,"rotated equivalent frontier in the same match is not a new discovery");
});

test("making a line ends the match immediately, including accidentally completing the enemy line", () => {
  let db=startContest(createDatabase(),{initialBoard:tactical,owners});
  db=humanMove(db,win);
  assert.equal(currentGame(db).status,"won");
  assert.equal(currentGame(db).contest.winner,"human");
  assert.equal(currentGame(db).turn,"finished");
  assert.throws(()=>advanceGhost(db));
  let enemy=startContest(createDatabase(),{initialBoard:tactical,owners:owners.map(s=>s==="human"?"ghost":"human")});
  enemy=humanMove(enemy,win);
  assert.equal(currentGame(enemy).contest.winner,"ghost");
  assert.equal(discoveryScore(enemy),0,"round victories do not become discovery points");
});

test("legacy geometric recordings remain usable under different goal colours", () => {
  let db=advanceGhost(humanMove(startGame(createDatabase()),Y));
  const old=structuredClone(db.games[0]);
  db=startContest(db);
  db=advanceGhost(humanMove(db,Y));
  assert.equal(currentGame(db).moves[1].actor,"ghost");
  assert.equal(currentGame(db).moves[1].source.gameId,old.id);
  assert.notEqual(currentGame(db).moves[1].source.transform.orientation,0);
  assert.deepEqual(db.games[0],old);
});
