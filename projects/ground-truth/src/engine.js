/**
 * Ground Truth engine.
 *
 * The world holds two layers of the same grid: `field`, the static image, and
 * `overlay`, this frame's moving pixels. A fixed pool of particle slots is the
 * only budget for motion — a pixel can only leave the image if a slot is free,
 * and a slot only frees when a pixel settles back into the image.
 */
import { decodeCounters } from "./core/counters.js";
import { intakeChance } from "./core/fountain.js";
import { PARAMS_BYTES, workgroupCount, writeParams } from "./core/layout.js";
import { ringMask } from "./core/capacity.js";
import { clampRestThreshold } from "./core/rest.js";
import { defaultSettings, intakeCellCount } from "./core/settings.js";
import { createSourceField } from "./core/source-image.js";
import { acquireDevice } from "./gpu/device.js";
import { createPipelines } from "./gpu/pipelines.js";
import { SimulationResources } from "./gpu/resources.js";

export class GroundTruthEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {GPUDevice} device
   * @param {GPUCanvasContext} context
   * @param {ReturnType<typeof createPipelines>} pipelines
   * @param {import("./core/settings.js").Settings} settings
   */
  constructor(canvas, device, context, pipelines, settings) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.pipelines = pipelines;
    this.settings = settings;
    this.frame = 0;
    this.paused = false;
    this.fountainScale = 1;
    /** @type {{ x: number, y: number, radius: number, strength: number }} */
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.paramsData = new ArrayBuffer(PARAMS_BYTES);
    /** @type {import("./core/field-format.js").Field} */
    this.sourceField = createSourceField(settings.world);
    this.resources = new SimulationResources(device, settings.world);
    this.stats = decodeCounters(new Uint32Array(12), settings.capacity);
    this.reset(settings.capacity);
  }

  /** @param {HTMLCanvasElement} canvas @returns {Promise<GroundTruthEngine>} */
  static async create(canvas) {
    const { device, context, format } = await acquireDevice(canvas);
    const pipelines = createPipelines(device, format);
    return new GroundTruthEngine(canvas, device, context, pipelines, defaultSettings());
  }

  /**
   * Rebuilds the pool and restores the untouched image.
   *
   * @param {number} [capacity]
   */
  reset(capacity = this.settings.capacity) {
    this.settings.capacity = capacity;
    this.frame = 0;
    this.resources.allocatePool(capacity, this.pipelines.computeLayout, this.pipelines.compositeLayout);
    this.resources.uploadField(this.sourceField);
    this.resources.resetCounters(capacity);
    this.#writeParams();
    const encoder = this.device.createCommandEncoder({ label: "init-pool" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines.initPool);
    pass.setBindGroup(0, this.#computeBindGroup());
    pass.dispatchWorkgroups(workgroupCount(this.resources.ringSize));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.stats = decodeCounters(new Uint32Array(12), capacity);
  }

  /** @param {import("./core/field-format.js").Field} field a `width * height` field to use as the image */
  loadField(field) {
    if (field.length !== this.settings.world.width * this.settings.world.height) {
      throw new Error("Source field does not match the world size.");
    }
    this.sourceField = field;
    this.reset();
  }

  /** @param {number} threshold frames a pixel may sit still before settling */
  setRestThreshold(threshold) {
    this.settings.restThreshold = clampRestThreshold(threshold);
  }

  /** @param {number} scale multiplier on the fountain intake servo, 0 stops it */
  setFountainScale(scale) {
    this.fountainScale = Math.max(0, scale);
  }

  /**
   * Knocks every settled pixel inside a radius loose, so the image can be
   * perturbed by hand as well as by the fountain.
   *
   * @param {number} x @param {number} y world coordinates
   */
  perturb(x, y) {
    this.blast = { x, y, radius: this.settings.blastRadius, strength: this.settings.blastStrength };
  }

  /** Advances one frame and presents it. */
  step() {
    if (!this.paused) this.frame += 1;
    this.#writeParams();

    const encoder = this.device.createCommandEncoder({ label: `frame-${this.frame}` });
    const bindGroup = this.#computeBindGroup();
    const poolGroups = workgroupCount(this.settings.capacity);
    const cellGroups = workgroupCount(this.resources.cellCount);

    const compute = encoder.beginComputePass({ label: "simulate" });
    compute.setBindGroup(0, bindGroup);
    if (!this.paused) {
      compute.setPipeline(this.pipelines.compute.prepare);
      compute.dispatchWorkgroups(1);
      compute.setPipeline(this.pipelines.compute.integrate);
      for (let substep = 0; substep < this.settings.substeps; substep += 1) {
        compute.dispatchWorkgroups(poolGroups);
      }
      compute.setPipeline(this.pipelines.compute.advance);
      compute.dispatchWorkgroups(poolGroups);
      compute.setPipeline(this.pipelines.compute.settle);
      compute.dispatchWorkgroups(poolGroups);
      compute.setPipeline(this.pipelines.compute.emit);
      compute.dispatchWorkgroups(cellGroups);
      // Splat last, and only when emit has run: emit is what clears the
      // overlay, so splatting without it would draw over stale pixels.
      compute.setPipeline(this.pipelines.compute.splat);
      compute.dispatchWorkgroups(poolGroups);
    }
    compute.end();

    const render = encoder.beginRenderPass({
      label: "composite",
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.016, g: 0.018, b: 0.026, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    render.setPipeline(this.pipelines.composite);
    render.setBindGroup(0, this.#compositeBindGroup());
    render.draw(3);
    render.end();

    const slot = this.resources.readback.request(encoder, this.resources.counters);
    this.device.queue.submit([encoder.finish()]);
    this.resources.readback.collect(slot);
    this.stats = decodeCounters(this.resources.readback.latest, this.settings.capacity);

    // A blast is a single-frame impulse; clear it once it has been dispatched.
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
  }

  /**
   * Maps a client-space point onto the letterboxed world, matching the
   * composite shader's framing.
   *
   * @param {number} clientX @param {number} clientY
   * @returns {{ x: number, y: number }|null} null when the point is on the letterbox
   */
  worldFromClient(clientX, clientY) {
    const bounds = this.canvas.getBoundingClientRect();
    const viewAspect = bounds.width / bounds.height;
    const worldAspect = this.settings.world.width / this.settings.world.height;
    const scaleX = viewAspect > worldAspect ? worldAspect / viewAspect : 1;
    const scaleY = viewAspect > worldAspect ? 1 : viewAspect / worldAspect;
    const u = ((clientX - bounds.left) / bounds.width - 0.5) / scaleX + 0.5;
    const v = ((clientY - bounds.top) / bounds.height - 0.5) / scaleY + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;
    return { x: u * this.settings.world.width, y: (1 - v) * this.settings.world.height };
  }

  #computeBindGroup() {
    const group = this.resources.computeBindGroup;
    if (!group) throw new Error("The particle pool has not been allocated.");
    return group;
  }

  #compositeBindGroup() {
    const group = this.resources.compositeBindGroup;
    if (!group) throw new Error("The particle pool has not been allocated.");
    return group;
  }

  #writeParams() {
    const settings = this.settings;
    const chance = intakeChance(this.stats.free, intakeCellCount(settings), settings.refillFrames);
    writeParams(this.paramsData, {
      world: settings.world,
      capacity: settings.capacity,
      ringMask: ringMask(settings.capacity),
      gravity: settings.gravity,
      dt: settings.frameSeconds / settings.substeps,
      damping: settings.damping,
      restitution: settings.restitution,
      restThreshold: settings.restThreshold,
      frame: this.frame,
      intakeChance: chance * this.fountainScale,
      intakeRows: settings.intakeRows,
      fountain: settings.fountain,
      dislodgeSpeed: settings.dislodgeSpeed,
      blast: this.blast,
      viewport: { width: this.canvas.width, height: this.canvas.height },
    });
    this.device.queue.writeBuffer(this.resources.params, 0, this.paramsData);
  }
}
