/**
 * Thin browser adapter over the raw AssemblyScript exports.
 */
export class SimulationClient {
  /** @param {WebAssembly.Exports} exports */
  constructor(exports) {
    this.exports = exports;
    const memory = exports.memory;
    if (!(memory instanceof WebAssembly.Memory)) {
      throw new Error("The simulation module did not export WebAssembly memory.");
    }
    this.memory = memory;
    this.carCount = 0;
    this.carCapacity = 0;
    this.gridSize = 0;
    this.roadTileCount = 0;
    this.roadTiles = new Uint8Array();
    this.x = new Float32Array();
    this.y = new Float32Array();
    this.speeds = new Float32Array();
    this.actualSpeeds = new Float32Array();
    this.segments = new Uint32Array();
    this.progress = new Float32Array();
    this.targetsX = new Uint16Array();
    this.targetsY = new Uint16Array();
    this.directions = new Uint8Array();
  }

  /**
   * @param {URL|string} wasmUrl
   * @returns {Promise<SimulationClient>}
   */
  static async load(wasmUrl) {
    const imports = {
      env: {
        /** @param {number} message @param {number} file @param {number} line @param {number} column */
        abort(message, file, line, column) {
          throw new Error(
            `WASM aborted (${message}:${file}:${line}:${column}).`,
          );
        },
      },
    };

    const response = await fetch(wasmUrl);
    if (!response.ok) {
      throw new Error(`Unable to load simulation.wasm (${response.status}).`);
    }

    let result;
    try {
      result = await WebAssembly.instantiateStreaming(response.clone(), imports);
    } catch {
      result = await WebAssembly.instantiate(
        await response.arrayBuffer(),
        imports,
      );
    }

    return new SimulationClient(result.instance.exports);
  }

  /** @param {number} seed @param {number} carCount */
  initialize(seed, carCount) {
    this.#call("initialize", seed, carCount);
    this.carCount = this.#call("getCarCount");
    this.carCapacity = this.#call("getCarCapacity");
    this.gridSize = this.#call("getGridSize");
    this.roadTileCount = this.#call("getRoadTileCount");
    this.#refreshViews();
  }

  /** @param {number} deltaSeconds */
  step(deltaSeconds) {
    this.#call("step", deltaSeconds);
  }

  /** @param {number} requestedCarCount */
  setActiveCarCount(requestedCarCount) {
    this.carCount = this.#call("setActiveCarCount", requestedCarCount);
    return this.carCount;
  }

  get tick() {
    return this.#call("getTick");
  }

  get junctionCandidates() {
    return this.#call("getJunctionCandidateCount");
  }

  get junctionGrants() {
    return this.#call("getJunctionGrantCount");
  }

  get downstreamBlocked() {
    return this.#call("getDownstreamBlockedCount");
  }

  #refreshViews() {
    const buffer = this.memory.buffer;
    this.roadTiles = new Uint8Array(
      buffer,
      this.#call("getRoadTilePointer"),
      this.roadTileCount,
    );
    this.x = new Float32Array(
      buffer,
      this.#call("getCarXPointer"),
      this.carCapacity,
    );
    this.y = new Float32Array(
      buffer,
      this.#call("getCarYPointer"),
      this.carCapacity,
    );
    this.speeds = new Float32Array(
      buffer,
      this.#call("getCarSpeedPointer"),
      this.carCapacity,
    );
    this.actualSpeeds = new Float32Array(
      buffer,
      this.#call("getCarActualSpeedPointer"),
      this.carCapacity,
    );
    this.segments = new Uint32Array(
      buffer,
      this.#call("getCarSegmentPointer"),
      this.carCapacity,
    );
    this.progress = new Float32Array(
      buffer,
      this.#call("getCarProgressPointer"),
      this.carCapacity,
    );
    this.targetsX = new Uint16Array(
      buffer,
      this.#call("getCarTargetXPointer"),
      this.carCapacity,
    );
    this.targetsY = new Uint16Array(
      buffer,
      this.#call("getCarTargetYPointer"),
      this.carCapacity,
    );
    this.directions = new Uint8Array(
      buffer,
      this.#call("getCarDirectionPointer"),
      this.carCapacity,
    );
  }

  /**
   * @param {string} name
   * @param {...number} arguments_
   * @returns {number}
   */
  #call(name, ...arguments_) {
    const operation = this.exports[name];
    if (typeof operation !== "function") {
      throw new Error(`Missing WASM export: ${name}`);
    }
    const result = operation(...arguments_);
    return typeof result === "number" ? result : 0;
  }
}
