import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { opening, legalMoves, isLegal, applyMove } from "../src/core/rules.js";
import { WasmRules } from "../src/core/wasm-rules.js";

async function engine() {
  const { instance } = await WebAssembly.instantiate(await readFile(new URL("../public/echoes2.wasm", import.meta.url)), { env: { abort() { throw new Error("WASM assertion failed"); } } });
  return new WasmRules(instance.exports);
}

test("compiled WASM matches legal moves, captured ownership and every cascade wave", async () => {
  const wasm = await engine();
  let board = opening();
  for (let step = 0; step < 120; step++) {
    const actor = step % 2 + 1;
    for (let index = 0; index < 25; index++) assert.equal(wasm.isLegal(board, index, actor), isLegal(board, index, actor));
    const moves = legalMoves(board, actor);
    assert.deepEqual(wasm.legalMoves(board, actor), moves);
    if (!moves.length) { board = opening(); continue; }
    const index = moves[(step * 7 + Math.floor(step / 3)) % moves.length];
    const result = applyMove(board, index, actor);
    assert.deepEqual(wasm.applyMove(board, index, actor), result);
    board = result.board;
  }
});

test("compiled WASM handles multi-wave overload and corner dissipation", async () => {
  const wasm = await engine();
  const board = { size: 5, cells: Array.from({ length: 25 }, (_, index) => ({ owner: index % 2 + 1, charge: 3 })) };
  assert.deepEqual(wasm.applyMove(board, 12, 1), applyMove(board, 12, 1));
  board.cells = Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 }));
  board.cells[0] = { owner: 2, charge: 3 };
  assert.deepEqual(wasm.applyMove(board, 0, 2), applyMove(board, 0, 2));
});

test("WASM loader rejects malformed boards and recovers for a later valid board", async () => {
  const wasm = await engine();
  const invalid = [null, {}, { ...opening(), size: 4 }, { ...opening(), cells: [] }];
  for (const cell of [{ owner: 0, charge: 1 }, { owner: 1, charge: 0 }, { owner: 1, charge: 4 }, { owner: 1, charge: 0.5 }, { owner: 3, charge: 1 }, null]) {
    const board = opening();
    board.cells[0] = cell;
    invalid.push(board);
  }
  for (const board of invalid) {
    assert.equal(wasm.isLegal(board, 11, 1), false);
    assert.throws(() => wasm.applyMove(board, 11, 1), /Illegal move/);
  }
  for (const [index, actor] of [[-1, 1], [25, 1], [11.5, 1], [11, 0], [11, 3], [11, 1.5]]) {
    assert.equal(wasm.isLegal(opening(), index, actor), false);
    assert.throws(() => wasm.applyMove(opening(), index, actor), /Illegal move/);
  }
  assert.deepEqual(wasm.applyMove(opening(), 11, 1), applyMove(opening(), 11, 1));
});

test("compiled WASM itself rejects partial or invalid cell loads", async () => {
  const wasm = await engine(), raw = wasm.exports;
  raw.clear();
  raw.putCell(11, 1, 2);
  assert.equal(raw.canMove(11, 1), 0);
  assert.equal(raw.play(11, 1), 0);
  for (const cell of [[0, 1], [1, 0], [3, 1], [1, 4]]) {
    raw.clear();
    opening().cells.forEach((valid, index) => raw.putCell(index, valid.owner, valid.charge));
    raw.putCell(0, ...cell);
    assert.equal(raw.canMove(11, 1), 0);
    assert.equal(raw.play(11, 1), 0);
  }
  raw.clear();
  assert.equal(raw.getOwner(-1, 0), -1);
  assert.equal(raw.getCharge(0, 25), -1);
  assert.equal(raw.didBurst(0, 0), 0);
});
