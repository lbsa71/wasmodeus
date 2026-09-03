import sceneShader from "./shaders/prototype-zero.wgsl";
import { createSceneUniforms, SCENE_UNIFORM_FLOATS } from "./scene-data.js";

export class WebGpuOrbitRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {GPUDevice} device
   * @param {GPUCanvasContext} context
   * @param {GPUTextureFormat} format
   */
  constructor(canvas, device, context, format) {
    this.canvas = canvas;
    this.device = device;
    this.context = context;
    this.backend = "WebGPU";
    this.uniformBuffer = device.createBuffer({
      size: SCENE_UNIFORM_FLOATS * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.pipeline = device.createRenderPipeline({
      layout: "auto",
      vertex: { module: device.createShaderModule({ code: sceneShader }), entryPoint: "vertexMain" },
      fragment: { module: device.createShaderModule({ code: sceneShader }), entryPoint: "fragmentMain", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    });
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
  }

  /** @param {HTMLCanvasElement} canvas */
  static async create(canvas) {
    if (!navigator.gpu) throw new Error("WebGPU is unavailable.");
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
    const device = await adapter.requestDevice();
    const context = /** @type {GPUCanvasContext|null} */ (canvas.getContext("webgpu"));
    if (!context) throw new Error("Unable to create a WebGPU canvas context.");
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    return new WebGpuOrbitRenderer(canvas, device, context, format);
  }

  /** @param {{x: number, y: number, angle: number, heading?: number, radius: number, route: number, mode: number, activeShip?: number, enemyX?: number, enemyY?: number, enemyMode?: number, enemyDetectionRadius?: number, goalX?: number, goalY?: number, goalReached?: boolean, laserOriginX?: number, laserOriginY?: number, laserTargetX?: number, laserTargetY?: number, asteroidX?: number, asteroidY?: number, laserCharge?: number, enemyAimStartX?: number, enemyAimStartY?: number, enemyAimTargetX?: number, enemyAimTargetY?: number, enemyPelletX?: number, enemyPelletY?: number, enemyPelletActive?: boolean, targetDestroyed?: boolean}} snapshot @param {number} timeSeconds @param {{x: number, y: number, rotation?: number, viewRadius?: number}} camera */
  render(snapshot, timeSeconds, camera) {
    const uniformData = createSceneUniforms(snapshot, this.canvas.width, this.canvas.height, timeSeconds, camera);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0.002, g: 0.004, b: 0.012, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(3);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  dispose() { this.uniformBuffer.destroy(); }
}
