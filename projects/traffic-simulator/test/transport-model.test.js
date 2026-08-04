import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_COMMUTE_TILES,
  MAX_EARLY_ARRIVAL_MINUTES,
  MAX_DESIRED_SPEED_TILES_PER_SECOND,
  MIN_DESIRED_SPEED_TILES_PER_SECOND,
  SIM_MINUTES_PER_REAL_SECOND,
  TILE_LENGTH_METERS,
  commuteMinutes,
  speedKilometersPerHour,
} from "../src/transport-model.js";

test("transport units describe plausible urban road segments and speeds", () => {
  assert.equal(TILE_LENGTH_METERS, 50);
  assert.equal(SIM_MINUTES_PER_REAL_SECOND, 1);
  assert.equal(
    speedKilometersPerHour(MIN_DESIRED_SPEED_TILES_PER_SECOND),
    18,
  );
  assert.equal(
    speedKilometersPerHour(MAX_DESIRED_SPEED_TILES_PER_SECOND),
    36,
  );
});

test("the longest assigned commute leaves congestion margin inside one hour", () => {
  assert.equal(MAX_COMMUTE_TILES * TILE_LENGTH_METERS, 12_000);
  assert.equal(MAX_EARLY_ARRIVAL_MINUTES, 45);
  assert.equal(
    commuteMinutes(
      MAX_COMMUTE_TILES,
      MIN_DESIRED_SPEED_TILES_PER_SECOND,
    ),
    40,
  );
});
