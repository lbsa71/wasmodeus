import test from "node:test";
import assert from "node:assert/strict";
import { cameraFor, projectPoint, fishAppearance, edgeIndicator, nearestOffscreen } from "../src/ui/view-model.js";

const config = { startMass: 4, baseRadius: 20 };
const player = { id: "you", kind: "player", state: "active", x: 120, y: -45, heading: 0, mass: 4, bornTick: 0 };
const fish = (values) => ({ ...player, id: "other", kind: "ghost", x: 500, ...values });

test("growth changes visible world scale while the player's apparent radius remains constant", () => {
  for (const mass of [1, 4, 16, 400]) {
    const camera = cameraFor({ ...player, mass }, config, 960, 600);
    assert.equal(camera.radius * camera.scale, 18);
    assert.deepEqual(projectPoint(player, camera), { x: 480, y: 300 });
    assert.equal(camera.worldWidth, 960 / camera.scale);
  }
  assert.equal(cameraFor({ ...player, mass: 16 }, config, 960, 600).worldWidth,
    cameraFor(player, config, 960, 600).worldWidth * 2);
});

test("only active larger fish are threats, while large passive fish remain inedible", () => {
  assert.equal(fishAppearance(fish({ mass: 8 }), player.mass).role, "threat");
  assert.equal(fishAppearance(fish({ mass: 8, state: "passive" }), player.mass).role, "passive");
  assert.equal(fishAppearance(fish({ mass: 8, state: "passive" }), player.mass).edible, false);
  assert.equal(fishAppearance(fish({ mass: 2, state: "passive" }), player.mass).edible, true);
  assert.equal(fishAppearance(fish({ mass: 4 }), player.mass).role, "threat");
  assert.equal(fishAppearance(fish({ mass: 3.9 }), player.mass).edible, true);
  assert.equal(fishAppearance(fish({ mass: 4.1 }), player.mass).role, 'threat');
  assert.equal(fishAppearance(fish({ mass: 4, state: 'passive' }), player.mass).edible, true);
});

test("offscreen indicators stay inside rectangular viewport with correct heading", () => {
  const camera = cameraFor(player, config, 960, 600);
  assert.equal(edgeIndicator({ x: 480, y: 300 }, camera), null);
  assert.deepEqual(edgeIndicator({ x: 2000, y: 300 }, camera), { x: 926, y: 300, angle: 0 });
  const diagonal = edgeIndicator({ x: -1000, y: -1000 }, camera);
  assert.ok(diagonal.x >= 34 && diagonal.x <= 926);
  assert.ok(diagonal.y >= 34 && diagonal.y <= 566);
});

test("navigation selects nearest offscreen edible fish and active threat, ignoring eaten fish", () => {
  const camera = cameraFor(player, config, 960, 600);
  const food = fish({ id: "food", x: 1000, mass: 2 });
  const threat = fish({ id: "threat", x: -900, mass: 8 });
  const result = nearestOffscreen([player, food, threat,
    fish({ id: "gone", x: 700, mass: 1, state: "eaten" }),
    fish({ id: "near", x: 130, mass: 1 }),
    fish({ id: "large-passive", x: 800, mass: 9, state: "passive" })], player, camera);
  assert.equal(result.food?.fish.id, "food");
  assert.equal(result.threat?.fish.id, "threat");
});
