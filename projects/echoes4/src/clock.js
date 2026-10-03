export class SimulationClock {
  /** @param {number} tickRate */
  constructor(tickRate) { this.tickRate = tickRate; this.accumulator = 0; }
  /** @param {number} elapsedSeconds @param {boolean} running */
  advance(elapsedSeconds, running) {
    if (!running) { this.accumulator = 0; return 0; }
    this.accumulator += Math.max(0, Math.min(.2, elapsedSeconds));
    const steps = Math.floor((this.accumulator + 1e-9) * this.tickRate);
    this.accumulator -= steps / this.tickRate;
    return steps;
  }
}
