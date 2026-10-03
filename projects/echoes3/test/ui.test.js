import test from "node:test";
import assert from "node:assert/strict";
import { layoutTree, tipLabel, phaseText, regrowthPath } from "../src/ui/view-model.js";
import { RoundLoop, completedMatchId } from "../src/ui/round-loop.js";
import { applyMove, parsePosition } from "../src/core/rules.js";

test("tree layout preserves every branch, keeps the root below its tips and separates targets", () => {
  const layout = layoutTree("(((())())())");
  assert.equal(layout.nodes.length, 6);
  assert.equal(layout.edges.length, 5);
  assert.equal(layout.nodes[0].path.length, 0);
  const tips = layout.nodes.filter(node => node.leaf && node.path.length);
  assert.equal(tips.length, 3);
  assert.ok(tips.every(node => node.y < layout.nodes[0].y));
  for (const [index, tip] of tips.entries()) {
    assert.ok(tip.x >= 28 && tip.x <= layout.width - 28);
    for (const other of tips.slice(index + 1)) assert.ok(Math.abs(tip.x - other.x) >= 48);
  }
});

test("larger trees grow their drawing surface without squeezing playable tips", () => {
  const layout = layoutTree(`(${'()'.repeat(40)})`);
  assert.ok(layout.width >= 40 * 48);
  assert.equal(layout.nodes.filter(node => node.leaf && node.path.length).length, 40);
  assert.equal(layoutTree("()").nodes[0].path.length, 0);
});

test("tip labels preview whether this particular cut creates a copy", () => {
  assert.equal(tipLabel([1]), "Cut tip 2. This branch disappears.");
  assert.equal(tipLabel([0, 1]), "Cut tip 1.2. Its remaining parent branch is copied.");
});

test("regrowth animation identifies the new copy after canonical branch ordering", () => {
  const before = "(((())())())", move = [0, 1];
  const path = regrowthPath(before, move);
  assert.ok(path);
  let copy = parsePosition(applyMove(before, move).position);
  for (const index of path) copy = copy[index];
  assert.deepEqual(copy, [[[]]]);
  assert.equal(regrowthPath(before, [1]), null);
});

test("turn instructions distinguish the first teaching round, pass bonus and historical review", () => {
  const game = { status: "playing", archiveIds: [], turns: [] };
  assert.match(phaseText(game, false), /first match teaches the ghost/);
  game.turns.push({ actor: 2, move: null, discovery: true });
  assert.equal(phaseText(game, false), "+1 breakthrough. The ghost passes; cut again.");
  game.turns[0].discovery = false;
  assert.equal(phaseText(game, false), "No remembered reply fits this whole tree. The ghost passes; cut again.");
  assert.match(phaseText({ ...game, status: "ghost" }, false), /new match starts shortly/);
  assert.match(phaseText(game, true), /Return to your match/);
});

test("both wins advance with archive controls open but actual review, work, errors or hidden tabs pause", () => {
  const state = { reviewing: false, archiveOpen: true, busy: false, hidden: false, failed: false };
  for (const status of ["human", "ghost"]) {
    const game = { id: status, status };
    assert.equal(completedMatchId(game, state), status);
    for (const key of ["reviewing", "busy", "hidden", "failed"]) assert.equal(completedMatchId(game, { ...state, [key]: true }), null);
  }
  assert.equal(completedMatchId({ id: "live", status: "playing" }, state), null);
});

test("automatic matches wait for completed animation and never restart the same result twice", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let advanced = 0;
  const loop = new RoundLoop(() => advanced++);
  loop.update("won"); t.mock.timers.tick(1399);
  assert.equal(advanced, 0);
  loop.update(null); t.mock.timers.tick(2000);
  assert.equal(advanced, 0);
  loop.update("won"); t.mock.timers.tick(1400);
  assert.equal(advanced, 1);
  loop.update("won"); t.mock.timers.tick(2000);
  assert.equal(advanced, 1);
});
