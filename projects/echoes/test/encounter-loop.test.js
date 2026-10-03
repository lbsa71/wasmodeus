import test from "node:test";
import assert from "node:assert/strict";
import { EncounterLoop } from "../src/ui/encounter-loop.js";

test("completion advances automatically once despite redraws, and history review pauses it", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let advances = 0;
  const loop = new EncounterLoop(() => advances++, 750);
  loop.update("finished-game"); loop.update("finished-game");
  t.mock.timers.tick(749);
  assert.equal(advances, 0);
  loop.update(null);
  t.mock.timers.tick(1000);
  assert.equal(advances, 0, "reviewing history cancels the pending transition");
  loop.update("finished-game");
  t.mock.timers.tick(750);
  assert.equal(advances, 1);
  loop.update("finished-game");
  t.mock.timers.tick(750);
  assert.equal(advances, 1, "redraw cannot queue a duplicate successor");
  loop.update(null);
  loop.update("next-finished-game");
  t.mock.timers.tick(750);
  assert.equal(advances, 2);
});
