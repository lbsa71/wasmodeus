/**
 * Pipeline and bind-group-layout construction. Every compute pass shares one
 * explicit layout so a single bind group serves all of them; the composite
 * pass gets its own because it binds the same buffers read-only and without
 * atomics.
 */
import simulationShader from "./shaders/simulation.wgsl";
import compositeShader from "./shaders/composite.wgsl";
import { COMPUTE_PASSES } from "../core/layout.js";

/**
 * @param {GPUDevice} device
 * @returns {{
 *   computeLayout: GPUBindGroupLayout,
 *   compositeLayout: GPUBindGroupLayout,
 *   compute: Record<string, GPUComputePipeline>,
 *   initPool: GPUComputePipeline,
 *   clearImpulse: GPUComputePipeline,
 *   composite: GPURenderPipeline,
 * }}
 * @param {GPUTextureFormat} format
 */
export function createPipelines(device, format) {
  const computeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ],
  });
  const compositeLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
    ],
  });

  const simulation = device.createShaderModule({ code: simulationShader, label: "ground-truth-simulation" });
  const composite = device.createShaderModule({ code: compositeShader, label: "ground-truth-composite" });
  const computePipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [computeLayout] });

  /** @param {string} entryPoint */
  const computePipeline = (entryPoint) => device.createComputePipeline({
    label: `ground-truth-${entryPoint}`,
    layout: computePipelineLayout,
    compute: { module: simulation, entryPoint },
  });

  /** @type {Record<string, GPUComputePipeline>} */
  const compute = {};
  for (const pass of COMPUTE_PASSES) compute[pass] = computePipeline(pass);

  return {
    computeLayout,
    compositeLayout,
    compute,
    initPool: computePipeline("init_pool"),
    clearImpulse: computePipeline("clear_impulse"),
    composite: device.createRenderPipeline({
      label: "ground-truth-composite",
      layout: device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
      vertex: { module: composite, entryPoint: "vertex_main" },
      fragment: { module: composite, entryPoint: "fragment_main", targets: [{ format }] },
      primitive: { topology: "triangle-list" },
    }),
  };
}
