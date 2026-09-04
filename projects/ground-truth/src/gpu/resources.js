/**
 * Buffer ownership. World-sized buffers (the static field and the moving
 * overlay) live for the whole session; pool-sized buffers are rebuilt whenever
 * the capacity slider moves.
 */
import { COUNTERS_BYTES, counterIndex } from "../core/counters.js";
import { AGENT_CAPACITY, AGENT_STRIDE_BYTES, PARAMS_BYTES, PARTICLE_STRIDE_BYTES, STATE_BYTES } from "../core/layout.js";
import { ringSize } from "../core/capacity.js";

/** How many counter staging buffers to cycle through before stalling. */
const READBACK_DEPTH = 3;

export class SimulationResources {
  /**
   * @param {GPUDevice} device
   * @param {{ width: number, height: number }} world
   */
  constructor(device, world) {
    this.device = device;
    this.world = world;
    this.cellCount = world.width * world.height;
    this.capacity = 0;
    this.ringSize = 0;

    this.params = device.createBuffer({
      label: "params",
      size: PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.field = device.createBuffer({
      label: "field",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.overlay = device.createBuffer({
      label: "overlay",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    // Momentum handed to a cell by whatever struck it, two f16 to a word. It
    // has to outlive the frame the impact happened in, because the cell is not
    // released until the next `emit`.
    this.impulse = device.createBuffer({
      label: "impulse",
      size: this.cellCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    // Lemmings. Few enough that this is a rounding error next to the field.
    this.agents = device.createBuffer({
      label: "agents",
      size: AGENT_CAPACITY * AGENT_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.counters = device.createBuffer({
      label: "counters",
      size: COUNTERS_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    /** @type {GPUBuffer|null} */ this.particles = null;
    /** @type {GPUBuffer|null} */ this.states = null;
    /** @type {GPUBuffer|null} */ this.freeRing = null;
    /** @type {GPUBindGroup|null} */ this.computeBindGroup = null;
    /** @type {GPUBindGroup|null} */ this.compositeBindGroup = null;
    this.readback = new CounterReadback(device, COUNTERS_BYTES);
  }

  /**
   * (Re)allocates the pool. Existing motion is discarded: the caller is
   * expected to reset the field alongside it.
   *
   * @param {number} capacity
   * @param {GPUBindGroupLayout} computeLayout
   * @param {GPUBindGroupLayout} compositeLayout
   */
  allocatePool(capacity, computeLayout, compositeLayout) {
    this.particles?.destroy();
    this.states?.destroy();
    this.freeRing?.destroy();
    this.capacity = capacity;
    this.ringSize = ringSize(capacity);
    this.particles = this.device.createBuffer({
      label: "particles",
      size: capacity * PARTICLE_STRIDE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.states = this.device.createBuffer({
      label: "states",
      size: capacity * STATE_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.freeRing = this.device.createBuffer({
      label: "free-ring",
      size: this.ringSize * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    this.computeBindGroup = this.device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.field } },
        { binding: 3, resource: { buffer: this.overlay } },
        { binding: 4, resource: { buffer: this.freeRing } },
        { binding: 5, resource: { buffer: this.counters } },
        { binding: 6, resource: { buffer: this.states } },
        { binding: 7, resource: { buffer: this.impulse } },
        { binding: 8, resource: { buffer: this.agents } },
      ],
    });
    this.compositeBindGroup = this.device.createBindGroup({
      layout: compositeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.field } },
        { binding: 2, resource: { buffer: this.overlay } },
      ],
    });
  }

  /** @param {import("../core/field-format.js").Field} sourceField */
  uploadField(sourceField) {
    this.device.queue.writeBuffer(this.field, 0, sourceField);
    this.device.queue.writeBuffer(this.overlay, 0, new ArrayBuffer(this.cellCount * 4));
  }

  /**
   * Resets the ring indices so the whole pool reads as free. Must be paired
   * with the `init_pool` dispatch that refills the ring contents.
   *
   * @param {number} capacity
   */
  resetCounters(capacity) {
    const block = new ArrayBuffer(COUNTERS_BYTES);
    const words = new Uint32Array(block);
    words[counterIndex("head")] = 0;
    words[counterIndex("tail")] = capacity;
    this.device.queue.writeBuffer(this.counters, 0, block);
  }

  destroy() {
    this.particles?.destroy();
    this.states?.destroy();
    this.freeRing?.destroy();
    this.field.destroy();
    this.overlay.destroy();
    this.impulse.destroy();
    this.agents.destroy();
    this.counters.destroy();
    this.params.destroy();
    this.readback.destroy();
  }
}

/**
 * Non-blocking counter readback. Frames never wait on a map: whatever the most
 * recently completed copy said is what the debug panel and the fountain servo
 * use, which is at worst a couple of frames stale.
 */
export class CounterReadback {
  /** @param {GPUDevice} device @param {number} byteLength */
  constructor(device, byteLength) {
    this.device = device;
    this.byteLength = byteLength;
    this.slots = Array.from({ length: READBACK_DEPTH }, () => ({
      buffer: device.createBuffer({ size: byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
      busy: false,
    }));
    /** @type {Uint32Array} the newest completed snapshot */
    this.latest = new Uint32Array(byteLength / 4);
  }

  /**
   * Queues a copy of `source` into a free slot.
   *
   * @param {GPUCommandEncoder} encoder
   * @param {GPUBuffer} source
   * @returns {{ buffer: GPUBuffer, busy: boolean }|null} the slot to map after submit
   */
  request(encoder, source) {
    const slot = this.slots.find((candidate) => !candidate.busy);
    if (!slot) return null;
    slot.busy = true;
    encoder.copyBufferToBuffer(source, 0, slot.buffer, 0, this.byteLength);
    return slot;
  }

  /**
   * Maps a slot previously handed out by {@link request}. Call after submit.
   *
   * @param {{ buffer: GPUBuffer, busy: boolean }|null} slot
   */
  collect(slot) {
    if (!slot) return;
    slot.buffer.mapAsync(GPUMapMode.READ).then(() => {
      this.latest = new Uint32Array(slot.buffer.getMappedRange().slice(0));
      slot.buffer.unmap();
      slot.busy = false;
    }).catch(() => {
      // The device was lost or the buffer destroyed mid-flight; stop reusing it.
      slot.busy = true;
    });
  }

  destroy() {
    for (const slot of this.slots) slot.buffer.destroy();
  }
}
