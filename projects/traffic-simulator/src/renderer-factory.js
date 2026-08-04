import { CanvasFallbackRenderer } from "./canvas-fallback-renderer.js";
import { WebGpuRenderer } from "./renderer.js";
import { WebGpuUnavailableError } from "./renderer-errors.js";

export { WebGpuUnavailableError } from "./renderer-errors.js";

/**
 * @typedef {{
 *   backendName: string,
 *   drawnCarCount: number,
 *   render: () => void,
 *   resize: (width: number, height: number) => void,
 * }} RenderBackend
 */

/**
 * @template Renderer
 * @param {() => Promise<Renderer>} createPrimary
 * @param {() => Renderer} createFallback
 * @returns {Promise<{ renderer: Renderer, warning: string | null }>}
 */
export async function createRendererWithFallback(
  createPrimary,
  createFallback,
) {
  try {
    return { renderer: await createPrimary(), warning: null };
  } catch (error) {
    if (!(error instanceof WebGpuUnavailableError)) {
      throw error;
    }
    return { renderer: createFallback(), warning: error.message };
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {import("./camera.js").Camera} camera
 * @param {import("./simulation-client.js").SimulationClient} simulation
 * @returns {Promise<{ renderer: RenderBackend, warning: string | null }>}
 */
export function createRenderer(canvas, camera, simulation) {
  /** @returns {Promise<RenderBackend>} */
  const createPrimary = () => WebGpuRenderer.create(canvas, camera, simulation);
  /** @returns {RenderBackend} */
  const createFallback = () =>
    new CanvasFallbackRenderer(canvas, camera, simulation);

  return createRendererWithFallback(
    createPrimary,
    createFallback,
  );
}
