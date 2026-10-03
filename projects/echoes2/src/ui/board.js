import { cellLabel } from "./view-model.js";
/** @typedef {import('../core/types.js').Board} Board */
/** @typedef {{legal?:number[],enabled?:boolean,lastMove?:number|null,changed?:number[],bursts?:number[],actor?:number,onCell:(index:number)=>void}} BoardOptions */

/** Keep the same buttons across frames so keyboard focus survives a save or cascade.
 * @param {HTMLElement} host @param {Board} board @param {BoardOptions} options */
export function drawBoard(host, board, options) {
  if (host.children.length !== board.cells.length) {
    host.replaceChildren(...board.cells.map((_, index) => {
      const button = document.createElement("button");
      button.type = "button"; button.dataset.index = String(index);
      button.addEventListener("click", () => options.onCell(index));
      return button;
    }));
  }
  host.dataset.actor = String(options.actor ?? 1);
  board.cells.forEach((cell, index) => {
    const button = /** @type {HTMLButtonElement} */ (host.children[index]);
    const legal = options.legal?.includes(index) ?? false;
    const playable = Boolean(options.enabled && legal);
    button.className = `cell owner-${cell.owner} charge-${cell.charge}`;
    button.classList.toggle("playable", playable);
    button.classList.toggle("ready", cell.charge === 3);
    button.classList.toggle("last-move", index === options.lastMove);
    button.classList.toggle("changed", options.changed?.includes(index) ?? false);
    button.classList.toggle("burst", options.bursts?.includes(index) ?? false);
    button.setAttribute("aria-label", cellLabel(cell, index, board.size, playable));
    button.disabled = !playable;
    const coordinate = document.createElement("span");
    coordinate.className = "cell-coordinate"; coordinate.setAttribute("aria-hidden", "true");
    coordinate.textContent = `${String.fromCharCode(65 + index % board.size)}${Math.floor(index / board.size) + 1}`;
    button.replaceChildren(coordinate);
    if (cell.owner !== 0) {
      const charge = document.createElement("span"), pips = document.createElement("span");
      charge.className = "charge"; charge.setAttribute("aria-hidden", "true"); pips.className = "pips";
      for (let pip = 0; pip < cell.charge; pip++) { const dot = document.createElement("i"); dot.className = "pip"; pips.append(dot); }
      charge.append(pips); button.append(charge);
    }
  });
}
