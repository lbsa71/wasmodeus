import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { opening, legalMoves, applyMove, canonicalPosition } from "../src/core/rules.js";
import { WasmRules } from "../src/core/wasm-rules.js";

async function engine() {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL("../public/echoes3.wasm", import.meta.url)), { env: { abort() { throw new Error("WASM assertion failed"); } } });
  return new WasmRules(instance.exports);
}

test("compiled WASM matches every reachable transition from the opening", async () => {
  const wasm = await engine(), seen = new Set(), queue = [opening()];
  while (queue.length) {
    const position = queue.pop();
    if (seen.has(position)) continue;
    seen.add(position);
    const moves = legalMoves(position);
    assert.deepEqual(wasm.legalMoves(position), moves);
    for (const move of moves) {
      assert.equal(wasm.isLegal(position, move), true);
      const expected = applyMove(position, move);
      assert.deepEqual(wasm.applyMove(position, move), expected);
      queue.push(expected.position);
    }
  }
  assert.ok(seen.size > 20, `visited ${seen.size} distinct positions`);
});

test("compiled regrowth duplicates the pruned subtree with correct parent links", async () => {
  const wasm = await engine();
  for (const position of ["((()))", "((()()()))", "(((())))", "((())(()))", canonicalPosition("(()((()())())(()))")]) {
    for (const move of legalMoves(position)) assert.deepEqual(wasm.applyMove(position, move), applyMove(position, move));
  }
  const wide = `(${"()".repeat(6000)})`;
  assert.deepEqual(wasm.applyMove(wide, [5999]), applyMove(wide, [5999]));
});

test("WASM bridge rejects malformed positions and paths, then recovers", async () => {
  const wasm = await engine();
  for (const position of [null, {}, "", "()()", "(()(()))"]) {
    assert.deepEqual(wasm.legalMoves(position), []);
    assert.equal(wasm.isLegal(position, [0]), false);
    assert.throws(() => wasm.applyMove(position, [0]), /Illegal move/);
  }
  for (const move of [[], [0], [-1], [999], [0, 0.2], null, "0", ["0"]]) {
    assert.equal(wasm.isLegal(opening(), move), false);
    assert.throws(() => wasm.applyMove(opening(), move), /Illegal move/);
  }
  assert.deepEqual(wasm.applyMove(opening(), [1]), applyMove(opening(), [1]));
});

test("raw WASM rejects absent roots, second roots, invalid preorder and nonleaf cuts", async () => {
  const raw = (await engine()).exports;
  for (const parents of [[], [0], [-1, -1], [-1, 2], [-1, 0, 0, 1], [-1, -2]]) {
    raw.clear();
    for (const parent of parents) raw.appendNode(parent);
    assert.equal(raw.canMove(1), 0);
    assert.equal(raw.play(1), 0);
  }
  raw.clear();
  [-1, 0, 1].forEach(parent => raw.appendNode(parent));
  assert.equal(raw.canMove(0), 0);
  assert.equal(raw.canMove(1), 0);
  assert.equal(raw.canMove(2), 1);
  assert.equal(raw.play(1), 0);
  assert.equal(raw.play(2), 3);
  assert.equal(raw.didRegrow(), 1);
  assert.deepEqual([0, 1, 2].map(index => raw.getParent(index)), [-1, 0, 0]);
  assert.equal(raw.getParent(3), -2);
  assert.equal(raw.getParent(-1), -2);
});
