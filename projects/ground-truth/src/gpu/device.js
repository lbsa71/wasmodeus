/**
 * WebGPU device acquisition. Kept separate from the pipelines so the engine can
 * be constructed against an already-configured device in a harness.
 */

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{ device: GPUDevice, context: GPUCanvasContext, format: GPUTextureFormat }>}
 */
export async function acquireDevice(canvas) {
  if (!navigator.gpu) throw new Error("WebGPU is required; this browser does not expose navigator.gpu.");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) throw new Error("No compatible WebGPU adapter was found.");
  // A full pool at the top of the slider needs a 64 MB particle buffer, which
  // is over the 128 MB default only on constrained adapters — ask for the max
  // the adapter will give rather than guessing.
  const device = await adapter.requestDevice({
    requiredLimits: {
      maxBufferSize: adapter.limits.maxBufferSize,
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
    },
  });
  const context = /** @type {GPUCanvasContext|null} */ (canvas.getContext("webgpu"));
  if (!context) throw new Error("Unable to create a WebGPU canvas context.");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: "opaque" });
  return { device, context, format };
}

/** @param {GPUDevice} device @returns {number} largest storage buffer this device accepts */
export function maxStorageBytes(device) {
  return device.limits.maxStorageBufferBindingSize;
}
