import assert from "node:assert/strict";
import test from "node:test";

import { CAR_SHADER, WORLD_SHADER } from "../src/shaders.js";

test("non-buildable WebGPU tiles do not render road centers", () => {
  assert.match(
    WORLD_SHADER,
    /let center = connectivity != 0u && centeredX && centeredY;/,
  );
  assert.match(WORLD_SHADER, /let buildable = \(tileData & 16u\) != 0u;/);
});

test("WebGPU widens arterial tiles and renders distinct passing lanes", () => {
  assert.match(WORLD_SHADER, /let fourLane = \(tileData & 32u\) != 0u;/);
  assert.match(WORLD_SHADER, /select\(scene\.roadHalfWidth, 0\.43, fourLane\)/);
  assert.match(CAR_SHADER, /@binding\(4\).*packedLanes/);
  assert.match(CAR_SHADER, /@binding\(5\).*carSegments/);
  assert.match(CAR_SHADER, /@binding\(6\).*packedRoadTiles/);
  assert.match(CAR_SHADER, /@binding\(7\).*packedActiveCars/);
  assert.match(CAR_SHADER, /if \(!carIsActive\)/);
  assert.match(CAR_SHADER, /select\(0\.29, 0\.10, lane == 1u\)/);
});

test("WebGPU gives shared home and work plots distinct map colors", () => {
  assert.match(WORLD_SHADER, /let homePlot = \(tileData & 64u\) != 0u;/);
  assert.match(WORLD_SHADER, /let workPlot = \(tileData & 128u\) != 0u;/);
  assert.match(WORLD_SHADER, /homePlotColor/);
  assert.match(WORLD_SHADER, /workPlotColor/);
});
