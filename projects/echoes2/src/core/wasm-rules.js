import { validBoard } from "./rules.js";
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Cell} Cell */
/** @typedef {{clear:()=>void, putCell:(index:number,owner:number,charge:number)=>void, canMove:(index:number,actor:number)=>number, play:(index:number,actor:number)=>number, getOwner:(frame:number,index:number)=>number, getCharge:(frame:number,index:number)=>number, didBurst:(frame:number,index:number)=>number}} RulesExports */

export class WasmRules {
  /** @param {WebAssembly.Exports} exports */
  constructor(exports) { this.exports = /** @type {RulesExports} */ (/** @type {unknown} */ (exports)); }

  /** @param {unknown} board */
  load(board) {
    this.exports.clear();
    if (!validBoard(board)) return false;
    board.cells.forEach((cell, index) => this.exports.putCell(index, cell.owner, cell.charge));
    return true;
  }

  /** @param {unknown} board @param {number} index @param {number} actor */
  isLegal(board, index, actor) {
    if (!Number.isInteger(index) || index < 0 || index >= 25 || (actor !== 1 && actor !== 2) || !this.load(board)) return false;
    return this.exports.canMove(index, actor) === 1;
  }

  /** @param {unknown} board @param {number} actor */
  legalMoves(board, actor) {
    if ((actor !== 1 && actor !== 2) || !this.load(board)) return [];
    return Array.from({ length: 25 }, (_, index) => index).filter(index => this.exports.canMove(index, actor) === 1);
  }

  /** @param {unknown} board @param {number} index @param {number} actor @returns {import('./types.js').Resolution} */
  applyMove(board, index, actor) {
    if (!this.isLegal(board, index, actor)) throw new Error("Illegal move");
    const count = this.exports.play(index, actor);
    if (count < 1) throw new Error("Illegal move");
    const frames = /** @type {Board[]} */ ([]), bursts = /** @type {number[][]} */ ([]);
    for (let frame = 0; frame < count; frame++) {
      frames.push({ size: 5, cells: Array.from({ length: 25 }, (_, at) => ({ owner: /** @type {Cell['owner']} */ (this.exports.getOwner(frame, at)), charge: this.exports.getCharge(frame, at) })) });
      bursts.push(Array.from({ length: 25 }, (_, at) => at).filter(at => this.exports.didBurst(frame, at) === 1));
    }
    const final = frames[frames.length - 1];
    return { board: { size: 5, cells: final.cells.map(cell => ({ ...cell })) }, frames, bursts };
  }
}
