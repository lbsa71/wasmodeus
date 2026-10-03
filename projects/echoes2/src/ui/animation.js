import { drawBoard } from "./board.js";
import { changedCells } from "./view-model.js";
/** @typedef {import('../core/types.js').Presentation} Presentation */
/** @param {number} duration */
const pause = duration => new Promise(resolve => setTimeout(resolve, duration));

/** Keep the nominal playback under three seconds, including the ghost's lead-in
 * and final pause, while visiting every cascade frame.
 * @param {number} count @param {boolean} hasBurst */
export function frameDelay(count, hasBurst) {
  return Math.min(hasBurst ? 380 : 240, 2560 / Math.max(1, count));
}

/** @param {HTMLElement} host @param {Presentation} presentation @param {boolean} reducedMotion */
export async function animateTurn(host, presentation, reducedMotion) {
  const { frames, bursts, turn, actor } = presentation;
  const settings = { onCell: () => {}, enabled: false, lastMove: turn.move, actor };
  if (reducedMotion) {
    drawBoard(host, turn.after, settings);
    await pause(180);
    return;
  }
  await pause(actor === 2 ? 340 : 100);
  let before = turn.before;
  for (const [index, frame] of frames.entries()) {
    drawBoard(host, frame, { ...settings, changed: changedCells(before, frame), bursts: bursts[index] });
    await pause(frameDelay(frames.length, Boolean(bursts[index]?.length)));
    before = frame;
  }
  await pause(100);
}
