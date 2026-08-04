import { WebGpuGalaxyRenderer } from "./render/webgpu-renderer.js";
import { addSimulationSeconds } from "./core/simulation-time.js";

export class GalaxyEngine {
  /** @param {HTMLCanvasElement} canvas @param {{ seed?: bigint, maxStars?: number }} config */
  static async create(canvas, config = {}) {
    const renderer = await WebGpuGalaxyRenderer.create(canvas);
    const worker = new Worker(new URL("./galaxy-worker.js", import.meta.url), { type: "module" });
    const engine = new GalaxyEngine(worker, renderer, config.maxStars ?? 16_384);
    await engine.#initialize(config.seed ?? 0x5EEDC0DEn);
    return engine;
  }

  /** @param {Worker} worker @param {WebGpuGalaxyRenderer} renderer @param {number} maxStars */
  constructor(worker, renderer, maxStars) {
    this.worker = worker;
    this.renderer = renderer;
    this.maxStars = maxStars;
    /** @type {{ positionParsecs: number[], zoomParsecs?: number, aspect?: number, viewProjection?: Float32Array, pointSize?: number }} */ this.camera = { positionParsecs: [0, 0, 0] };
    this.time = { epochDays: 0n, secondsOfDay: 0 };
    this.lastTimePublishMillis = -Infinity;
    this.lastViewPublishMillis = -Infinity;
    /** @type {ReturnType<typeof setTimeout>|null} */ this.viewPublishTimer = null;
    this.activeSystem = null;
    /** @type {((view: { positionParsecs: number[], zoomParsecs: number, aspect?: number }) => void)|null} */ this.onSystemView = null;
    this.layer = "GALAXY OVERVIEW";
    /** @type {{ resolve: (value: unknown) => void, reject: (reason?: unknown) => void }|null} */ this.ready = null;
    worker.onmessage = ({ data }) => {
      if (data.type === "ready" && this.ready) this.ready.resolve(data);
      if (data.type === "snapshot") {
        this.renderer.update(data.snapshot);
        this.layer = data.snapshot.layer;
        if (data.snapshot.lockPositionParsecs) this.camera.positionParsecs = data.snapshot.lockPositionParsecs;
      }
      if (data.type === "system") {
        this.activeSystem = data.system;
        if (data.view && this.onSystemView) this.onSystemView(data.view);
      }
    };
  }

  /** @param {bigint} seed */
  #initialize(seed) {
    return new Promise((resolve, reject) => {
      this.ready = { resolve, reject };
      this.worker.onerror = (event) => reject(event.error ?? new Error(event.message));
      this.worker.postMessage({ type: "init", seed, wasmUrl: new URL("./galaxy-core.wasm", import.meta.url).href });
    });
  }

  /** @param {{ positionParsecs: number[], zoomParsecs?: number, aspect?: number, viewProjection?: Float32Array, pointSize?: number }} camera */
  setCamera(camera) { this.camera = camera; this.#queueViewPublish(); }
  /** @param {{ epochDays: bigint, secondsOfDay: number }} time */
  setTime(time) { this.time = time; this.#publishTime(); }
  /** @param {number} realSeconds @param {number} timeScale */
  advance(realSeconds, timeScale) {
    this.time = addSimulationSeconds(this.time, realSeconds * timeScale);
    if ((performance.now() - this.lastTimePublishMillis) >= 66) this.#publishTime();
  }
  #publishTime() {
    this.lastTimePublishMillis = performance.now();
    this.worker.postMessage({ type: "time", time: this.time, view: { positionParsecs: this.camera.positionParsecs, zoomParsecs: this.camera.zoomParsecs, aspect: this.camera.aspect, maxStars: this.maxStars } });
  }
  #queueViewPublish() {
    const delay = Math.max(0, 33 - (performance.now() - this.lastViewPublishMillis));
    if (delay === 0 && !this.viewPublishTimer) {
      this.#publishView();
      return;
    }
    if (!this.viewPublishTimer) {
      this.viewPublishTimer = setTimeout(() => {
        this.viewPublishTimer = null;
        this.#publishView();
      }, delay);
    }
  }
  #publishView() {
    this.lastViewPublishMillis = performance.now();
    this.worker.postMessage({ type: "view", view: { positionParsecs: this.camera.positionParsecs, zoomParsecs: this.camera.zoomParsecs, aspect: this.camera.aspect, maxStars: this.maxStars } });
  }
  /** @param {import("./core/body-ref.js").BodyRef} body @param {typeof this.camera} [camera] */
  focus(body, camera = this.camera) {
    this.worker.postMessage({ type: "focus", body, view: { positionParsecs: camera.positionParsecs, zoomParsecs: camera.zoomParsecs, aspect: camera.aspect, maxStars: this.maxStars } });
  }
  render() { this.renderer.render({ viewProjection: this.camera.viewProjection, pointSize: this.camera.pointSize }); }
  /** @param {number} x @param {number} y */
  pick(x, y) { return this.renderer.pick(x, y, this.camera); }
  dispose() { if (this.viewPublishTimer) clearTimeout(this.viewPublishTimer); this.worker.terminate(); }
}
