import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { opening, legalMoves, isLegal, applyMove } from "../src/core/rules.js";
import { WasmRules } from "../src/core/wasm-rules.js";

test("compiled WASM agrees with JS on legality through a deterministic walk and rejects undo", async () => {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL("../public/echoes.wasm", import.meta.url)), { env: { abort() { throw new Error("WASM assertion failed"); } } });
  const engine = new WasmRules(instance.exports);
  let board = opening();
  for (let step = 0; step < 100; step++) {
    for (const stone of board.stones) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const move = { from: stone, to: { x: stone.x + dx, y: stone.y + dy } };
        assert.equal(engine.isLegal(board, move), isLegal(board, move));
      }
    }
    const moves = legalMoves(board);
    const move = moves[(step * 7) % moves.length];
    board = applyMove(board, move);
    assert.equal(engine.isLegal(board, { from: move.to, to: move.from }), false);
  }
});
