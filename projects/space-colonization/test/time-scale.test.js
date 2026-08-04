import test from "node:test";
import assert from "node:assert/strict";

import { formatTimeScale, timeScaleFromSlider } from "../src/core/time-scale.js";

test("the logarithmic time scale spans realtime through one Myr per second", () => {
  assert.equal(timeScaleFromSlider(0), 0.01);
  assert.ok(Math.abs(timeScaleFromSlider(1_000) - 31_557_600_000_000) < 1);
  assert.equal(formatTimeScale(86_400), "1 day/s");
  assert.equal(formatTimeScale(31_557_600_000_000), "1 Myr/s");
});
