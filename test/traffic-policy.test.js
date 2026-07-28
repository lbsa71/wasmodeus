import assert from "node:assert/strict";
import test from "node:test";

import {
  areMovementsCompatible,
  followingTargetSpeed,
  planConflictCorridor,
  shortestNextHop,
} from "../src/traffic-policy.js";

test("movement compatibility permits platoons and non-crossing flows", () => {
  assert.equal(areMovementsCompatible(1, 1), true);
  assert.equal(areMovementsCompatible(5, 15), true);
  assert.equal(areMovementsCompatible(1, 9), false);
});

test("time headway reduces speed without violating the fixed gap", () => {
  assert.equal(
    followingTargetSpeed({ desiredSpeed: 6, leaderDistance: 0.24 }),
    0,
  );
  assert.ok(
    followingTargetSpeed({ desiredSpeed: 6, leaderDistance: 0.6 }) < 6,
  );
  assert.equal(
    followingTargetSpeed({ desiredSpeed: 6, leaderDistance: 10 }),
    6,
  );
});

test("adjacent conflict tiles form one bounded atomic corridor", () => {
  const route = new Map([
    ["approach", { movement: 1, next: "t-west" }],
    ["t-west", { movement: 1, next: "t-east" }],
    ["t-east", { movement: 6, next: "exit" }],
  ]);
  const corridor = planConflictCorridor({
    firstConflict: "t-west",
    isConflict: (tile) => tile.startsWith("t-"),
    maxTiles: 8,
    nextStep: (tile) => route.get(tile),
  });

  assert.deepEqual(corridor, {
    complete: true,
    exit: "exit",
    movements: [1, 6],
    tiles: ["t-west", "t-east"],
  });
});

test("small-map routing returns a deterministic shortest next hop", () => {
  const graph = new Map([
    ["a", ["b"]],
    ["b", ["a", "c", "d"]],
    ["c", ["b", "target"]],
    ["d", ["b", "target"]],
    ["target", ["c", "d"]],
  ]);

  assert.equal(shortestNextHop(graph, "a", "target"), "b");
  assert.equal(shortestNextHop(graph, "b", "target"), "c");
  assert.equal(shortestNextHop(graph, "target", "target"), "target");
});
