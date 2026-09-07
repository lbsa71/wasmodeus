/**
 * Carves the world off the main thread.
 *
 * Generating twenty million cells of layered noise takes a couple of seconds.
 * On the main thread that is a frozen tab with no way to say what is happening;
 * here the page stays responsive and the finished field comes back as a
 * transfer, so the eighty-odd megabytes are moved rather than copied.
 */
import { createCaveWorld, goldNuggets, surfaceProfile } from "../core/world-gen.js";

/**
 * The slice of `DedicatedWorkerGlobalScope` used here. This project type-checks
 * against the DOM, where `self` is a `Window` whose `postMessage` cannot take a
 * transfer list, so the global is narrowed explicitly rather than pulling in a
 * conflicting worker lib.
 *
 * @typedef {{
 *   addEventListener: (type: "message", listener: (event: MessageEvent) => void) => void,
 *   postMessage: (message: unknown, transfer?: Transferable[]) => void
 * }} WorkerScope
 */
const scope = /** @type {WorkerScope} */ (/** @type {unknown} */ (self));

scope.addEventListener("message", (event) => {
  const { width, height, seed } = event.data;
  try {
    const started = performance.now();
    const field = createCaveWorld({ width, height, seed });
    // Where the gold is, for the scent the lemmings follow. A pure function of
    // the seed, and cheap, so it is simply computed again here.
    const nuggets = goldNuggets({ width, height, seed }, surfaceProfile({ width, height, seed }));
    scope.postMessage(
      { ok: true, buffer: field.buffer, nuggets, milliseconds: performance.now() - started },
      [field.buffer],
    );
  } catch (error) {
    scope.postMessage({ ok: false, message: error instanceof Error ? error.message : `${error}` });
  }
});
