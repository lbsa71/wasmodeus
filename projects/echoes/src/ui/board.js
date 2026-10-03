import { legalMoves, pointKey, samePoint } from "../core/rules.js";
/** @typedef {import('../core/types.js').Board} Board */
/** @typedef {import('../core/types.js').Point} Point */
/** @typedef {import('../core/types.js').Move} Move */
/** @typedef {{minX: number, minY: number, columns: number, rows: number}} Viewport */

/** @param {Board} board @param {Move | null} [move] @returns {Viewport} */
export function viewport(board, move = null) {
  const points = [...board.stones, ...legalMoves(board).map(m => m.to), ...(move ? [move.from, move.to] : [])];
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const size = Math.max(7, maxX - minX + 3, maxY - minY + 3);
  return { minX: minX - Math.floor((size - (maxX - minX + 1)) / 2), minY: minY - Math.floor((size - (maxY - minY + 1)) / 2), columns: size, rows: size };
}
/** @param {Viewport} view @param {number} column @param {number} row @returns {Point} */
export function cellPoint(view, column, row) { return { x: view.minX + column, y: view.minY + view.rows - 1 - row }; }

/** @param {HTMLElement} element @param {Board} board @param {{selected: Point | null, move: Move | null, ghost: boolean, enabled: boolean, owners?: import('../core/types.js').Side[], winning?: Point[], onCell: (p: Point) => void}} options */
export function drawBoard(element, board, options) {
  const view = viewport(board, options.move);
  const moves = legalMoves(board).filter(m => options.selected && samePoint(m.from, options.selected));
  const targets = new Set(moves.map(m => pointKey(m.to)));
  const stones = new Set(board.stones.map(pointKey));
  element.replaceChildren();
  element.style.setProperty("--columns", String(view.columns));
  element.style.setProperty("--rows", String(view.rows));
  /** @param {Point} p */
  const position = p => ({ x: (p.x - view.minX + 0.5) * 100 / view.columns, y: (view.minY + view.rows - p.y - 0.5) * 100 / view.rows });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100"); svg.classList.add("links"); svg.setAttribute("aria-hidden", "true");
  for (let i = 0; i < board.stones.length; i++) for (let j = i + 1; j < board.stones.length; j++) {
    const a = board.stones[i], b = board.stones[j];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
    const p = position(a), q = position(b);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(p.x)); line.setAttribute("y1", String(p.y)); line.setAttribute("x2", String(q.x)); line.setAttribute("y2", String(q.y));
    svg.append(line);
  }
  if (options.move) {
    const p = position(options.move.from), q = position(options.move.to);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(p.x)); line.setAttribute("y1", String(p.y)); line.setAttribute("x2", String(q.x)); line.setAttribute("y2", String(q.y));
    line.classList.add("move-line", options.ghost ? "ghost-line" : "human-line");
    svg.append(line);
    const circle = document.createElementNS(ns, "circle"); circle.setAttribute("cx", String(p.x)); circle.setAttribute("cy", String(p.y)); circle.setAttribute("r", "1.5"); circle.classList.add("departed"); svg.append(circle);
  }
  element.append(svg);
  for (let row = 0; row < view.rows; row++) for (let column = 0; column < view.columns; column++) {
    const p = cellPoint(view, column, row), key = pointKey(p);
    const occupied = stones.has(key), resting = samePoint(p, board.resting), selected = options.selected && samePoint(p, options.selected);
    const button = document.createElement("button"); button.type = "button"; button.className = "cell";
    const owner = options.owners?.[board.stones.findIndex(stone => samePoint(stone, p))];
    button.classList.toggle("human-stone", owner === "human"); button.classList.toggle("ghost-stone", owner === "ghost");
    button.classList.toggle("winning-stone", Boolean(options.winning?.some(q => samePoint(q, p))));
    button.dataset.x = String(p.x); button.dataset.y = String(p.y);
    button.classList.toggle("stone", occupied); button.classList.toggle("resting", resting); button.classList.toggle("selected", Boolean(selected)); button.classList.toggle("target", targets.has(key));
    button.disabled = !options.enabled;
    button.setAttribute("aria-label", `${occupied ? resting ? "Resting stone" : "Stone" : targets.has(key) ? "Legal destination" : "Empty cell"} at ${p.x}, ${p.y}`);
    if (owner) button.setAttribute("aria-label", `${resting ? "Resting " : ""}${owner === "human" ? "Your blue stone" : "Ghost amber stone"} at ${p.x}, ${p.y}`);
    button.setAttribute("aria-pressed", String(Boolean(selected)));
    if (occupied) { const disc = document.createElement("span"); disc.className = "disc"; button.append(disc); }
    else { const dot = document.createElement("span"); dot.className = "grid-dot"; button.append(dot); }
    button.addEventListener("click", () => options.onCell(p));
    // Arrow keys move across the visible board; Enter/Space selects or moves.
    button.addEventListener("keydown", event => {
      const offsets = /** @type {Record<string, [number, number]>} */ ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] });
      const offset = offsets[event.key];
      if (!offset) return;
      event.preventDefault();
      const target = element.querySelector(`button[data-x="${p.x + offset[0]}"][data-y="${p.y + offset[1]}"]`);
      if (target instanceof HTMLElement) target.focus();
    });
    element.append(button);
  }
}
