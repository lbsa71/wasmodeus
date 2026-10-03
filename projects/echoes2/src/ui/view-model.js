/** @typedef {import('../core/types.js').Board} Board */
/** @typedef {import('../core/types.js').Cell} Cell */
/** @param {Cell} cell @param {number} index @param {number} size @param {boolean} playable */
export function cellLabel(cell, index, size, playable) {
  const coordinate = `${String.fromCharCode(65 + index % size)}${Math.floor(index / size) + 1}`;
  const name = cell.owner === 0 ? "empty" : `${cell.owner === 1 ? "your blue" : "ghost coral"} cell, ${cell.charge} ${cell.charge === 1 ? "charge" : "charges"}${cell.charge === 3 ? ", one charge from bursting" : ""}`;
  return `${coordinate}, ${name}${playable ? cell.owner === 0 ? ". Claim this cell" : ". Charge this cell" : ""}`;
}
/** @param {Pick<import('../core/types.js').Game, 'status' | 'turns' | 'archiveIds'>} game @param {boolean} reviewing */
export function phaseText(game, reviewing) {
  if (reviewing) return "Reviewing a saved position. Return to your match to play.";
  if (game.status === "human") return "You win. A new match starts shortly.";
  if (game.status === "ghost") return "The ghost wins. A new match starts shortly.";
  if (game.status === "draw") return "A draw. A new match starts shortly.";
  const last = game.turns.at(-1);
  if (last?.actor === 2 && last.move === null) return last.discovery ? "+1 breakthrough. The ghost passes; you play again." : "No remembered reply fits. The ghost passes; you play again.";
  if (game.archiveIds.length === 0) return "No memories yet: your first match teaches the ghost.";
  return "Charge blue or claim a neighbouring cell. Four charges burst outward.";
}
/** @param {Board} before @param {Board} after */
export function changedCells(before, after) {
  return after.cells.flatMap((cell, index) => cell.owner !== before.cells[index].owner || cell.charge !== before.cells[index].charge ? [index] : []);
}

/** @param {{startSource?:{gameId:string,turnIndex:number}}} game @param {{games:{id:string}[]}} db */
export function openingOrigin(game, db) {
  if (!game.startSource) return "";
  const source = game.startSource;
  return `You’re playing the ghost’s unanswered position from match ${db.games.findIndex(old => old.id === source.gameId) + 1}; colours reversed.`;
}
