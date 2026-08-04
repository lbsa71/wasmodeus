import { CAR_SHADER, WORLD_SHADER } from "./shaders.js";
import { WebGpuUnavailableError } from "./renderer-errors.js";
import {
  SCENE_UNIFORM_BYTES,
  carStorageByteLength,
  createSceneUniform,
  preferredCanvasSize,
  tileStorageByteLength,
} from "./webgpu-data.js";

/**
 * @param {GPUShaderModule} shader
 * @param {string} label
 */
async function assertShaderCompiles(shader, label) {
  const information = await shader.getCompilationInfo();
  const errors = information.messages.filter(
    (message) => message.type === "error",
  );
  if (errors.length > 0) {
    const details = errors
      .map((message) => `${message.lineNum}:${message.linePos} ${message.message}`)
      .join("\n");
    throw new Error(`${label} WGSL failed to compile:\n${details}`);
  }
}

/**
 * @param {GPUDevice} device
 * @param {GPUShaderModule} shader
 * @param {GPUTextureFormat} format
 * @param {string} label
 */
function createPipeline(device, shader, format, label) {
  return device.createRenderPipelineAsync({
    label,
    layout: "auto",
    primitive: { topology: "triangle-list" },
    fragment: {
      entryPoint: "fragmentMain",
      module: shader,
      targets: [{ format }],
    },
    vertex: { entryPoint: "vertexMain", module: shader },
  });
}

export class WebGpuRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import("./camera.js").Camera} camera
   * @param {import("./simulation-client.js").SimulationClient} simulation
   * @param {GPUAdapter} adapter
   * @param {GPUDevice} device
   * @param {GPUCanvasContext} context
   * @param {GPUTextureFormat} format
   * @param {GPURenderPipeline} worldPipeline
   * @param {GPURenderPipeline} carPipeline
   */
  constructor(
    canvas,
    camera,
    simulation,
    adapter,
    device,
    context,
    format,
    worldPipeline,
    carPipeline,
  ) {
    this.canvas = canvas;
    this.camera = camera;
    this.simulation = simulation;
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.format = format;
    this.worldPipeline = worldPipeline;
    this.carPipeline = carPipeline;
    this.backendName = "WebGPU";
    this.drawnCarCount = simulation.carCount;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.roadRevision = simulation.roadRevision;

    this.sceneBuffer = device.createBuffer({
      label: "WASMODEUS scene uniform",
      size: SCENE_UNIFORM_BYTES,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });
    this.carXBuffer = device.createBuffer({
      label: "WASMODEUS car X positions",
      size: carStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.carYBuffer = device.createBuffer({
      label: "WASMODEUS car Y positions",
      size: carStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.carDirectionBuffer = device.createBuffer({
      label: "WASMODEUS packed car directions",
      size: tileStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.carLaneBuffer = device.createBuffer({
      label: "WASMODEUS packed car lanes",
      size: tileStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.carSegmentBuffer = device.createBuffer({
      label: "WASMODEUS car road segments",
      size: carStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.carActiveBuffer = device.createBuffer({
      label: "WASMODEUS packed active cars",
      size: tileStorageByteLength(simulation.carCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    this.roadTileBuffer = device.createBuffer({
      label: "WASMODEUS packed road tile topology",
      size: tileStorageByteLength(simulation.roadTileCount),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE,
    });
    device.queue.writeBuffer(this.roadTileBuffer, 0, simulation.roadTiles);
    this.worldBindGroup = device.createBindGroup({
      label: "WASMODEUS world bindings",
      layout: worldPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sceneBuffer } },
        { binding: 1, resource: { buffer: this.roadTileBuffer } },
      ],
    });
    this.carBindGroup = device.createBindGroup({
      label: "WASMODEUS car bindings",
      layout: carPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.sceneBuffer } },
        { binding: 1, resource: { buffer: this.carXBuffer } },
        { binding: 2, resource: { buffer: this.carYBuffer } },
        { binding: 3, resource: { buffer: this.carDirectionBuffer } },
        { binding: 4, resource: { buffer: this.carLaneBuffer } },
        { binding: 5, resource: { buffer: this.carSegmentBuffer } },
        { binding: 6, resource: { buffer: this.roadTileBuffer } },
        { binding: 7, resource: { buffer: this.carActiveBuffer } },
      ],
    });
  }

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import("./camera.js").Camera} camera
   * @param {import("./simulation-client.js").SimulationClient} simulation
   */
  static async create(canvas, camera, simulation) {
    if (!navigator.gpu) {
      throw new WebGpuUnavailableError(
        "WebGPU is unavailable. Enable WebGPU or use a current browser.",
      );
    }

    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: "high-performance",
    });
    if (!adapter) {
      throw new WebGpuUnavailableError(
        "No compatible WebGPU adapter was found.",
      );
    }

    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new WebGpuUnavailableError(
        "Unable to create a WebGPU canvas context.",
      );
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    const worldShader = device.createShaderModule({
      code: WORLD_SHADER,
      label: "WASMODEUS procedural world shader",
    });
    const carShader = device.createShaderModule({
      code: CAR_SHADER,
      label: "WASMODEUS instanced car shader",
    });
    await Promise.all([
      assertShaderCompiles(worldShader, "World"),
      assertShaderCompiles(carShader, "Car"),
    ]);

    const [worldPipeline, carPipeline] = await Promise.all([
      createPipeline(
        device,
        worldShader,
        format,
        "WASMODEUS procedural world pipeline",
      ),
      createPipeline(
        device,
        carShader,
        format,
        "WASMODEUS instanced car pipeline",
      ),
    ]);

    return new WebGpuRenderer(
      canvas,
      camera,
      simulation,
      adapter,
      device,
      context,
      format,
      worldPipeline,
      carPipeline,
    );
  }

  /** @param {number} width @param {number} height */
  resize(width, height) {
    this.width = width;
    this.height = height;
    const size = preferredCanvasSize(
      width,
      height,
      Math.min(2, window.devicePixelRatio || 1),
      this.adapter.limits.maxTextureDimension2D,
    );
    this.pixelRatio = size.pixelRatio;
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.camera.resize(width, height);
    this.context.configure({
      alphaMode: "opaque",
      device: this.device,
      format: this.format,
    });
  }

  render() {
    const sceneUniform = createSceneUniform({
      centerX: this.camera.centerX,
      centerY: this.camera.centerY,
      pixelRatio: this.pixelRatio,
      roadHalfWidth: 0.23,
      roadTileCount: this.simulation.roadTileCount,
      viewportHeight: this.height,
      viewportWidth: this.width,
      worldSize: this.simulation.gridSize,
      zoom: this.camera.zoom,
    });
    this.device.queue.writeBuffer(this.sceneBuffer, 0, sceneUniform);
    const simulation = this.simulation;
    if (simulation.roadRevision !== this.roadRevision) {
      this.device.queue.writeBuffer(
        this.roadTileBuffer,
        0,
        simulation.roadTiles,
      );
      this.roadRevision = simulation.roadRevision;
    }
    this.device.queue.writeBuffer(this.carXBuffer, 0, simulation.x);
    this.device.queue.writeBuffer(this.carYBuffer, 0, simulation.y);
    this.device.queue.writeBuffer(
      this.carDirectionBuffer,
      0,
      simulation.directions,
    );
    this.device.queue.writeBuffer(this.carLaneBuffer, 0, simulation.lanes);
    this.device.queue.writeBuffer(
      this.carSegmentBuffer,
      0,
      simulation.segments,
    );
    this.device.queue.writeBuffer(
      this.carActiveBuffer,
      0,
      simulation.activeCars,
    );

    const encoder = this.device.createCommandEncoder({
      label: "WASMODEUS frame encoder",
    });
    const pass = encoder.beginRenderPass({
      label: "WASMODEUS frame",
      colorAttachments: [
        {
          clearValue: { r: 0.027, g: 0.067, b: 0.059, a: 1 },
          loadOp: "clear",
          storeOp: "store",
          view: this.context.getCurrentTexture().createView(),
        },
      ],
    });
    pass.setPipeline(this.worldPipeline);
    pass.setBindGroup(0, this.worldBindGroup);
    pass.draw(3);
    pass.setPipeline(this.carPipeline);
    pass.setBindGroup(0, this.carBindGroup);
    pass.draw(6, simulation.carCount);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    this.drawnCarCount = simulation.onRoadCarCount;
  }
}
