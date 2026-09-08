import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_WORLD_SIZE, WORLD_SIZES, defaultSettings, suggestedLemmings } from "../src/core/settings.js";

test("a run starts in the small world, and every size is the same shape", () => {
  // Brains learn faster where the gold is dense; the arena is grown later.
  assert.equal(DEFAULT_WORLD_SIZE, "small");
  assert.deepEqual(defaultSettings().world, WORLD_SIZES.small);
  const ratio = WORLD_SIZES.small.width / WORLD_SIZES.small.height;
  for (const [name, size] of Object.entries(WORLD_SIZES)) {
    assert.ok(Math.abs(size.width / size.height - ratio) < 1e-9, `${name} has a different aspect`);
    assert.equal(size.width % 256, 0, `${name}'s width is not a whole number of workgroups`);
  }
  assert.ok(WORLD_SIZES.small.width < WORLD_SIZES.medium.width && WORLD_SIZES.medium.width < WORLD_SIZES.large.width);
});

test("the crew is sized to the surface, so every arena is as crowded as the next", () => {
  assert.equal(suggestedLemmings(WORLD_SIZES.small), 192);
  assert.equal(suggestedLemmings(WORLD_SIZES.medium), 384);
  assert.equal(suggestedLemmings(WORLD_SIZES.large), 600, "and never more than the slider's habit");
  assert.equal(defaultSettings().agents.count, suggestedLemmings(WORLD_SIZES[DEFAULT_WORLD_SIZE]));
});
