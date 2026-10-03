import test from "node:test";
import assert from "node:assert/strict";
import { cellLabel, phaseText, changedCells, openingOrigin } from "../src/ui/view-model.js";
import { RoundLoop, completedMatchId } from "../src/ui/round-loop.js";
import { frameDelay } from "../src/ui/animation.js";

test("charge labels describe ownership, proximity to burst, and legal actions", () => {
  assert.equal(cellLabel({ owner: 1, charge: 3 }, 11, 5, true), "B3, your blue cell, 3 charges, one charge from bursting. Charge this cell");
  assert.equal(cellLabel({ owner: 2, charge: 1 }, 13, 5, false), "D3, ghost coral cell, 1 charge");
  assert.equal(cellLabel({ owner: 0, charge: 0 }, 6, 5, true), "B2, empty. Claim this cell");
});

test("pass and breakthrough messaging makes the extra turn explicit without inventing ghost moves", () => {
  const game = { status: "playing", turns: [], archiveIds: [] };
  assert.match(phaseText(game, false), /first match teaches the ghost/);
  game.turns.push({ actor: 2, move: null, discovery: true });
  assert.equal(phaseText(game, false), "+1 breakthrough. The ghost passes; you play again.");
  game.turns[0].discovery = false;
  assert.equal(phaseText(game, false), "No remembered reply fits. The ghost passes; you play again.");
  assert.equal(phaseText({ ...game, status: "human" }, false), "You win. A new match starts shortly.");
  assert.equal(phaseText(game, true), "Reviewing a saved position. Return to your match to play.");
});

test("animation identifies captured cells even when their charge is unchanged", () => {
  const before = { size: 2, cells: [{ owner: 1, charge: 1 }, { owner: 2, charge: 2 }, { owner: 0, charge: 0 }, { owner: 1, charge: 3 }] };
  const after = { size: 2, cells: [{ owner: 1, charge: 1 }, { owner: 1, charge: 2 }, { owner: 1, charge: 1 }, { owner: 0, charge: 0 }] };
  assert.deepEqual(changedCells(before, after), [1, 2, 3]);
});

test("cascade timing keeps short waves readable and caps long playback at three seconds", () => {
  assert.equal(frameDelay(1, false), 240);
  assert.equal(frameDelay(4, true), 380);
  for (const count of [10, 30, 100, 400]) {
    assert.ok(count * frameDelay(count, true) + 440 <= 3000, `${count} frames stay within the ghost playback budget`);
    assert.ok(frameDelay(count, true) > 0, "every frame keeps a visible playback interval");
  }
});

test("historical starts explain the unanswered source and reversed colours", () => {
  const db = { games: [{ id: "first" }, { id: "second" }] };
  assert.equal(openingOrigin({}, db), "");
  assert.equal(openingOrigin({ startSource: { gameId: "second", turnIndex: 5 } }, db), "You’re playing the ghost’s unanswered position from match 2; colours reversed.");
});

test("automatic next match waits for animation and pauses during history review", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let advances = 0;
  const loop = new RoundLoop(() => advances++, 1400);
  loop.update("done");
  t.mock.timers.tick(1399);
  assert.equal(advances, 0);
  loop.update(null);
  t.mock.timers.tick(2000);
  assert.equal(advances, 0);
  loop.update("done");
  t.mock.timers.tick(1400);
  assert.equal(advances, 1);
  loop.update("done");
  t.mock.timers.tick(2000);
  assert.equal(advances, 1);
  loop.update("another");
  t.mock.timers.tick(1400);
  assert.equal(advances, 2);
});

test("a ghost win advances from the live match while archive controls are open", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let advances = 0;
  const loop = new RoundLoop(() => advances++);
  const game = { id: "ghost-win", status: "ghost" };
  // Expanding the archive does not select a historical position for review.
  const live = { reviewing: false, archiveOpen: true, busy: false, hidden: false, failed: false };
  loop.update(completedMatchId(game, { ...live, busy: true }));
  t.mock.timers.tick(2000);
  assert.equal(advances, 0, "the final ghost animation must finish first");
  loop.update(completedMatchId(game, live));
  t.mock.timers.tick(1400);
  assert.equal(advances, 1, "the live result restarts without closing the archive");
});

test("completed matches pause only for actual review, work, hidden tabs or errors", () => {
  const live = { reviewing: false, archiveOpen: true, busy: false, hidden: false, failed: false };
  for (const status of ["human", "ghost", "draw"]) {
    const game = { id: status, status };
    assert.equal(completedMatchId(game, live), status);
    for (const blocker of ["reviewing", "busy", "hidden", "failed"]) {
      assert.equal(completedMatchId(game, { ...live, [blocker]: true }), null);
    }
  }
  assert.equal(completedMatchId({ id: "live", status: "playing" }, live), null);
  assert.equal(completedMatchId({ id: "old", status: "abandoned" }, live), null);
});
