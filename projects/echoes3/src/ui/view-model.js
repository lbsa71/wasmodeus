import { encodeTree, parsePosition } from "../core/rules.js";
/** @typedef {import('../core/types.js').Tree} Tree */
/** @typedef {import('../core/types.js').Move} Move */
/** @typedef {{path:Move,x:number,y:number,leaf:boolean,parent:number}} LayoutNode */

/** Lay out a whole tree with fixed, accessible spacing between its playable tips.
 * @param {string} position */
export function layoutTree(position) {
  const root = parsePosition(position);
  const nodes = /** @type {LayoutNode[]} */ ([]);
  const stack = [{ tree: root, path: /** @type {Move} */ ([]), parent: -1 }];
  let deepest = 0, tips = 0;
  while (stack.length) {
    const { tree, path, parent } = /** @type {{tree:Tree,path:Move,parent:number}} */ (stack.pop());
    const index = nodes.length;
    nodes.push({ path, parent, leaf: !tree.length, x: !tree.length ? tips++ * 64 : 0, y: path.length });
    deepest = Math.max(deepest, path.length);
    for (let child = tree.length - 1; child >= 0; child--) stack.push({ tree: tree[child], path: [...path, child], parent: index });
  }
  const children = nodes.map(() => /** @type {number[]} */ ([]));
  nodes.forEach((node, index) => { if (node.parent >= 0) children[node.parent].push(index); });
  for (let index = nodes.length - 1; index >= 0; index--) {
    if (children[index].length) nodes[index].x = (nodes[children[index][0]].x + nodes[children[index].at(-1) ?? 0].x) / 2;
  }
  const width = Math.max(360, (tips - 1) * 64 + 80), height = Math.max(256, deepest * 68 + 80);
  const offset = (width - (tips - 1) * 64) / 2;
  nodes.forEach(node => { node.x += offset; node.y = height - 40 - node.y * 68; });
  return { nodes, edges: nodes.flatMap((node, index) => node.parent < 0 ? [] : [{ from: node.parent, to: index }]), width, height };
}

/** @param {Move} path */
export function tipLabel(path) {
  return `Cut tip ${path.map(index => index + 1).join(".")}. ${path.length === 1 ? "This branch disappears." : "Its remaining parent branch is copied."}`;
}

/** Track the freshly copied branch through canonical sibling ordering for animation.
 * @param {string} before @param {Move} move @returns {Move | null} */
export function regrowthPath(before, move) {
  if (move.length < 2) return null;
  const root = parsePosition(before);
  let parent = root, grandparent = root;
  for (const index of move.slice(0, -1)) { grandparent = parent; parent = parent[index]; }
  parent.splice(move.at(-1) ?? 0, 1);
  const copy = parsePosition(encodeTree(parent));
  grandparent.push(copy);
  const pending = [root];
  while (pending.length) {
    const node = /** @type {Tree} */ (pending.pop());
    node.sort((a, b) => { const left = encodeTree(a), right = encodeTree(b); return left < right ? -1 : left > right ? 1 : 0; });
    pending.push(...node);
  }
  const search = [{ node: root, path: /** @type {Move} */ ([]) }];
  while (search.length) {
    const entry = /** @type {{node:Tree,path:Move}} */ (search.pop());
    if (entry.node === copy) return entry.path;
    entry.node.forEach((node, index) => search.push({ node, path: [...entry.path, index] }));
  }
  return null;
}

/** @param {Pick<import('../core/types.js').Game, 'status'|'archiveIds'|'turns'>} game @param {boolean} reviewing */
export function phaseText(game, reviewing) {
  if (reviewing) return "Reviewing a saved tree. Return to your match to play.";
  if (game.status === "human") return "You took the last branch. A new match starts shortly.";
  if (game.status === "ghost") return "The ghost took the last branch. A new match starts shortly.";
  const last = game.turns.at(-1);
  if (last?.actor === 2 && last.move === null) return last.discovery ? "+1 breakthrough. The ghost passes; cut again." : "No remembered reply fits this whole tree. The ghost passes; cut again.";
  if (!game.archiveIds.length) return "Your first match teaches the ghost. Cut a gold tip to begin.";
  return "Cut a gold tip. Take the last branch to win.";
}
