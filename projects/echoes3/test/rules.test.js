import assert from "node:assert/strict";
import test from "node:test";
import { opening, parsePosition, encodeTree, canonicalPosition, validPosition, pieceCount, legalMoves, isLegal, applyMove } from "../src/core/rules.js";

test("unordered trees have one canonical identity independent of sibling order", () => {
  assert.equal(canonicalPosition("(()(()))"), "((())())");
  assert.equal(encodeTree([[], [[]]]), "((())())");
  assert.deepEqual(parsePosition("((())())"), [[[]], []]);
  assert.equal(validPosition("(()(()))"), false);
  assert.equal(validPosition("((())())"), true);
  assert.equal(opening(), "(((())())())");
  assert.equal(pieceCount(opening()), 5);
});

test("cutting a root leaf removes one piece and the root alone is terminal", () => {
  assert.deepEqual(applyMove("(()())", [1]), { position: "(())", regrown: false, beforePieces: 2, afterPieces: 1 });
  assert.deepEqual(applyMove("(())", [0]), { position: "()", regrown: false, beforePieces: 1, afterPieces: 0 });
  assert.deepEqual(legalMoves("()"), []);
  assert.equal(pieceCount("()"), 0);
  assert.equal(isLegal("()", []), false);
});

test("regrowth copies the pruned parent, never the branch before the cut", () => {
  assert.deepEqual(applyMove("((()))", [0, 0]), { position: "(()())", regrown: true, beforePieces: 2, afterPieces: 2 });
  assert.deepEqual(applyMove("((()()()))", [0, 1]), { position: "((()())(()()))", regrown: true, beforePieces: 4, afterPieces: 6 });
  assert.deepEqual(applyMove("(((())))", [0, 0, 0]), { position: "((()()))", regrown: true, beforePieces: 3, afterPieces: 3 });
});

test("moves identify only nonroot leaves; equivalent branches give equivalent results", () => {
  const position = "((())(()))";
  assert.deepEqual(legalMoves(position), [[0, 0], [1, 0]]);
  assert.equal(applyMove(position, [0, 0]).position, applyMove(position, [1, 0]).position);
  assert.equal(position, "((())(()))");
  const move = Object.freeze([0, 0]);
  applyMove(position, move);
  assert.deepEqual(move, [0, 0]);
  for (const invalid of [[], [0], [2, 0], [0, -1], [0, 0.5], [0, NaN], [0, Infinity], ["0", 0], null, {}, 0]) {
    assert.equal(isLegal(position, invalid), false);
    assert.throws(() => applyMove(position, invalid), /Illegal move/);
  }
});

test("malformed and noncanonical positions cannot enter game transitions", () => {
  for (const invalid of [null, 4, {}, "", "(", ")", "()()", "(())x", "( () )", "(()", "())", "(()(()))"]) {
    assert.equal(validPosition(invalid), false);
    assert.deepEqual(legalMoves(invalid), []);
    assert.equal(isLegal(invalid, [0]), false);
    assert.throws(() => applyMove(invalid, [0]), /Illegal move/);
  }
  for (const invalid of [null, "", "()()", "(x)", "(()"]) assert.throws(() => parsePosition(invalid), /position/i);
  assert.throws(() => encodeTree([null]), /tree/i);
  const cyclic = []; cyclic.push(cyclic);
  assert.throws(() => encodeTree(cyclic), /tree/i);
});

test("tree representation has no fixed board size or recursion depth limit", () => {
  const wide = `(${"()".repeat(10000)})`;
  assert.equal(validPosition(wide), true);
  assert.equal(pieceCount(wide), 10000);
  assert.equal(applyMove(wide, [9999]).afterPieces, 9999);
  const deep = "(".repeat(15000) + ")".repeat(15000);
  assert.equal(encodeTree(parsePosition(deep)), deep);
  assert.equal(validPosition(deep), true);
});
