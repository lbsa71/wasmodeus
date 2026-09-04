import { GroundTruthEngine } from "./engine.js";
import {
  EXPONENT_STEP,
  MAX_EXPONENT,
  MIN_EXPONENT,
  capacityFromExponent,
  exponentFromCapacity,
  formatCount,
} from "./core/capacity.js";
import { MAX_REST_THRESHOLD, MIN_REST_THRESHOLD } from "./core/rest.js";
import { fieldFromImageData } from "./core/source-image.js";
import { FrameRateMeter, debugRows } from "./ui/debug-panel.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector("#world"));
const statusLine = /** @type {HTMLParagraphElement} */ (document.querySelector("#status"));
const debugList = /** @type {HTMLDListElement} */ (document.querySelector("#debug-rows"));
const capacityInput = /** @type {HTMLInputElement} */ (document.querySelector("#capacity"));
const capacityValue = /** @type {HTMLOutputElement} */ (document.querySelector("#capacity-value"));
const restInput = /** @type {HTMLInputElement} */ (document.querySelector("#rest"));
const restValue = /** @type {HTMLOutputElement} */ (document.querySelector("#rest-value"));
const fountainInput = /** @type {HTMLInputElement} */ (document.querySelector("#fountain"));
const fountainValue = /** @type {HTMLOutputElement} */ (document.querySelector("#fountain-value"));
const pauseButton = /** @type {HTMLButtonElement} */ (document.querySelector("#pause"));
const resetButton = /** @type {HTMLButtonElement} */ (document.querySelector("#reset"));
const imageInput = /** @type {HTMLInputElement} */ (document.querySelector("#image"));

const resizeCanvas = () => {
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
};

/**
 * Rasterises a dropped image into the world, scaled to fit and stood on the
 * ground so nothing starts out unsupported.
 *
 * @param {GroundTruthEngine} engine
 * @param {File} file
 */
async function loadImageFile(engine, file) {
  const { width, height } = engine.settings.world;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min((width * 0.9) / bitmap.width, (height * 0.75) / bitmap.height);
  const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
  const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
  const scratch = new OffscreenCanvas(drawWidth, drawHeight);
  const context = scratch.getContext("2d");
  if (!context) throw new Error("Unable to rasterise the image.");
  context.drawImage(bitmap, 0, 0, drawWidth, drawHeight);
  bitmap.close();
  const pixels = context.getImageData(0, 0, drawWidth, drawHeight);
  engine.loadField(fieldFromImageData(pixels, {
    width,
    height,
    offsetX: Math.round((width - drawWidth) / 2),
    offsetY: 0,
  }));
}

try {
  resizeCanvas();
  const engine = await GroundTruthEngine.create(canvas);
  const meter = new FrameRateMeter();
  statusLine.textContent = `${engine.settings.world.width} × ${engine.settings.world.height} world`;

  capacityInput.min = `${MIN_EXPONENT}`;
  capacityInput.max = `${MAX_EXPONENT}`;
  capacityInput.step = `${EXPONENT_STEP}`;
  capacityInput.value = `${exponentFromCapacity(engine.settings.capacity)}`;
  capacityValue.textContent = formatCount(engine.settings.capacity);

  restInput.min = `${MIN_REST_THRESHOLD}`;
  restInput.max = `${MAX_REST_THRESHOLD}`;
  restInput.value = `${engine.settings.restThreshold}`;
  restValue.textContent = `${engine.settings.restThreshold}`;
  fountainValue.textContent = `${Number(fountainInput.value).toFixed(2)}×`;

  // Preview the pool size while dragging, but only rebuild the buffers once
  // the slider is released — a 64 MB reallocation per pixel of travel is not
  // a useful measurement of anything.
  capacityInput.addEventListener("input", () => {
    capacityValue.textContent = formatCount(capacityFromExponent(Number(capacityInput.value)));
  });
  capacityInput.addEventListener("change", () => {
    engine.reset(capacityFromExponent(Number(capacityInput.value)));
  });
  restInput.addEventListener("input", () => {
    engine.setRestThreshold(Number(restInput.value));
    restValue.textContent = `${engine.settings.restThreshold}`;
  });
  fountainInput.addEventListener("input", () => {
    engine.setFountainScale(Number(fountainInput.value));
    fountainValue.textContent = `${Number(fountainInput.value).toFixed(2)}×`;
  });
  pauseButton.addEventListener("click", () => {
    engine.paused = !engine.paused;
    pauseButton.textContent = engine.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", `${engine.paused}`);
  });
  resetButton.addEventListener("click", () => engine.reset());
  imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    try {
      await loadImageFile(engine, file);
      statusLine.textContent = `${file.name} loaded`;
    } catch (error) {
      statusLine.textContent = `Could not load that image: ${error instanceof Error ? error.message : error}`;
    }
  });

  let pointerDown = false;
  const perturbAt = (/** @type {PointerEvent} */ event) => {
    const point = engine.worldFromClient(event.clientX, event.clientY);
    if (point) engine.perturb(point.x, point.y);
  };
  canvas.addEventListener("pointerdown", (event) => {
    pointerDown = true;
    canvas.setPointerCapture(event.pointerId);
    perturbAt(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (pointerDown) perturbAt(event);
  });
  const releasePointer = () => { pointerDown = false; };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  window.addEventListener("resize", resizeCanvas);

  const renderDebug = (/** @type {number} */ fps) => {
    const rows = debugRows(engine.stats, {
      fps,
      frame: engine.frame,
      restThreshold: engine.settings.restThreshold,
      substeps: engine.settings.substeps,
    });
    debugList.replaceChildren(...rows.flatMap((row) => {
      const term = document.createElement("dt");
      term.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.value;
      if (row.warn) value.classList.add("warn");
      return [term, value];
    }));
  };

  const loop = (/** @type {number} */ timestamp) => {
    engine.step();
    renderDebug(meter.sample(timestamp));
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} catch (error) {
  statusLine.textContent = error instanceof Error ? error.message : `${error}`;
  statusLine.classList.add("error");
}
