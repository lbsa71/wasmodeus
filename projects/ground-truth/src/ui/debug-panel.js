/**
 * Formats the per-frame counter snapshot for the debug panel. Pure so the
 * numbers can be asserted without a DOM.
 */
import { formatCount } from "../core/capacity.js";
import { formatScale } from "../core/camera.js";

/**
 * @param {import("../core/counters.js").CounterSnapshot} stats
 * @param {{
 *   fps: number, frame: number, restThreshold: number, substeps: number,
 *   camera: import("../core/camera.js").Camera
 * }} context
 * @returns {{ label: string, value: string, warn?: boolean }[]}
 */
export function debugRows(stats, context) {
  return [
    { label: "fps", value: context.fps.toFixed(1), warn: context.fps < 30 },
    { label: "frame", value: `${context.frame}` },
    { label: "moving", value: formatCount(stats.moving) },
    { label: "capacity", value: formatCount(stats.capacity) },
    { label: "pool used", value: `${(stats.utilisation * 100).toFixed(1)} %`, warn: stats.utilisation > 0.995 },
    { label: "free slots", value: formatCount(stats.free) },
    { label: "emitted/f", value: formatCount(stats.emitted) },
    { label: "settled/f", value: formatCount(stats.deposited) },
    { label: "struck/f", value: formatCount(stats.dislodged) },
    { label: "fell/slumped", value: formatCount(stats.undermined) },
    // Cells that wanted to move but found the pool full: the "no more than N"
    // rule biting. A steady non-zero reading means the image is starved.
    { label: "denied/f", value: formatCount(stats.denied), warn: stats.denied > 0 },
    // Two pixels wanting the same cell. Normal in a collapse; the loser is
    // handed to a neighbouring cell rather than launched.
    { label: "crowded/f", value: formatCount(stats.crowded) },
    // Walled in on all eight sides with nowhere to go. Should be near zero.
    { label: "stuck/f", value: formatCount(stats.stuck), warn: stats.stuck > 0 },
    { label: "rest frames", value: `${context.restThreshold}` },
    { label: "substeps", value: `${context.substeps}` },
    { label: "view", value: `${Math.round(context.camera.x)}, ${Math.round(context.camera.y)}` },
    { label: "zoom", value: formatScale(context.camera.scale) },
  ];
}

/**
 * Exponentially smoothed frame rate. A plain per-frame reciprocal is too noisy
 * to read while hunting for the point where the simulation goes sluggish.
 */
export class FrameRateMeter {
  /** @param {number} smoothing 0 is instant, 1 never moves */
  constructor(smoothing = 0.9) {
    this.smoothing = smoothing;
    this.fps = 0;
    /** @type {number|null} */
    this.lastTimestamp = null;
  }

  /** @param {number} timestamp @returns {number} the smoothed frame rate */
  sample(timestamp) {
    if (this.lastTimestamp !== null) {
      const elapsed = timestamp - this.lastTimestamp;
      if (elapsed > 0) {
        const instant = 1000 / elapsed;
        this.fps = this.fps === 0 ? instant : this.fps * this.smoothing + instant * (1 - this.smoothing);
      }
    }
    this.lastTimestamp = timestamp;
    return this.fps;
  }
}
