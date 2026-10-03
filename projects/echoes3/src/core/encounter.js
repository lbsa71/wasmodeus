import { opening, validPosition, parsePosition, encodeTree, pieceCount, legalMoves, applyMove } from "./rules.js";

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Source} Source */

/** A historical start needs both enough material and a meaningful choice.
 * @param {string} position
 */
export function eligibleOpening(position) {
  return validPosition(position) && pieceCount(position) >= 4 && new Set(legalMoves(position).map(move => applyMove(position, move).position)).size >= 2;
}

/** @param {string} position */
export function growOpening(position) {
  if (!validPosition(position)) throw new Error("A growing seed must be canonical.");
  const root = parsePosition(position);
  const branch = root.find(child => child.length > 0);
  if (branch) branch.push([]);
  else root.push([[]]);
  return encodeTree(root);
}

/** Prefer the historic frontier with least recorded child coverage, then least reuse.
 * @param {Database} db @returns {{position:string, source?:Source}}
 */
export function selectOpening(db) {
  /** @type {Map<string, Set<string>>} */
  const knownChildren = new Map();
  /** @type {Map<string, number>} */
  const uses = new Map();
  /** @type {Map<string, {position:string,source:Source,order:number}>} */
  const sources = new Map();
  let order = 0;
  for (const game of db.games) {
    uses.set(game.initialPosition, (uses.get(game.initialPosition) ?? 0) + 1);
    game.turns.forEach((turn, turnIndex) => {
      if (turn.actor === 1 && turn.move !== null && turn.source === null) {
        let outcomes = knownChildren.get(turn.before);
        if (!outcomes) { outcomes = new Set(); knownChildren.set(turn.before, outcomes); }
        outcomes.add(turn.after);
      }
      if (game.status !== "playing" && turn.actor === 2 && turn.move === null) {
        sources.set(turn.after, { position: turn.after, source: { gameId: game.id, turnIndex }, order: order++ });
      }
    });
  }
  let candidates = [...sources.values()].filter(candidate => eligibleOpening(candidate.position));
  const previous = db.games.at(-1)?.initialPosition;
  const different = candidates.filter(candidate => candidate.position !== previous);
  if (different.length) candidates = different;
  candidates.sort((a, b) =>
    (knownChildren.get(a.position)?.size ?? 0) - (knownChildren.get(b.position)?.size ?? 0) ||
    (uses.get(a.position) ?? 0) - (uses.get(b.position) ?? 0) || b.order - a.order);
  const chosen = candidates[0];
  return chosen ? { position: chosen.position, source: { ...chosen.source } } : { position: opening() };
}
