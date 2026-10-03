import { samePoint } from "./rules.js";
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Move} Move */
export class WasmRules {
  /** @param {WebAssembly.Exports} exports */
  constructor(exports) { this.exports = /** @type {import('./types.js').RulesExports} */ (/** @type {unknown} */ (exports)); }
  /** @param {Board} board @param {Move} move */
  isLegal(board, move) {
    this.exports.clear();
    board.stones.forEach((p, index) => this.exports.putStone(index, p.x, p.y));
    this.exports.setResting(board.stones.findIndex(p => samePoint(p, board.resting)));
    return this.exports.canMove(board.stones.findIndex(p => samePoint(p, move.from)), move.to.x, move.to.y) === 1;
  }
}
