const DEFAULTS = Object.freeze({
  congestionSamples: 3,
  congestionThreshold: 0.72,
  evaluationSteps: 30,
  minimumCars: 25_000,
  recoveryBatch: 500,
  recoverySamples: 8,
  recoveryThreshold: 0.58,
  removalBatch: 2_000,
  smoothing: 0.25,
});

export class AdaptivePopulationController {
  /**
   * @param {{
   *   capacity: number,
   *   congestionSamples?: number,
   *   congestionThreshold?: number,
   *   evaluationSteps?: number,
   *   minimumCars?: number,
   *   recoveryBatch?: number,
   *   recoverySamples?: number,
   *   recoveryThreshold?: number,
   *   removalBatch?: number,
   *   smoothing?: number,
   * }} options
  */
  constructor(options) {
    this.options = {
      capacity: options.capacity,
      congestionSamples:
        options.congestionSamples ?? DEFAULTS.congestionSamples,
      congestionThreshold:
        options.congestionThreshold ?? DEFAULTS.congestionThreshold,
      evaluationSteps:
        options.evaluationSteps ?? DEFAULTS.evaluationSteps,
      minimumCars: options.minimumCars ?? DEFAULTS.minimumCars,
      recoveryBatch: options.recoveryBatch ?? DEFAULTS.recoveryBatch,
      recoverySamples:
        options.recoverySamples ?? DEFAULTS.recoverySamples,
      recoveryThreshold:
        options.recoveryThreshold ?? DEFAULTS.recoveryThreshold,
      removalBatch: options.removalBatch ?? DEFAULTS.removalBatch,
      smoothing: options.smoothing ?? DEFAULTS.smoothing,
    };
    this.congestedSamples = 0;
    this.recoveredSamples = 0;
    this.steps = 0;
    /** @type {number | null} */
    this.smoothedPressure = null;
  }

  reset() {
    this.congestedSamples = 0;
    this.recoveredSamples = 0;
    this.steps = 0;
    this.smoothedPressure = null;
  }

  /**
   * @param {{
   *   activeCars: number,
   *   candidates: number,
   *   demandCars?: number,
   *   downstreamBlocked: number,
   *   grants: number,
   * }} telemetry
   */
  observe(telemetry) {
    const activeCars = telemetry.activeCars;
    const demandCeiling = Math.max(
      0,
      Math.min(
        this.options.capacity,
        telemetry.demandCars ?? this.options.capacity,
      ),
    );
    if (activeCars > demandCeiling) {
      return this.#result(demandCeiling, "capping");
    }
    this.steps += 1;
    if (this.steps < this.options.evaluationSteps) {
      return this.#result(activeCars, "sampling");
    }
    this.steps = 0;

    const pressure = this.#pressure(telemetry);
    this.smoothedPressure =
      this.smoothedPressure === null
        ? pressure
        : this.smoothedPressure * (1 - this.options.smoothing) +
          pressure * this.options.smoothing;

    if (this.smoothedPressure > this.options.congestionThreshold) {
      this.congestedSamples += 1;
      this.recoveredSamples = 0;
      if (this.congestedSamples >= this.options.congestionSamples) {
        this.congestedSamples = 0;
        return this.#result(
          Math.max(
            Math.min(this.options.minimumCars, demandCeiling),
            activeCars - this.options.removalBatch,
          ),
          "reducing",
        );
      }
      return this.#result(activeCars, "congested");
    }

    if (this.smoothedPressure < this.options.recoveryThreshold) {
      this.recoveredSamples += 1;
      this.congestedSamples = 0;
      if (this.recoveredSamples >= this.options.recoverySamples) {
        this.recoveredSamples = 0;
        return this.#result(
          Math.min(
            demandCeiling,
            activeCars + this.options.recoveryBatch,
          ),
          "restoring",
        );
      }
      return this.#result(activeCars, "recovering");
    }

    this.congestedSamples = 0;
    this.recoveredSamples = 0;
    return this.#result(activeCars, "stable");
  }

  /** @param {number} targetCarCount @param {string} state */
  #result(targetCarCount, state) {
    return {
      pressure: this.smoothedPressure ?? 0,
      state,
      targetCarCount,
    };
  }

  /**
   * @param {{
   *   activeCars: number,
   *   candidates: number,
   *   downstreamBlocked: number,
   *   grants: number,
   * }} telemetry
   */
  #pressure(telemetry) {
    if (telemetry.candidates <= 0 || telemetry.activeCars <= 0) return 0;
    const conflictWaiting = Math.max(
      0,
      telemetry.candidates -
        telemetry.downstreamBlocked -
        telemetry.grants,
    );
    const weightedQueue =
      telemetry.downstreamBlocked + conflictWaiting * 0.35;
    return Math.min(
      1,
      weightedQueue / telemetry.activeCars / 0.05,
    );
  }
}
