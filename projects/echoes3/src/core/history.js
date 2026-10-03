import { applyMove, isLegal } from "./rules.js";

/** @typedef {import('./types.js').Database} Database */
/** @typedef {import('./types.js').Game} Game */
/** @typedef {import('./types.js').Move} Move */
/** @typedef {import('./types.js').Reply} Reply */

/** @param {Move} a @param {Move} b */
function comparePaths(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

/** Whole canonical positions must agree. Symmetric recorded cuts share one outcome.
 * @param {Database} db @param {string} position @param {Game|null} [game] @returns {Reply[]}
 */
export function archiveReplies(db, position, game = db.games.find(candidate => candidate.id === db.activeGameId) ?? null) {
  if (!game) return [];
  const allowed = new Set(game.archiveIds);
  /** @type {Map<string, Reply>} */
  const found = new Map();
  for (const oldGame of db.games) {
    if (!allowed.has(oldGame.id)) continue;
    const counted = new Set();
    oldGame.turns.forEach((turn, turnIndex) => {
      if (turn.actor !== 1 || turn.move === null || turn.source !== null || turn.before !== position || !isLegal(position, turn.move)) return;
      const after = applyMove(position, turn.move).position;
      let reply = found.get(after);
      if (!reply) {
        reply = { move: [...turn.move], after, source: { gameId: oldGame.id, turnIndex }, wins: 0, losses: 0 };
        found.set(after, reply);
      }
      if (counted.has(after)) return;
      counted.add(after);
      if (oldGame.status === "human") reply.wins += 1;
      else if (oldGame.status === "ghost") reply.losses += 1;
    });
  }
  return [...found.values()].sort((a, b) => {
    const terminal = Number(b.after === "()") - Number(a.after === "()");
    const aRate = (a.wins + 1) / (a.wins + a.losses + 2);
    const bRate = (b.wins + 1) / (b.wins + b.losses + 2);
    return terminal || bRate - aRate || comparePaths(a.move, b.move) || (a.after < b.after ? -1 : a.after > b.after ? 1 : 0);
  });
}

/** @param {Database} db @param {Game} game @param {string} position */
export function isDiscovery(db, game, position) {
  const allowed = new Set([...game.archiveIds, game.id]);
  return !db.games.some(oldGame => allowed.has(oldGame.id) && oldGame.turns.some(turn =>
    turn.actor === 2 && turn.move === null && turn.discovery && turn.after === position));
}
