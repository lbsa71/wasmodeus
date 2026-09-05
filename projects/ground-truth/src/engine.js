/**
 * Ground Truth engine.
 *
 * The world holds two layers of the same grid: `field`, the static world, and
 * `overlay`, this frame's moving pixels. A pixel is never in both. A fixed pool
 * of particle slots is the entire budget for motion — a pixel can only leave
 * the world if a slot is free, and a slot only frees when a pixel comes to rest
 * and blends back in.
 */
import { COUNTERS_BYTES, decodeCounters } from "./core/counters.js";
import { AGENT_CAPACITY, AGENT_STRIDE_BYTES, PARAMS_BYTES, dispatchGrid, maxCapacityFor, writeParams } from "./core/layout.js";
import { ringMask } from "./core/capacity.js";
import { clampRestThreshold } from "./core/rest.js";
import { clampRestitution } from "./core/collision.js";
import { MODE_WALK, packAgent, timerFor } from "./core/agents.js";
import { hashU32 } from "./core/prng.js";
import { defaultSettings } from "./core/settings.js";
import { clampCamera, createCamera, panCamera, worldFromScreen, zoomCameraAt } from "./core/camera.js";
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
    /** True once a generated world has been handed over. */
    this.ready = false;
    /** @type {((message: string) => void)|null} Reports GPU faults to the UI. */
    this.onDeviceError = null;
    // A rejected dispatch invalidates the whole command buffer, and the frame
    // then renders nothing at all. Without this the only symptom is a black
    // screen, so faults are surfaced rather than swallowed.
    device.addEventListener("uncapturederror", (event) => {
      const error = /** @type {GPUUncapturedErrorEvent} */ (event).error;
      this.#report(error.message);
    });
    device.lost.then((info) => {
      this.ready = false;
      this.#report(`The GPU device was lost: ${info.message || info.reason}`);
    });
    /** @type {{ x: number, y: number, radius: number, strength: number }} */
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    /** Drag direction of the pointer brush; zero means a radial blast. */
    this.drag = { x: 0, y: 0 };
    this.paramsData = new ArrayBuffer(PARAMS_BYTES);
    /** @type {import("./core/field-format.js").Field|null} */
    this.sourceField = null;
    this.resources = new SimulationResources(device, settings.world);
    this.settings.capacity = Math.min(settings.capacity, maxCapacityFor(device.limits));
    this.stats = decodeCounters(new Uint32Array(COUNTERS_BYTES / 4), this.settings.capacity);
    // Start looking at the surface, which is where the interesting boundary
    // between sky, soil and rock is.
    this.camera = createCamera(settings.world, this.viewport, {
      y: settings.world.height * 0.8,
      scale: 1,
    });
    /** @type {string|null} First GPU fault seen; repeats are not re-reported. */
    this.reportedError = null;
    this.maxWorkgroups = device.limits.maxComputeWorkgroupsPerDimension;
    /** Largest pool this device can hold; the slider is capped to it. */
    this.maxCapacity = maxCapacityFor(device.limits);
  }

  /** @param {HTMLCanvasElement} canvas @returns {Promise<GroundTruthEngine>} */
  static async create(canvas) {
    const { device, context, format } = await acquireDevice(canvas);
    const pipelines = createPipelines(device, format);
    return new GroundTruthEngine(canvas, device, context, pipelines, defaultSettings());
  }

  /** @returns {{ width: number, height: number }} the drawing buffer, in device pixels */
  get viewport() {
    return { width: this.canvas.width, height: this.canvas.height };
  }

  /**
   * Adopts a freshly generated world and starts simulating it.
   *
   * @param {import("./core/field-format.js").Field} field
   */
  loadWorld(field) {
    const { width, height } = this.settings.world;
    if (field.length !== width * height) {
      throw new Error(`Expected a ${width} x ${height} world, got ${field.length} cells.`);
    }
    this.sourceField = field;
    this.ready = true;
    // Re-clamp: the camera was built before the world existed, and a view
    // pointing outside it renders nothing but void.
    this.camera = clampCamera(this.camera, this.settings.world, this.viewport);
    this.reset();
  }

  /**
   * Restores the untouched world and rebuilds the pool.
   *
   * @param {number} [capacity]
   */
  reset(capacity = this.settings.capacity) {
    this.settings.capacity = Math.max(1, Math.min(this.maxCapacity, Math.round(capacity)));
    capacity = this.settings.capacity;
    this.frame = 0;
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.drag = { x: 0, y: 0 };
    this.resources.allocatePool(capacity, this.pipelines.computeLayout, this.pipelines.compositeLayout);
    if (this.sourceField) this.resources.uploadField(this.sourceField);
    this.resources.resetCounters(capacity);
    this.#writeParams();
    const encoder = this.device.createCommandEncoder({ label: "init-pool" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines.initPool);
    pass.setBindGroup(0, this.#computeBindGroup());
    const init = dispatchGrid(this.resources.ringSize, this.maxWorkgroups);
    pass.dispatchWorkgroups(init.x, init.y);
    // Stored momentum outlives a frame, so a reset has to wipe it too.
    const cells = dispatchGrid(this.resources.cellCount, this.maxWorkgroups);
    pass.setPipeline(this.pipelines.clearImpulse);
    pass.dispatchWorkgroups(cells.x, cells.y);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    if (this.sourceField) this.populate();
    this.stats = decodeCounters(new Uint32Array(COUNTERS_BYTES / 4), capacity);
  }

  /** @param {number} threshold frames a pixel may sit still before settling */
  setRestThreshold(threshold) {
    this.settings.restThreshold = clampRestThreshold(threshold);
  }

  /** @param {number} chance per-frame probability that a diagonally-unsupported pixel lets go */
  setSlumpChance(chance) {
    this.settings.slumpChance = Math.min(1, Math.max(0, chance));
  }

  /**
   * Coefficient of restitution: the elasticity of every impact. At 1 no energy
   * leaves the system on collision and a disturbed pile trades it back and
   * forth indefinitely.
   *
   * @param {number} restitution
   */
  setRestitution(restitution) {
    this.settings.restitution = clampRestitution(restitution);
  }

  /**
   * Scatters lemmings across the surface of the world. They fall to whatever is
   * under them, so the exact drop height does not matter.
   *
   * @param {number} [count]
   */
  populate(count = this.settings.agents.count) {
    const { width, height } = this.settings.world;
    this.settings.agents.count = Math.max(0, Math.min(AGENT_CAPACITY, Math.round(count)));
    const data = new ArrayBuffer(Math.max(1, this.settings.agents.count) * AGENT_STRIDE_BYTES);
    const floats = new Float32Array(data);
    const words = new Uint32Array(data);
    const stride = AGENT_STRIDE_BYTES / 4;
    for (let i = 0; i < this.settings.agents.count; i += 1) {
      floats[i * stride] = ((i + 0.5) / this.settings.agents.count) * width;
      floats[i * stride + 1] = height * 0.95;
      words[i * stride + 4] = packAgent({
        alive: true,
        mode: MODE_WALK,
        facing: i % 2 === 0 ? 1 : -1,
        timer: timerFor(hashU32(i), 30, 150),
      });
    }
    this.device.queue.writeBuffer(this.resources.agents, 0, data);
  }

  /** @param {number} radius world pixels */
  setBrushRadius(radius) {
    this.settings.brushRadius = Math.max(1, radius);
  }

  /** Re-clamps the camera after the drawing buffer changes size. */
  resize() {
    this.camera = clampCamera(this.camera, this.settings.world, this.viewport);
  }

  /** @param {number} dx @param {number} dy device pixels */
  pan(dx, dy) {
    this.camera = panCamera(this.camera, dx, dy, this.settings.world, this.viewport);
  }

  /** @param {number} factor @param {number} screenX @param {number} screenY device pixels */
  zoomAt(factor, screenX, screenY) {
    this.camera = zoomCameraAt(this.camera, factor, screenX, screenY, this.settings.world, this.viewport);
  }

  /**
   * @param {number} screenX @param {number} screenY device pixels
   * @returns {{ x: number, y: number }} world coordinates
   */
  worldFromScreen(screenX, screenY) {
    return worldFromScreen(this.camera, this.viewport, screenX, screenY);
  }

  /**
   * Drags everything under the brush along `dx, dy` — the smudge.
   *
   * Gentler than a blast, and better behaved for a reason worth knowing: a
   * blast fires material radially, which inside a pocket means into the nearest
   * wall, where most of it is too well bonded to break. The debris reflects,
   * comes back inward, and mills about until the collapse buries it. A drag
   * sends material somewhere it can actually go.
   *
   * @param {number} x @param {number} y world coordinates
   * @param {number} dx @param {number} dy drag direction, any length
   */
  smudgeAt(x, y, dx, dy) {
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;
    this.blast = { x, y, radius: this.settings.brushRadius, strength: this.settings.smudgeStrength };
    this.drag = { x: dx / length, y: dy / length };
  }

  /**
   * Blows a crater. Unlike every other rule in the simulation this one ignores
   * a cell's bond entirely, so it is the only thing that shifts bedrock.
   *
   * @param {number} x @param {number} y world coordinates
   */
  explodeAt(x, y) {
    this.blast = { x, y, radius: this.settings.brushRadius, strength: this.settings.blastStrength };
    this.drag = { x: 0, y: 0 };
  }

  /** Advances one frame and presents it. */
  step() {
    if (!this.ready) return;
    if (!this.paused) this.frame += 1;
    this.#writeParams();

    const encoder = this.device.createCommandEncoder({ label: `frame-${this.frame}` });
    const pool = dispatchGrid(this.settings.capacity, this.maxWorkgroups);
    const cells = dispatchGrid(this.resources.cellCount, this.maxWorkgroups);

    const compute = encoder.beginComputePass({ label: "simulate" });
    compute.setBindGroup(0, this.#computeBindGroup());
    if (!this.paused) {
      compute.setPipeline(this.pipelines.compute.prepare);
      compute.dispatchWorkgroups(1);
      compute.setPipeline(this.pipelines.compute.integrate);
      for (let substep = 0; substep < this.settings.substeps; substep += 1) {
        compute.dispatchWorkgroups(pool.x, pool.y);
      }
      compute.setPipeline(this.pipelines.compute.advance);
      compute.dispatchWorkgroups(pool.x, pool.y);
      compute.setPipeline(this.pipelines.compute.settle);
      compute.dispatchWorkgroups(pool.x, pool.y);
      // Lemmings go before `emit` so that digging and detonating draw on the
      // same pool budget the world does, rather than on top of it. They read
      // the overlay for what hit them, which at this point still holds the
      // previous frame's pixels — a frame stale, and plenty.
      const agents = dispatchGrid(this.settings.agents.count, this.maxWorkgroups);
      compute.setPipeline(this.pipelines.compute.step_agents);
      compute.dispatchWorkgroups(agents.x, agents.y);
      compute.setPipeline(this.pipelines.compute.emit);
      compute.dispatchWorkgroups(cells.x, cells.y);
      // Splat only once emit has run: emit is what clears the overlay, so
      // splatting without it would draw over stale pixels.
      compute.setPipeline(this.pipelines.compute.splat);
      compute.dispatchWorkgroups(pool.x, pool.y);
      // Lemmings are drawn last, over the pixels.
      compute.setPipeline(this.pipelines.compute.draw_agents);
      compute.dispatchWorkgroups(agents.x, agents.y);
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

    // The brush is a single-frame impulse; clear it once it has been dispatched.
    this.blast = { x: 0, y: 0, radius: 0, strength: 0 };
    this.drag = { x: 0, y: 0 };
  }

  /** @param {string} message */
  #report(message) {
    if (this.reportedError) return;
    this.reportedError = message;
    this.onDeviceError?.(message);
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
      slumpChance: settings.slumpChance,
      slideSpeed: settings.slideSpeed,
      dislodgeSpeed: settings.dislodgeSpeed,
      blast: this.blast,
      viewport: this.viewport,
      camera: this.camera,
      rubbleBond: settings.rubbleBond,
      drag: this.drag,
      agents: settings.agents,
      frameSeconds: settings.frameSeconds,
      waterSpread: settings.waterSpread,
    });
    this.device.queue.writeBuffer(this.resources.params, 0, this.paramsData);
  }
}
