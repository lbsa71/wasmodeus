/** @typedef {import('./types.js').Board} Board */
/** @typedef {import('./types.js').Actor} Actor */

/** Stable save-state validation; animation frames are intentionally not stable. @param {unknown} value @returns {value is Board} */
export function validBoard(value) {
  if (!value || typeof value !== "object") return false;
  const board = /** @type {{size?: unknown, cells?: unknown}} */ (value);
  if (board.size !== 5 || !Array.isArray(board.cells) || board.cells.length !== 25) return false;
  for (const cell of board.cells) {
    if (!cell || typeof cell !== "object" || ![0, 1, 2].includes(cell.owner) || !Number.isInteger(cell.charge) || cell.charge < 0 || cell.charge > 3) return false;
    if ((cell.owner === 0) !== (cell.charge === 0)) return false;
  }
  return true;
}

/** @returns {Board} */
export function opening() {
  const board = /** @type {Board} */ ({ size: 5, cells: Array.from({ length: 25 }, () => ({ owner: 0, charge: 0 })) });
  board.cells[11] = { owner: 1, charge: 2 };
  board.cells[13] = { owner: 2, charge: 2 };
  return board;
}

/** @param {number} index @returns {number[]} */
function neighbours(index) {
  const found = [], x = index % 5, y = Math.floor(index / 5);
  if (y > 0) found.push(index - 5);
  if (x > 0) found.push(index - 1);
  if (x < 4) found.push(index + 1);
  if (y < 4) found.push(index + 5);
  return found;
}

/** @param {unknown} board @param {number} index @param {number} actor */
export function isLegal(board, index, actor) {
  if (!validBoard(board) || !Number.isInteger(index) || index < 0 || index >= 25 || (actor !== 1 && actor !== 2)) return false;
  const cell = board.cells[index];
  return cell.owner === actor || (cell.owner === 0 && neighbours(index).some(next => board.cells[next].owner === actor));
}

/** @param {unknown} board @param {number} actor */
export function legalMoves(board, actor) {
  return Array.from({ length: 25 }, (_, index) => index).filter(index => isLegal(board, index, actor));
}

/** @param {Board} board @returns {Board} */
function copy(board) { return { size: 5, cells: board.cells.map(cell => ({ ...cell })) }; }

/** @param {unknown} input @param {number} index @param {number} actor @returns {{board:Board, frames:Board[], bursts:number[][]}} */
export function applyMove(input, index, actor) {
  if (!isLegal(input, index, actor) || !validBoard(input)) throw new Error("Illegal move");
  const board = copy(input), side = /** @type {Actor} */ (actor);
  board.cells[index].charge++;
  board.cells[index].owner = side;
  const frames = [copy(board)], bursts = /** @type {number[][]} */ ([[]]);
  for (;;) {
    const wave = board.cells.flatMap((cell, at) => cell.charge >= 4 ? [at] : []);
    if (!wave.length) break;
    // Subtract the whole wave before distributing. An unstable neighbour may
    // receive another charge in this wave and remains eligible for the next.
    for (const at of wave) board.cells[at].charge -= 4;
    for (const at of wave) {
      for (const next of neighbours(at)) {
        board.cells[next].charge++;
        board.cells[next].owner = side;
      }
    }
    for (const cell of board.cells) if (cell.charge === 0) cell.owner = 0;
    frames.push(copy(board));
    bursts.push(wave);
  }
  return { board, frames, bursts };
}

/** @param {Board} board @param {number} actor */
export function territory(board, actor) { return board.cells.filter(cell => cell.owner === actor).length; }

/** @param {Board} board @returns {0|1|2} */
export function winner(board) {
  const blue = territory(board, 1), amber = territory(board, 2);
  return blue > 0 && amber === 0 ? 1 : amber > 0 && blue === 0 ? 2 : 0;
}
