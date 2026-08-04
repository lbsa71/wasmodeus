import starShader from "./shaders/stars.wgsl";
import { CAMERA_REBASE_X_FLOAT_INDEX, CAMERA_UNIFORM_BYTES } from "./render-layout.js";
import { cameraDeltaParsecs, worldPositionFromSnapshot } from "./render-frame.js";

export class WebGpuGalaxyRenderer {
  /** @param {HTMLCanvasElement} canvas @param {GPUDevice} device @param {GPUCanvasContext} context @param {GPUTextureFormat} format */
  constructor(canvas, device, context, format) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.format = format;
    this.starBuffer = null;
    this.starCapacity = 0;
    this.starCount = 0;
    this.starPositions = new Float32Array();
    this.snapshotOriginParsecs = [0, 0, 0];
    /** @type {(import("../core/body-ref.js").BodyRef|null)[]} */ this.pickTable = [];
    this.cameraBuffer = device.createBuffer({ size: CAMERA_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: starShader }), entryPoint: "vertex_main" },
      fragment: {
        module: device.createShaderModule({ code: starShader }),
        entryPoint: "fragment_main",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.bindGroup = null;
    device.lost.then(() => { this.starBuffer = null; this.bindGroup = null; });
  }

  /** @param {HTMLCanvasElement} canvas */
  static async create(canvas) {
    if (!navigator.gpu) throw new Error("WebGPU is required for the galaxy renderer.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
    const device = await adapter.requestDevice();
    const context = /** @type {GPUCanvasContext|null} */ (canvas.getContext("webgpu"));
    if (!context) throw new Error("Unable to create a WebGPU canvas context.");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    return new WebGpuGalaxyRenderer(canvas, device, context, format);
  }

  /** @param {{ starBuffer: ArrayBuffer, starCount: number, pickTable: (import("../core/body-ref.js").BodyRef|null)[], renderOriginParsecs?: number[] }} snapshot */
  update(snapshot) {
    if (snapshot.starCount > this.starCapacity) this.#allocateStars(snapshot.starCount);
    if (this.starBuffer && snapshot.starCount > 0) this.device.queue.writeBuffer(this.starBuffer, 0, snapshot.starBuffer, 0, snapshot.starCount * 32);
    this.starCount = snapshot.starCount;
    this.pickTable = snapshot.pickTable;
    this.starPositions = new Float32Array(snapshot.starBuffer);
    this.snapshotOriginParsecs = snapshot.renderOriginParsecs ?? [0, 0, 0];
  }

  /** @param {{ viewProjection?: Float32Array, pointSize?: number, positionParsecs?: number[] }} camera */
  render(camera = {}) {
    const matrix = camera.viewProjection ?? defaultViewProjection();
    const cameraData = new Float32Array(CAMERA_UNIFORM_BYTES / Float32Array.BYTES_PER_ELEMENT);
    cameraData.set(matrix, 0);
    cameraData[16] = camera.pointSize ?? 0.0015;
    const rebase = cameraDeltaParsecs(this.snapshotOriginParsecs, camera.positionParsecs ?? [0, 0, 0]);
    cameraData[CAMERA_REBASE_X_FLOAT_INDEX] = rebase[0];
    cameraData[CAMERA_REBASE_X_FLOAT_INDEX + 1] = rebase[1];
    this.device.queue.writeBuffer(this.cameraBuffer, 0, cameraData);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.context.getCurrentTexture().createView(), clearValue: { r: 0.001, g: 0.002, b: 0.008, a: 1 }, loadOp: "clear", storeOp: "store" }] });
    if (this.bindGroup && this.starCount > 0) {
      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroup);
      pass.draw(6, this.starCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  /** @param {number} x @param {number} y @param {{ positionParsecs: number[], zoomParsecs?: number, aspect?: number }} camera */
  async pick(x, y, camera) {
    const bounds = this.canvas.getBoundingClientRect();
    const zoom = camera.zoomParsecs ?? 16_000;
    const aspect = camera.aspect ?? (bounds.width / bounds.height);
    const cameraDelta = cameraDeltaParsecs(this.snapshotOriginParsecs, camera.positionParsecs);
    const targetX = ((((x - bounds.left) / bounds.width) * 2 - 1) * zoom * aspect) + cameraDelta[0];
    const targetY = ((1 - (((y - bounds.top) / bounds.height) * 2)) * zoom) + cameraDelta[1];
    let closestIndex = -1;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.starCount; index += 1) {
      if (!this.pickTable[index]) continue;
      const offset = index * 8;
      const dx = this.starPositions[offset] - targetX;
      const dy = this.starPositions[offset + 1] - targetY;
      const distance = (dx * dx) + (dy * dy);
      if (distance < closestDistance) { closestIndex = index; closestDistance = distance; }
    }
    const hitRadius = Math.max(zoom * 0.025, 0.00000025);
    const body = this.pickTable[closestIndex];
    if (closestIndex < 0 || closestDistance > hitRadius * hitRadius || !body) return null;
    const offset = closestIndex * 8;
    return { body, positionParsecs: worldPositionFromSnapshot([this.starPositions[offset], this.starPositions[offset + 1], this.starPositions[offset + 2]], this.snapshotOriginParsecs) };
  }

  /** @param {number} count */
  #allocateStars(count) {
    this.starBuffer?.destroy();
    this.starCapacity = Math.max(1, 2 ** Math.ceil(Math.log2(count)));
    this.starBuffer = this.device.createBuffer({ size: this.starCapacity * 32, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.bindGroup = this.device.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.starBuffer } }, { binding: 1, resource: { buffer: this.cameraBuffer } }] });
  }
}

function defaultViewProjection() {
  return new Float32Array([
    1 / 20_000, 0, 0, 0,
    0, 1 / 20_000, 0, 0,
    0, 0, 1 / 128_000, 0,
    0, 0, 0, 1,
  ]);
}
