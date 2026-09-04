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
import { FrameRateMeter, debugRows } from "./ui/debug-panel.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector("#world"));
const statusLine = /** @type {HTMLParagraphElement} */ (document.querySelector("#status"));
const debugList = /** @type {HTMLDListElement} */ (document.querySelector("#debug-rows"));
const capacityInput = /** @type {HTMLInputElement} */ (document.querySelector("#capacity"));
const capacityValue = /** @type {HTMLOutputElement} */ (document.querySelector("#capacity-value"));
const restInput = /** @type {HTMLInputElement} */ (document.querySelector("#rest"));
const restValue = /** @type {HTMLOutputElement} */ (document.querySelector("#rest-value"));
const slumpInput = /** @type {HTMLInputElement} */ (document.querySelector("#slump"));
const slumpValue = /** @type {HTMLOutputElement} */ (document.querySelector("#slump-value"));
const bounceInput = /** @type {HTMLInputElement} */ (document.querySelector("#bounce"));
const bounceValue = /** @type {HTMLOutputElement} */ (document.querySelector("#bounce-value"));
const blastInput = /** @type {HTMLInputElement} */ (document.querySelector("#blast"));
const blastValue = /** @type {HTMLOutputElement} */ (document.querySelector("#blast-value"));
const pauseButton = /** @type {HTMLButtonElement} */ (document.querySelector("#pause"));
const resetButton = /** @type {HTMLButtonElement} */ (document.querySelector("#reset"));
const reseedButton = /** @type {HTMLButtonElement} */ (document.querySelector("#reseed"));

const resizeCanvas = () => {
  const ratio = Math.min(window.devicePixelRatio, 2);
  canvas.width = Math.max(1, Math.round(window.innerWidth * ratio));
  canvas.height = Math.max(1, Math.round(window.innerHeight * ratio));
};

/** Client CSS pixels to the canvas drawing buffer, which is what the camera uses. */
const devicePoint = (/** @type {PointerEvent|WheelEvent} */ event) => {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (canvas.width / bounds.width),
    y: (event.clientY - bounds.top) * (canvas.height / bounds.height),
  };
};

/**
 * @param {Worker} worker
 * @param {{ width: number, height: number }} world
 * @param {number} seed
 * @returns {Promise<import("./core/field-format.js").Field>}
 */
function carveWorld(worker, world, seed) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (!event.data.ok) { reject(new Error(event.data.message)); return; }
      statusLine.textContent = `${world.width} x ${world.height} world carved in ${Math.round(event.data.milliseconds)} ms`;
      resolve(new Uint32Array(event.data.buffer));
    };
    worker.onerror = (event) => reject(new Error(event.message));
    worker.postMessage({ width: world.width, height: world.height, seed });
  });
}

try {
  resizeCanvas();
  const engine = await GroundTruthEngine.create(canvas);
  const meter = new FrameRateMeter();
  const worker = new Worker(new URL("./world-worker.js", import.meta.url), { type: "module" });
  engine.onDeviceError = (message) => {
    statusLine.textContent = `GPU error: ${message}`;
    statusLine.classList.add("error");
  };

  capacityInput.min = `${MIN_EXPONENT}`;
  // The top of the slider is whatever this device's largest storage buffer can
  // hold, not a constant: a 2 GB binding is 107 million pixels, a smaller one
  // proportionally fewer.
  capacityInput.max = `${Math.min(MAX_EXPONENT, exponentFromCapacity(engine.maxCapacity))}`;
  capacityInput.step = `${EXPONENT_STEP}`;
  capacityInput.value = `${exponentFromCapacity(engine.settings.capacity)}`;
  capacityValue.textContent = formatCount(engine.settings.capacity);
  restInput.min = `${MIN_REST_THRESHOLD}`;
  restInput.max = `${MAX_REST_THRESHOLD}`;
  restInput.value = `${engine.settings.restThreshold}`;
  restValue.textContent = `${engine.settings.restThreshold}`;
  slumpInput.value = `${engine.settings.slumpChance}`;
  slumpValue.textContent = engine.settings.slumpChance.toFixed(2);
  bounceInput.value = `${engine.settings.restitution}`;
  bounceValue.textContent = engine.settings.restitution.toFixed(2);
  blastInput.value = `${engine.settings.brushRadius}`;
  blastValue.textContent = `${engine.settings.brushRadius} px`;

  // Preview the pool size while dragging, but only rebuild the buffers once the
  // slider is released — a reallocation per pixel of travel measures nothing.
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
  slumpInput.addEventListener("input", () => {
    engine.setSlumpChance(Number(slumpInput.value));
    slumpValue.textContent = engine.settings.slumpChance.toFixed(2);
  });
  bounceInput.addEventListener("input", () => {
    engine.setRestitution(Number(bounceInput.value));
    bounceValue.textContent = engine.settings.restitution.toFixed(2);
  });
  blastInput.addEventListener("input", () => {
    engine.setBrushRadius(Number(blastInput.value));
    blastValue.textContent = `${engine.settings.brushRadius} px`;
  });
  pauseButton.addEventListener("click", () => {
    engine.paused = !engine.paused;
    pauseButton.textContent = engine.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", `${engine.paused}`);
  });
  resetButton.addEventListener("click", () => engine.reset());
  reseedButton.addEventListener("click", async () => {
    reseedButton.disabled = true;
    engine.settings.seed += 1;
    statusLine.textContent = "Carving a new world…";
    try {
      engine.loadWorld(await carveWorld(worker, engine.settings.world, engine.settings.seed));
    } catch (error) {
      statusLine.textContent = error instanceof Error ? error.message : `${error}`;
    }
    reseedButton.disabled = false;
  });

  // Left drag pans; shift-drag or right-drag smudges, dragging material the way
  // the pointer goes; alt-drag detonates. A big world needs the plain drag for
  // navigation, so the tools are the modified gestures.
  let panning = false;
  let brushing = false;
  let last = { x: 0, y: 0 };
  let lastWorld = { x: 0, y: 0 };
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    last = devicePoint(event);
    lastWorld = engine.worldFromScreen(last.x, last.y);
    if (event.button === 2 || event.shiftKey || event.altKey) {
      brushing = true;
      // A blast needs no direction, so it can fire on the press. A smudge has
      // nowhere to carry anything until the pointer has actually moved.
      if (event.altKey) engine.explodeAt(lastWorld.x, lastWorld.y);
    } else {
      panning = true;
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const point = devicePoint(event);
    if (panning) engine.pan(point.x - last.x, point.y - last.y);
    if (brushing) {
      const world = engine.worldFromScreen(point.x, point.y);
      if (event.altKey) {
        engine.explodeAt(world.x, world.y);
      } else {
        engine.smudgeAt(world.x, world.y, world.x - lastWorld.x, world.y - lastWorld.y);
      }
      lastWorld = world;
    }
    last = point;
  });
  const releasePointer = () => { panning = false; brushing = false; };
  canvas.addEventListener("pointerup", releasePointer);
  canvas.addEventListener("pointercancel", releasePointer);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    const point = devicePoint(event);
    engine.zoomAt(Math.exp(-event.deltaY * 0.0015), point.x, point.y);
  }, { passive: false });
  window.addEventListener("resize", () => {
    resizeCanvas();
    engine.resize();
  });

  const renderDebug = (/** @type {number} */ fps) => {
    const rows = debugRows(engine.stats, {
      fps,
      frame: engine.frame,
      restThreshold: engine.settings.restThreshold,
      substeps: engine.settings.substeps,
      camera: engine.camera,
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

  statusLine.textContent = "Carving caves…";
  engine.loadWorld(await carveWorld(worker, engine.settings.world, engine.settings.seed));
} catch (error) {
  statusLine.textContent = error instanceof Error ? error.message : `${error}`;
  statusLine.classList.add("error");
}
