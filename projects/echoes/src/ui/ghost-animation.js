import { viewport } from "./board.js";
import { boardPoint, ghostGeometry } from "./ghost-geometry.js";
import { samePoint } from "../core/rules.js";
import { transformLabel } from "../core/symmetry.js";
/** @typedef {import('../core/types.js').GhostPresentation} GhostPresentation */
/** @typedef {import('../core/types.js').Point} Point */
const ns = "http://www.w3.org/2000/svg";
/** @param {Point} p @param {number} radius @param {string} className */
function circle(p, radius, className) {
  const node = document.createElementNS(ns, "circle");
  node.setAttribute("cx", String(p.x)); node.setAttribute("cy", String(p.y));
  node.setAttribute("r", String(radius)); node.setAttribute("class", className);
  return node;
}
/** @param {Element} node @param {Keyframe[]} frames @param {number} duration */
async function motion(node, frames, duration) {
  const animation = node.animate(frames, { duration, easing: "ease-in-out", fill: "forwards" });
  try { await animation.finished; } catch { /* Navigation or reduced-motion changes may cancel a visual. */ }
}
/** Show only a saved human-derived action. Motion never changes game state.
 * @param {HTMLElement} board @param {HTMLElement} cue @param {GhostPresentation} presentation @param {boolean} reduced */
export async function animateGhost(board, cue, presentation, reduced) {
  const { turn, original, kind } = presentation;
  if (!turn.source) return;
  const view = viewport(turn.before, turn.move);
  const geometry = ghostGeometry(original.before, turn.before, turn.source.transform, view);
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("ghost-overlay");
  const group = document.createElementNS(ns, "g"); group.style.transformOrigin = "0 0";
  for (let i = 0; i < original.before.stones.length; i++) for (let j = i + 1; j < original.before.stones.length; j++) {
    const a = original.before.stones[i], b = original.before.stones[j];
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(geometry.stones[i].x)); line.setAttribute("y1", String(geometry.stones[i].y));
    line.setAttribute("x2", String(geometry.stones[j].x)); line.setAttribute("y2", String(geometry.stones[j].y));
    group.append(line);
  }
  geometry.stones.forEach((p, i) => group.append(circle(p, 20 / view.columns, samePoint(original.before.stones[i], original.before.resting) ? "memory-stone memory-resting" : "memory-stone")));
  svg.append(group); board.append(svg); board.classList.add("ghost-aligning");
  const fromDisc = board.querySelector(`button[data-x="${turn.move.from.x}"][data-y="${turn.move.from.y}"] .disc`);
  try {
    cue.textContent = `${presentation.intent ?? (kind === "learning" ? "Learning echo" : "Ghost reply")}: ${transformLabel(turn.source.transform)} to match this board.`;
    if (reduced) group.style.transform = `matrix(${geometry.matrix.join(",")})`;
    await motion(group, reduced ? [{ opacity: 0.4 }, { opacity: 1 }] : [
      { transform: "matrix(1,0,0,1,0,0)", opacity: 0.4, offset: 0 },
      { transform: "matrix(1,0,0,1,0,0)", opacity: 1, offset: 0.18 },
      { transform: `matrix(${geometry.matrix.join(",")})`, opacity: 1, offset: 0.82 },
      { transform: `matrix(${geometry.matrix.join(",")})`, opacity: 0.8, offset: 1 },
    ], reduced ? 140 : turn.source.transform.orientation ? 700 : 280);
    group.remove(); board.classList.remove("ghost-aligning");
    cue.textContent = kind === "learning" ? "Your previous discovery becomes an opening. Your turn next." : "The ghost makes its reply. Your turn next.";
    fromDisc?.classList.add("ghost-departing");
    const from = boardPoint(view, turn.move.from), to = boardPoint(view, turn.move.to);
    const owner = presentation.owners?.[turn.before.stones.findIndex(p => samePoint(p, turn.move.from))];
    const token = circle(reduced ? to : from, 20 / view.columns, `moving-ghost ${owner === "ghost" ? "moving-amber" : ""}`); svg.append(token);
    await motion(token, reduced ? [{ opacity: 0.4 }, { opacity: 1 }] : [{ transform: "translate(0px, 0px)" }, { transform: `translate(${to.x - from.x}px, ${to.y - from.y}px)` }], reduced ? 140 : 520);
  } finally {
    svg.remove(); fromDisc?.classList.remove("ghost-departing"); board.classList.remove("ghost-aligning");
  }
}
