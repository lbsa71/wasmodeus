import test from "node:test";
import assert from "node:assert/strict";

import { lockPositionForBody } from "../src/core/focus-lock.js";

test("focus lock keeps stars and planets on their own moving frame origins", () => {
  const star = [10, 20, 30];
  const planets = [[11, 20, 30], [14, 20, 30]];
  assert.deepEqual(lockPositionForBody(0, star, planets), star);
  assert.deepEqual(lockPositionForBody(0x02000000, star, planets), planets[1]);
});
