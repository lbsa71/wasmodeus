export class WebGpuUnavailableError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = "WebGpuUnavailableError";
  }
}
