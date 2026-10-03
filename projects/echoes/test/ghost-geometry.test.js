import test from "node:test";
import assert from "node:assert/strict";
import { boardPoint, ghostGeometry } from "../src/ui/ghost-geometry.js";
import { opening, applyMove } from "../src/core/rules.js";
import { transformBoard } from "../src/core/symmetry.js";

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
const nearPoint = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); };
const average = points => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length });
const mapped = (point, [a, b, c, d, e, f]) => ({ x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f });

test("board positions map to cell centers with screen y increasing downward", () => {
  const view = { minX: -3, minY: 8, columns: 10, rows: 5 };
  assert.deepEqual(boardPoint(view, { x: -3, y: 12 }), { x: 5, y: 10 });
  assert.deepEqual(boardPoint(view, { x: 6, y: 8 }), { x: 95, y: 90 });
});

test("all eight ghost orientations align every source stone and its rest marker on the live board", () => {
  const original = transformBoard(applyMove(opening(), { from: { x: 2, y: 2 }, to: { x: 2, y: 1 } }), { orientation: 0, dx: 1500, dy: -900 });
  for (let orientation = 0; orientation < 8; orientation++) {
    const transform = { orientation, dx: -27, dy: 43 };
    const target = transformBoard(original, transform);
    // Unequal axis scales catch screen-space matrices that only work on a square viewport.
    const view = { minX: Math.min(...target.stones.map(p => p.x)) - 4, minY: Math.min(...target.stones.map(p => p.y)) - 3, columns: 11, rows: 9 };
    const inputs = structuredClone({ original, target, transform, view });
    const geometry = ghostGeometry(original, target, transform, view);
    assert.equal(geometry.matrix.length, 6);
    nearPoint(average(geometry.stones), average(target.stones.map(p => boardPoint(view, p))));
    for (const [index, point] of geometry.stones.entries()) {
      assert.ok(point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100);
      nearPoint(mapped(point, geometry.matrix), boardPoint(view, target.stones[index]));
    }
    nearPoint(mapped(geometry.resting, geometry.matrix), boardPoint(view, target.resting));
    const sourceDelta = { x: geometry.stones[1].x - geometry.stones[0].x, y: geometry.stones[1].y - geometry.stones[0].y };
    const before = original.stones.map(p => boardPoint(view, p));
    nearPoint(sourceDelta, { x: before[1].x - before[0].x, y: before[1].y - before[0].y });
    assert.deepEqual({ original, target, transform, view }, inputs, "animation geometry must leave saved history untouched");
  }
});

test("a quarter-turn uses the opposite screen rotation and mirrors retain negative determinant", () => {
  const original = opening();
  const view = { minX: -4, minY: -4, columns: 10, rows: 10 };
  const rotation = { orientation: 1, dx: 2, dy: 0 };
  const matrix = ghostGeometry(original, transformBoard(original, rotation), rotation, view).matrix;
  near(matrix[0], 0); near(matrix[1], -1); near(matrix[2], 1); near(matrix[3], 0);
  for (let orientation = 4; orientation < 8; orientation++) {
    const transform = { orientation, dx: 0, dy: 0 };
    const [a, b, c, d] = ghostGeometry(original, transformBoard(original, transform), transform, view).matrix;
    near(a * d - b * c, -1);
  }
});
