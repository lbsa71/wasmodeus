import { encodeTree, parsePosition, validPosition } from "./rules.js";
/** @typedef {import('./types.js').Tree} Tree */
/** @typedef {import('./types.js').Move} Move */
/** @typedef {{clear:()=>void, appendNode:(parent:number)=>number, canMove:(index:number)=>number, play:(index:number)=>number, getParent:(index:number)=>number, didRegrow:()=>number}} RulesExports */

export class WasmRules {
  /** @param {WebAssembly.Exports} exports */
  constructor(exports) {
    this.exports = /** @type {RulesExports} */ (/** @type {unknown} */ (exports));
    this.paths = /** @type {Move[]} */ ([]);
    this.indices = /** @type {Map<string,number>} */ (new Map());
  }

  /** @param {unknown} position */
  load(position) {
    this.exports.clear();
    this.paths = [];
    this.indices.clear();
    if (!validPosition(position)) return false;
    const stack = [{ tree: parsePosition(position), parent: -1, path: /** @type {Move} */ ([]) }];
    while (stack.length) {
      const { tree, parent, path } = /** @type {{tree:Tree,parent:number,path:Move}} */ (stack.pop());
      const index = this.paths.length;
      if (this.exports.appendNode(parent) !== 1) return false;
      this.paths.push(path);
      this.indices.set(JSON.stringify(path), index);
      for (let child = tree.length - 1; child >= 0; child--) stack.push({ tree: tree[child], parent: index, path: [...path, child] });
    }
    return true;
  }

  /** @param {unknown} position @param {unknown} move */
  isLegal(position, move) {
    if (!Array.isArray(move) || !move.length || !move.every(index => Number.isInteger(index) && index >= 0) || !this.load(position)) return false;
    const index = this.indices.get(JSON.stringify(move));
    return index !== undefined && this.exports.canMove(index) === 1;
  }

  /** @param {unknown} position @returns {Move[]} */
  legalMoves(position) {
    if (!this.load(position)) return [];
    return this.paths.filter((_path, index) => this.exports.canMove(index) === 1).map(path => [...path]);
  }

  /** @param {string} position @param {Move} move @returns {import('./types.js').Resolution} */
  applyMove(position, move) {
    if (!this.isLegal(position, move)) throw new Error("Illegal move");
    const index = /** @type {number} */ (this.indices.get(JSON.stringify(move)));
    const count = this.exports.play(index);
    if (count < 1) throw new Error("Illegal move");
    const nodes = Array.from({ length: count }, () => /** @type {Tree} */ ([]));
    for (let at = 0; at < count; at++) {
      const parent = this.exports.getParent(at);
      if (at === 0) { if (parent !== -1) throw new Error("Invalid WASM tree"); }
      else {
        if (parent < 0 || parent >= at) throw new Error("Invalid WASM tree");
        nodes[parent].push(nodes[at]);
      }
    }
    return { position: encodeTree(nodes[0]), regrown: this.exports.didRegrow() === 1, beforePieces: position.length / 2 - 1, afterPieces: count - 1 };
  }
}
