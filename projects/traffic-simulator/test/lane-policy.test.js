import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseTravelLane,
  markStraightArterials,
} from "../src/lane-policy.js";

const EAST = 2;
const WEST = 8;
const HORIZONTAL = EAST | WEST;

test("four-lane eligibility is limited to the buffered middle of long runs", () => {
  const tiles = new Uint8Array(28);
  tiles.fill(HORIZONTAL, 1, 13);
  tiles.fill(HORIZONTAL, 15, 22);

  const arterials = markStraightArterials(tiles, 28, 1, {
    minimumRun: 12,
    transitionBuffer: 2,
  });

  assert.deepEqual(
    [...arterials],
    [
      0,
      0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0,
    ],
  );
});

test("a blocked faster car overtakes only when the passing lane is clear", () => {
  assert.equal(
    chooseTravelLane({
      currentLane: 0,
      distanceToLaneEnd: 8,
      onFourLane: true,
      passingFollowerDistance: 2,
      passingLeaderDistance: 4,
      slowLeaderDistance: 0.4,
    }),
    1,
  );
  assert.equal(
    chooseTravelLane({
      currentLane: 0,
      distanceToLaneEnd: 8,
      onFourLane: true,
      passingFollowerDistance: 0.1,
      passingLeaderDistance: 4,
      slowLeaderDistance: 0.7,
    }),
    0,
  );
});

test("passing cars return to the slow lane when safely clear", () => {
  assert.equal(
    chooseTravelLane({
      currentLane: 1,
      distanceToLaneEnd: 8,
      onFourLane: true,
      passingFollowerDistance: 3,
      passingLeaderDistance: 4,
      slowFollowerDistance: 2,
      slowLeaderDistance: 3,
    }),
    0,
  );
  assert.equal(
    chooseTravelLane({
      currentLane: 1,
      distanceToLaneEnd: 8,
      onFourLane: true,
      passingFollowerDistance: 3,
      passingLeaderDistance: 4,
      slowFollowerDistance: 0.1,
      slowLeaderDistance: 3,
    }),
    1,
  );
  assert.equal(
    chooseTravelLane({
      currentLane: 1,
      distanceToLaneEnd: 1,
      onFourLane: true,
      passingFollowerDistance: 3,
      passingLeaderDistance: 4,
      slowFollowerDistance: 2,
      slowLeaderDistance: 3,
    }),
    0,
  );
  assert.equal(
    chooseTravelLane({
      currentLane: 1,
      distanceToLaneEnd: 1,
      onFourLane: true,
      passingFollowerDistance: 3,
      passingLeaderDistance: 4,
      slowFollowerDistance: 0.1,
      slowLeaderDistance: 3,
    }),
    1,
  );
  assert.equal(
    chooseTravelLane({
      currentLane: 1,
      distanceToLaneEnd: 1,
      onFourLane: true,
      passingFollowerDistance: 3,
      passingLeaderDistance: 4,
      slowFollowerDistance: 0.55,
      slowLeaderDistance: 0.55,
    }),
    0,
  );
});
