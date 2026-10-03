import { applyMove, legalMoves, opening, pointKey } from "./rules.js";
import { canonicalKey, transformBoard } from "./symmetry.js";
import { progress, winner } from "./contest.js";
/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Side} Side */
/** @typedef {{board: Board, colours: Side[][], start: import('./types.js').ContestStart, knownChildren: number, legalChildren: number, replyRoutes: number, weight: number}} Candidate */
export const DEFAULT_OWNERS = /** @type {Side[]} */ (["human", "ghost", "human", "ghost", "human", "ghost", "human", "ghost"]);

/** Visual repetition ignores the resting marker; archive identity still includes it.
 * @param {Board} board */
function shapeKey(board) {
  return Array.from({length:8}, (_, orientation) => {
    const stones = transformBoard(board, {orientation,dx:0,dy:0}).stones;
    const x = Math.min(...stones.map(p=>p.x)), y = Math.min(...stones.map(p=>p.y));
    return stones.map(p=>pointKey({x:p.x-x,y:p.y-y})).sort().join(";");
  }).sort()[0];
}
/** Fair here means equal current line length and no immediate win, not measured win odds.
 * @param {Board} board @param {Side[]} owners @param {Board[]} [afters] */
export function safeContestOpening(board, owners, afters = legalMoves(board).map(m=>applyMove(board,m))) {
  return owners.length === 8 && owners.filter(s=>s==="human").length === 4 && owners.filter(s=>s==="ghost").length === 4
    && afters.length > 0 && !winner(board, owners)
    && progress(board, owners, "human") === progress(board, owners, "ghost")
    && afters.every(after=>!winner(after,owners));
}
/** @param {Board} board @param {Side[] | undefined} existing @param {Board[]} afters @returns {Side[][]} */
function coloursFor(board, existing, afters) {
  if (existing) return safeContestOpening(board, existing, afters) ? [[...existing]] : [];
  const colours = [];
  for (let mask=0;mask<256;mask++) {
    if (mask.toString(2).replaceAll("0", "").length !== 4) continue;
    const owners = /** @type {Side[]} */ (board.stones.map((_,i)=>mask & (1<<i) ? "human" : "ghost"));
    if (safeContestOpening(board,owners,afters)) colours.push(owners);
  }
  return colours;
}
/** Distinct recorded human child states, never frequency or ghost-generated knowledge.
 * @param {Database} db */
function knowledge(db) {
  /** @type {Map<string, Set<string>>} */ const children = new Map();
  for (const game of db.games) for (const turn of game.moves) {
    if (turn.actor !== "human") continue;
    const key = canonicalKey(turn.before);
    if (!children.has(key)) children.set(key,new Set());
    children.get(key)?.add(canonicalKey(turn.after));
  }
  return children;
}
/** Coverage, not repeat play counts: smoothing keeps every eligible state possible.
 * @param {number} legalChildren @param {number} knownChildren */
export function openingWeight(legalChildren,knownChildren) { return (legalChildren+1)/(knownChildren+1); }
/** One candidate per archive identity. The just-finished match and its nearby shapes
 * are excluded, so a new match cannot be a disguised one-step rewind.
 * @param {Database} db @returns {Candidate[]} */
export function contestOpenings(db) {
  const previous = db.games.find(g=>g.id===db.activeGameId);
  const excluded = new Set([previous?.initialBoard,previous?.board,previous?.moves.at(-1)?.before].filter(b=>b!==undefined).map(shapeKey));
  const children = knowledge(db), seen = new Set(), candidates = [];
  for (const game of [...db.games].reverse()) {
    if (game.id === previous?.id || !game.moves.some(m=>m.actor==="human")) continue;
    const states = [game.initialBoard ?? opening(), ...game.moves.map(m=>m.after)];
    for (let step=states.length-1;step>=0;step--) {
      const board = states[step], key = canonicalKey(board);
      if (seen.has(key) || excluded.has(shapeKey(board))) continue;
      const afters = legalMoves(board).map(m=>applyMove(board,m));
      const colours = coloursFor(board,game.contest?.owners,afters);
      if (!colours.length) continue;
      seen.add(key);
      const legalKeys = new Set(afters.map(canonicalKey));
      const knownChildren = children.get(key)?.size ?? 0;
      const replyRoutes = [...legalKeys].filter(k=>(children.get(k)?.size ?? 0)>0).length;
      candidates.push({board, colours, start: /** @type {import('./types.js').ContestStart} */ ({kind:"history",gameId:game.id,step}), knownChildren, legalChildren:legalKeys.size, replyRoutes, weight:openingWeight(legalKeys.size,knownChildren)});
    }
  }
  return candidates;
}
/** @param {() => number} random */
function draw(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Random draw must be between zero and one.");
  return value;
}
/** @param {Candidate[]} all @param {() => number} random @param {boolean} [preferReplies] @returns {Candidate | undefined} */
export function pickOpening(all,random,preferReplies=true) {
  const playable = all.filter(c=>c.replyRoutes>0);
  const candidates = preferReplies && playable.length ? playable : all;
  if (!candidates.length) return undefined;
  let ticket = draw(random) * candidates.reduce((sum,c)=>sum+c.weight,0);
  let selected = candidates[candidates.length-1];
  for (const candidate of candidates) {
    ticket -= candidate.weight;
    if (ticket<0) { selected=candidate; break; }
  }
  return selected;
}
/** Prefer sparse playable history, retaining weighted randomness within that pool.
 * @param {Database} db @param {{random?: () => number, preferReplies?: boolean}} [options] */
export function selectContestOpening(db, options = {}) {
  const random = options.random ?? Math.random;
  const selected = pickOpening(contestOpenings(db),random,options.preferReplies);
  if (!selected) return {board:opening(),owners:[...DEFAULT_OWNERS],start: /** @type {import('./types.js').ContestStart} */ ({kind:"default"})};
  return {board:structuredClone(selected.board),owners:[...selected.colours[Math.floor(draw(random)*selected.colours.length)]],start:selected.start};
}
