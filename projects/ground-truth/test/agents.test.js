import test from "node:test";
import assert from "node:assert/strict";

import {
  AGENT_ALIVE_BIT,
  MAX_AGENT_TIMER,
  MODE_DIG,
  MODE_FUSE,
  MODE_WALK,
  packAgent,
  tick,
  timerFor,
  unpackAgent,
  walkDecision,
} from "../src/core/agents.js";

test("an agent round-trips through its packed word", () => {
  for (const mode of [MODE_WALK, MODE_DIG, MODE_FUSE]) {
    for (const facing of [-1, 1]) {
      const agent = { alive: true, mode, facing, timer: 37 };
      assert.deepEqual(unpackAgent(packAgent(agent)), agent);
    }
  }
});

test("a dead agent is dead whatever else the word says", () => {
  const word = packAgent({ alive: false, mode: MODE_FUSE, facing: 1, timer: 9 });
  assert.equal(word & AGENT_ALIVE_BIT, 0);
  assert.equal(unpackAgent(word).alive, false);
});

test("facing is a direction, never zero", () => {
  // It is stored as one bit but multiplied as a step, so it has to come back
  // as -1 or 1 or a lemming would walk on the spot.
  assert.equal(unpackAgent(packAgent({ alive: true, mode: 0, facing: -1, timer: 0 })).facing, -1);
  assert.equal(unpackAgent(packAgent({ alive: true, mode: 0, facing: 1, timer: 0 })).facing, 1);
});

test("a timer beyond eight bits is clamped rather than wrapped", () => {
  // Wrapping would turn a long fuse into an instant one.
  assert.equal(unpackAgent(packAgent({ alive: true, mode: 0, facing: 1, timer: 9999 })).timer, MAX_AGENT_TIMER);
  assert.equal(unpackAgent(packAgent({ alive: true, mode: 0, facing: 1, timer: -5 })).timer, 0);
});

test("nothing underfoot beats everything else", () => {
  // A lemming whose floor has just been dug away or blown out falls, whatever
  // it happened to be doing and whatever is in front of it.
  const fall = walkDecision({ ground: false, ahead: true, aboveAhead: true }, 1);
  assert.equal(fall.action, "fall");
  assert.equal(fall.facing, 1, "falling does not turn it round");
});

test("it walks on when the way is clear", () => {
  assert.deepEqual(walkDecision({ ground: true, ahead: false, aboveAhead: false }, 1),
    { action: "walk", facing: 1 });
});

test("it steps up a single cell but turns at anything taller", () => {
  // This is what lets one follow the floor of a cave instead of stalling on
  // every bump in it.
  assert.equal(walkDecision({ ground: true, ahead: true, aboveAhead: false }, 1).action, "climb");
  const turn = walkDecision({ ground: true, ahead: true, aboveAhead: true }, 1);
  assert.equal(turn.action, "turn");
  assert.equal(turn.facing, -1, "and it must actually reverse");
});

test("turning twice returns it to its original heading", () => {
  const wall = { ground: true, ahead: true, aboveAhead: true };
  const once = walkDecision(wall, 1);
  assert.equal(walkDecision(wall, once.facing).facing, 1);
});

test("a countdown reaches zero and fires exactly once", () => {
  let timer = 3;
  const fired = [];
  for (let frame = 0; frame < 5; frame += 1) {
    const step = tick(timer);
    fired.push(step.fired);
    timer = step.timer;
    if (step.fired) break;
  }
  assert.deepEqual(fired, [false, false, true]);
  assert.equal(timer, 0);
});

test("timers are deterministic and stay inside their range", () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const value = timerFor(seed, 30, 90);
    assert.ok(value >= 30 && value <= 90, `seed ${seed} gave ${value}`);
    assert.equal(value, timerFor(seed, 30, 90), "and must be repeatable");
  }
});

test("a degenerate range does not divide by zero", () => {
  assert.equal(timerFor(7, 40, 40), 40);
});
