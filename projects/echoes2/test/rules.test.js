import assert from "node:assert/strict";
import test from "node:test";
import { opening, isLegal, legalMoves, applyMove, territory, winner } from "../src/core/rules.js";

const empty = () => ({ size: 5, cells: Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 })) });

test("opening is balanced and placement grows only adjacent territory", () => {
  const board = opening();
  assert.equal(board.size, 5);
  assert.deepEqual(board.cells[11], { owner: 1, charge: 2 });
  assert.deepEqual(board.cells[13], { owner: 2, charge: 2 });
  assert.deepEqual(legalMoves(board, 1), [6, 10, 11, 12, 16]);
  assert.deepEqual(legalMoves(board, 2), [8, 12, 13, 14, 18]);
  assert.equal(isLegal(board, 13, 1), false);
  assert.equal(isLegal(board, 0, 1), false);
  assert.equal(territory(board, 1), 1);
  assert.equal(winner(board), 0);
  board.cells[11].charge = 3;
  assert.equal(opening().cells[11].charge, 2);
});

test("placing a charge is immutable and produces an initial animation frame", () => {
  const board = opening(), original = structuredClone(board);
  const result = applyMove(board, 12, 1);
  assert.deepEqual(board, original);
  assert.deepEqual(result.board.cells[12], { owner: 1, charge: 1 });
  assert.deepEqual(result.frames, [result.board]);
  assert.deepEqual(result.bursts, [[]]);
  result.board.cells[12].charge = 2;
  assert.equal(result.frames[0].cells[12].charge, 1);
});

test("cascades capture enemy charges and resolve in simultaneous animation waves", () => {
  const board = empty();
  board.cells[12] = { owner: 1, charge: 3 };
  board.cells[11] = { owner: 2, charge: 3 };
  const result = applyMove(board, 12, 1);
  assert.deepEqual(result.bursts, [[], [12], [11]]);
  assert.equal(result.frames[0].cells[12].charge, 4);
  assert.deepEqual(result.frames[1].cells[11], { owner: 1, charge: 4 });
  assert.deepEqual(result.frames[2].cells[11], { owner: 0, charge: 0 });
  assert.deepEqual(result.board.cells[12], { owner: 1, charge: 1 });
  assert.deepEqual(result.board.cells.filter(cell => cell.charge).map(cell => cell.owner), Array(7).fill(1));
  assert.equal(winner(result.board), 1);
  assert.equal(territory(result.board, 1), 7);
});

test("corner bursts dissipate off-board charges rather than wrapping to another row", () => {
  const board = empty();
  board.cells[0] = { owner: 2, charge: 3 };
  const result = applyMove(board, 0, 2);
  assert.deepEqual(result.bursts, [[], [0]]);
  assert.deepEqual(result.board.cells.map((cell, index) => cell.charge ? index : -1).filter(index => index >= 0), [1, 5]);
  assert.equal(result.board.cells.reduce((sum, cell) => sum + cell.charge, 0), 2);
});

test("a full charged board stabilizes with bounded waves and conserves or dissipates mass", () => {
  const board = { size: 5, cells: Array.from({ length: 25 }, (_, index) => ({ owner: index % 2 + 1, charge: 3 })) };
  const result = applyMove(board, 12, 1);
  assert.ok(result.frames.length > 3);
  assert.ok(result.bursts.flat().length <= 342);
  assert.ok(result.board.cells.every(cell => cell.charge >= 0 && cell.charge <= 3));
  assert.ok(result.board.cells.reduce((sum, cell) => sum + cell.charge, 0) < 76);
  assert.ok(result.board.cells.every(cell => cell.charge === 0 ? cell.owner === 0 : cell.owner === 1));
});

test("legality and complete cascade waves preserve all eight board symmetries", () => {
  const board = empty();
  board.cells[6] = { owner: 1, charge: 3 };
  board.cells[7] = { owner: 2, charge: 3 };
  board.cells[11] = { owner: 2, charge: 3 };
  board.cells[12] = { owner: 2, charge: 2 };
  const reference = applyMove(board, 6, 1);
  for (let orientation = 0; orientation < 8; orientation++) {
    const mapIndex = index => {
      let x = index % 5, y = Math.floor(index / 5);
      if (orientation >= 4) x = 4 - x;
      for (let turn = 0; turn < orientation % 4; turn++) [x, y] = [4 - y, x];
      return y * 5 + x;
    };
    const transform = source => {
      const result = empty();
      source.cells.forEach((cell, index) => { result.cells[mapIndex(index)] = { ...cell }; });
      return result;
    };
    const rotated = transform(board);
    assert.deepEqual(legalMoves(rotated, 1), legalMoves(board, 1).map(mapIndex).sort((a, b) => a - b));
    const result = applyMove(rotated, mapIndex(6), 1);
    assert.deepEqual(result.board, transform(reference.board));
    assert.deepEqual(result.frames, reference.frames.map(transform));
    assert.deepEqual(result.bursts, reference.bursts.map(wave => wave.map(mapIndex).sort((a, b) => a - b)));
  }
});

test("malformed input and illegal placements are rejected without mutating the board", () => {
  const malformed = [null, {}, { ...opening(), size: 4 }, { ...opening(), cells: [] }];
  for (const cell of [{ owner: 0, charge: 1 }, { owner: 1, charge: 0 }, { owner: 3, charge: 1 }, { owner: 1, charge: 4 }, { owner: 1, charge: 1.5 }, null]) {
    const board = opening();
    board.cells[0] = cell;
    malformed.push(board);
  }
  for (const board of malformed) {
    assert.equal(isLegal(board, 11, 1), false);
    assert.deepEqual(legalMoves(board, 1), []);
    assert.throws(() => applyMove(board, 11, 1), /Illegal move/);
  }
  for (const [index, actor] of [[-1, 1], [25, 1], [11.5, 1], [11, 0], [11, 3], [11, 1.5], [13, 1], [0, 1]]) {
    const board = opening(), original = structuredClone(board);
    assert.equal(isLegal(board, index, actor), false);
    assert.throws(() => applyMove(board, index, actor), /Illegal move/);
    assert.deepEqual(board, original);
  }
  assert.equal(winner(empty()), 0);
});
