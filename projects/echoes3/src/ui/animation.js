import { drawTree } from "./tree.js";
import { regrowthPath } from "./view-model.js";
/** @param {number} duration */
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
/** @param {HTMLElement} host @param {import('../core/types.js').Presentation} presentation @param {boolean} reducedMotion */
export async function animateTurn(host, presentation, reducedMotion) {
  const { actor, turn, resolution } = presentation;
  const settings = { enabled: false, onTip: () => {}, actor };
  if (reducedMotion) { drawTree(host, turn.after, settings); await pause(100); return; }
  drawTree(host, turn.before, { ...settings, cut: turn.move });
  await pause(actor === 2 ? 420 : 260);
  const growth = resolution.regrown && turn.move ? regrowthPath(turn.before, turn.move) : null;
  drawTree(host, turn.after, { ...settings, growth });
  await pause(growth ? 450 : 220);
}
