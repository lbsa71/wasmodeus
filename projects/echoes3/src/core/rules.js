/** @typedef {import('./types.js').Tree} Tree */
/** @typedef {import('./types.js').Move} Move */

/** @returns {string} */
export function opening() { return "(((())())())"; }

/** Decode a complete rooted tree without depending on the JS call-stack depth.
 * @param {unknown} input @returns {Tree} */
export function parsePosition(input) {
  if (typeof input !== "string" || input.length < 2 || input[0] !== "(") throw new Error("Invalid position");
  const stack = /** @type {Tree[]} */ ([]);
  let root = /** @type {Tree | null} */ (null);
  for (let index = 0; index < input.length; index++) {
    if (input[index] === "(") {
      const node = /** @type {Tree} */ ([]);
      if (stack.length) stack[stack.length - 1].push(node);
      else if (root !== null) throw new Error("Invalid position");
      else root = node;
      stack.push(node);
    } else if (input[index] === ")") {
      if (!stack.length) throw new Error("Invalid position");
      stack.pop();
      if (!stack.length && index !== input.length - 1) throw new Error("Invalid position");
    } else throw new Error("Invalid position");
  }
  if (stack.length || root === null) throw new Error("Invalid position");
  return root;
}

/** Canonical sibling ordering makes tree identity independent of layout.
 * @param {Tree} tree @returns {string} */
export function encodeTree(tree) {
  const encoded = new WeakMap();
  const active = new WeakSet();
  const stack = [{ tree, finish: false }];
  while (stack.length) {
    const item = /** @type {{tree:Tree,finish:boolean}} */ (stack.pop());
    if (!Array.isArray(item.tree)) throw new Error("Invalid tree");
    if (encoded.has(item.tree)) continue;
    if (item.finish) {
      encoded.set(item.tree, `(${item.tree.map(child => encoded.get(child)).sort().join("")})`);
      active.delete(item.tree);
    } else {
      if (active.has(item.tree)) throw new Error("Invalid cyclic tree");
      active.add(item.tree);
      stack.push({ tree: item.tree, finish: true });
      for (let index = item.tree.length - 1; index >= 0; index--) stack.push({ tree: item.tree[index], finish: false });
    }
  }
  return encoded.get(tree);
}

/** @param {string} position */
export function canonicalPosition(position) { return encodeTree(parsePosition(position)); }

/** @param {unknown} position @returns {position is string} */
export function validPosition(position) {
  if (typeof position !== "string") return false;
  try { return canonicalPosition(position) === position; } catch { return false; }
}

/** @param {string} position */
export function pieceCount(position) { parsePosition(position); return position.length / 2 - 1; }

/** @param {unknown} position @returns {Move[]} */
export function legalMoves(position) {
  if (!validPosition(position)) return [];
  const stack = [{ tree: parsePosition(position), path: /** @type {Move} */ ([]) }];
  const result = /** @type {Move[]} */ ([]);
  while (stack.length) {
    const { tree, path } = /** @type {{tree:Tree,path:Move}} */ (stack.pop());
    if (!tree.length && path.length) result.push(path);
    for (let index = tree.length - 1; index >= 0; index--) stack.push({ tree: tree[index], path: [...path, index] });
  }
  return result;
}

/** @param {unknown} position @param {unknown} move @returns {move is Move} */
export function isLegal(position, move) {
  if (!validPosition(position) || !Array.isArray(move) || !move.length || !move.every(index => Number.isInteger(index) && index >= 0)) return false;
  let tree = parsePosition(position);
  for (const index of move) {
    if (index >= tree.length) return false;
    tree = tree[index];
  }
  return tree.length === 0;
}

/** @param {string} position @param {Move} move @returns {import('./types.js').Resolution} */
export function applyMove(position, move) {
  if (!isLegal(position, move)) throw new Error("Illegal move");
  const root = parsePosition(position);
  let parent = root, grandparent = root;
  for (const index of move.slice(0, -1)) { grandparent = parent; parent = parent[index]; }
  parent.splice(move[move.length - 1], 1);
  const regrown = move.length > 1;
  if (regrown) grandparent.push(parsePosition(encodeTree(parent)));
  const next = encodeTree(root);
  return { position: next, regrown, beforePieces: position.length / 2 - 1, afterPieces: next.length / 2 - 1 };
}
