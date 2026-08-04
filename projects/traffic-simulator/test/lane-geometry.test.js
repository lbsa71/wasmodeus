import assert from "node:assert/strict";
import test from "node:test";

import {
  EAST,
  NORTH,
  SOUTH,
  WEST,
  lanePosition,
} from "../src/lane-geometry.js";

test("right-hand traffic occupies opposite sides in opposite directions", () => {
  assert.deepEqual(lanePosition(10.5, 20.5, EAST, 0.11), {
    x: 10.5,
    y: 20.61,
  });
  assert.deepEqual(lanePosition(10.5, 20.5, WEST, 0.11), {
    x: 10.5,
    y: 20.39,
  });
  assert.deepEqual(lanePosition(10.5, 20.5, SOUTH, 0.11), {
    x: 10.39,
    y: 20.5,
  });
  assert.deepEqual(lanePosition(10.5, 20.5, NORTH, 0.11), {
    x: 10.61,
    y: 20.5,
  });
});

test("unknown or stationary directions remain on the road center", () => {
  assert.deepEqual(lanePosition(3.5, 4.5, 0, 0.11), { x: 3.5, y: 4.5 });
});

test("four-lane roads place the slow lane outside the passing lane", () => {
  assert.deepEqual(
    lanePosition(10.5, 20.5, EAST, { fourLane: true, lane: 0 }),
    { x: 10.5, y: 20.79 },
  );
  assert.deepEqual(
    lanePosition(10.5, 20.5, EAST, { fourLane: true, lane: 1 }),
    { x: 10.5, y: 20.6 },
  );
  assert.deepEqual(
    lanePosition(10.5, 20.5, WEST, { fourLane: true, lane: 0 }),
    { x: 10.5, y: 20.21 },
  );
  assert.deepEqual(
    lanePosition(10.5, 20.5, WEST, { fourLane: true, lane: 1 }),
    { x: 10.5, y: 20.4 },
  );
});
