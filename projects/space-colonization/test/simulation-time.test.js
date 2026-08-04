import test from "node:test";
import assert from "node:assert/strict";

import { addSimulationSeconds } from "../src/core/simulation-time.js";

test("split simulation time preserves sub-day time while crossing epoch boundaries", () => {
  assert.deepEqual(addSimulationSeconds({ epochDays: 10n, secondsOfDay: 86_399 }, 2), { epochDays: 11n, secondsOfDay: 1 });
  assert.deepEqual(addSimulationSeconds({ epochDays: 10n, secondsOfDay: 1 }, -2), { epochDays: 9n, secondsOfDay: 86_399 });
});
