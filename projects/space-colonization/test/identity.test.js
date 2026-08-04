import test from "node:test";
import assert from "node:assert/strict";

import { bodyKind, galaxyId } from "../src/core/identity.js";

test("galaxy and body identities are stable and self-describing", () => {
  assert.equal(galaxyId(0x5EEDC0DEn), "mw-v1:000000005eedc0de");
  assert.equal(bodyKind(0), "STAR");
  assert.equal(bodyKind(0x03000000), "PLANET 3");
  assert.equal(bodyKind(0x03020000), "MOON 2 OF PLANET 3");
});
