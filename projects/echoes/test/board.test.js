import test from "node:test";
import assert from "node:assert/strict";
import { viewport, cellPoint } from "../src/ui/board.js";
import { opening, legalMoves, applyMove } from "../src/core/rules.js";
import { transformBoard } from "../src/core/symmetry.js";

test("the playable viewport includes every legal target even at negative coordinates", () => {
  for (const board of [opening(), transformBoard(opening(), { orientation: 3, dx: -20, dy: 40 })]) {
    const view = viewport(board);
    for (const p of [...board.stones, ...legalMoves(board).map(m => m.to)]) {
      assert.ok(p.x >= view.minX && p.x < view.minX + view.columns);
      assert.ok(p.y >= view.minY && p.y < view.minY + view.rows);
    }
    assert.deepEqual(cellPoint(view, 0, 0), { x: view.minX, y: view.minY + view.rows - 1 });
  }
});
test("a historical movement's departed cell remains visible when showing its arrow", () => {
  const before = opening();
  const move = legalMoves(before)[0];
  const view = viewport(applyMove(before, move), move);
  assert.ok(move.from.x >= view.minX && move.from.x < view.minX + view.columns);
  assert.ok(move.from.y >= view.minY && move.from.y < view.minY + view.rows);
});
