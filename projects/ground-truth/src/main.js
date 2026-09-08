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
import { AGENT_CAPACITY } from "./core/layout.js";
import { FrameRateMeter, debugRows } from "./ui/debug-panel.js";
import { DEFAULT_WORLD_SIZE, WORLD_SIZES } from "./core/settings.js";
import { packPopulation, unpackPopulation } from "./core/population.js";
import {
  LATEST_POPULATION_FILE, decodePopulationFile, encodePopulationFile, populationFileName,
} from "./core/population-file.js";
import { PopulationStore } from "./storage/population-store.js";
import { PopulationFolder, downloadFile } from "./storage/population-folder.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector("#world"));
const store = new PopulationStore();
const folder = new PopulationFolder(store);
const statusLine = /** @type {HTMLParagraphElement} */ (document.querySelector("#status"));
const debugList = /** @type {HTMLDListElement} */ (document.querySelector("#debug-rows"));
const goldValue = /** @type {HTMLSpanElement} */ (document.querySelector("#gold-value"));
const generationValue = /** @type {HTMLSpanElement} */ (document.querySelector("#generation-value"));
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
const worldSizeSelect = /** @type {HTMLSelectElement} */ (document.querySelector("#world-size"));
const lemmingsInput = /** @type {HTMLInputElement} */ (document.querySelector("#lemmings"));
const lemmingsValue = /** @type {HTMLOutputElement} */ (document.querySelector("#lemmings-value"));
const pauseButton = /** @type {HTMLButtonElement} */ (document.querySelector("#pause"));
const resetButton = /** @type {HTMLButtonElement} */ (document.querySelector("#reset"));
const reseedButton = /** @type {HTMLButtonElement} */ (document.querySelector("#reseed"));
const forgetButton = /** @type {HTMLButtonElement} */ (document.querySelector("#forget"));
const folderButton = /** @type {HTMLButtonElement} */ (document.querySelector("#folder"));
const exportButton = /** @type {HTMLButtonElement} */ (document.querySelector("#export"));
const importInput = /** @type {HTMLInputElement} */ (document.querySelector("#import"));

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
 * @returns {Promise<{ field: import("./core/field-format.js").Field, nuggets: { x: number, y: number }[] }>}
 */
function carveWorld(worker, world, seed) {
  return new Promise((resolve, reject) => {
    worker.onmessage = (event) => {
      if (!event.data.ok) { reject(new Error(event.data.message)); return; }
      statusLine.textContent = `${world.width} x ${world.height} world carved in ${Math.round(event.data.milliseconds)} ms`;
      resolve({ field: new Uint32Array(event.data.buffer), nuggets: event.data.nuggets });
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
  lemmingsInput.max = `${AGENT_CAPACITY}`;
  lemmingsInput.value = `${engine.settings.agents.count}`;
  lemmingsValue.textContent = `${engine.settings.agents.count}`;
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
  // Repopulating rewrites the whole agent buffer, so it waits for the release
  // rather than firing on every pixel of slider travel.
  lemmingsInput.addEventListener("input", () => {
    lemmingsValue.textContent = `${lemmingsInput.value}`;
  });
  lemmingsInput.addEventListener("change", () => engine.populate(Number(lemmingsInput.value)));
  pauseButton.addEventListener("click", () => {
    engine.paused = !engine.paused;
    pauseButton.textContent = engine.paused ? "Resume" : "Pause";
    pauseButton.setAttribute("aria-pressed", `${engine.paused}`);
  });
  resetButton.addEventListener("click", () => engine.reset());
  forgetButton.addEventListener("click", () => {
    engine.forgetPopulation();
    store.clear().catch(() => {});
    statusLine.textContent = "Brains forgotten: evolution starts over from generation 0";
  });

  // The population as a file: written to a folder on disk after every
  // generation once one is chosen — point it at `public/populations` and the
  // repository's copy keeps itself current — or exported and imported by hand.
  const currentPopulation = () => {
    if (!engine.population) return null;
    return packPopulation({
      generation: engine.evolution.generation,
      count: engine.settings.agents.count,
      brains: engine.population.brains,
      elites: engine.population.elites,
      best: engine.evolution.best,
      mean: engine.evolution.mean,
    });
  };
  const labelFolder = () => {
    if (!PopulationFolder.supported) {
      folderButton.disabled = true;
      folderButton.title = "This browser cannot write to a folder; use Export instead";
      folderButton.textContent = "Save to folder…";
    } else if (folder.writable) {
      folderButton.textContent = `Saving to ${folder.name}`;
    } else if (folder.name) {
      folderButton.textContent = `Resume saving to ${folder.name}`;
    } else {
      folderButton.textContent = "Save to folder…";
    }
  };
  folderButton.addEventListener("click", async () => {
    try {
      if (folder.writable) {
        await folder.forget();
        statusLine.textContent = "No longer saving to a folder";
      } else if (folder.name) {
        if (!(await folder.resume())) statusLine.textContent = "Permission to write to the folder was not given";
      } else {
        const name = await folder.pick();
        statusLine.textContent = `Every generation will be written to ${name}/${LATEST_POPULATION_FILE}`;
      }
      const population = currentPopulation();
      if (folder.writable && population) await folder.write(LATEST_POPULATION_FILE, encodePopulationFile(population));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        statusLine.textContent = `Folder: ${error instanceof Error ? error.message : error}`;
      }
    }
    labelFolder();
  });
  exportButton.addEventListener("click", () => {
    const population = currentPopulation();
    if (!population) return;
    downloadFile(populationFileName(population.generation), encodePopulationFile(population));
  });
  importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    try {
      const saved = decodePopulationFile(await file.arrayBuffer());
      engine.adoptPopulation(saved);
      await store.save(saved);
      statusLine.textContent = `Imported generation ${saved.generation} (${saved.count} brains) from ${file.name}`;
    } catch (error) {
      statusLine.textContent = `Could not import ${file.name}: ${error instanceof Error ? error.message : error}`;
    }
  });
  reseedButton.addEventListener("click", async () => {
    reseedButton.disabled = true;
    engine.settings.seed += 1;
    statusLine.textContent = "Carving a new world…";
    try {
      const carved = await carveWorld(worker, engine.settings.world, engine.settings.seed);
      engine.loadWorld(carved.field, carved.nuggets);
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
    goldValue.textContent = engine.stats.gold.toLocaleString();
    generationValue.textContent = `gen ${engine.evolution.generation}`
      + ` · frame ${engine.evolution.frame}/${engine.evolution.frames}`
      + ` · best ${Math.round(engine.evolution.best).toLocaleString()}`
      + ` · last gen ${engine.evolution.gold.toLocaleString()} mined,`
      + ` ${engine.evolution.shafted.toLocaleString()} shafted`
      + ` · ${engine.lifetimeFrames.toLocaleString()} frames`;
    const rows = debugRows(engine.stats, {
      fps,
      frame: engine.frame,
      restThreshold: engine.settings.restThreshold,
      substeps: engine.settings.substeps,
      camera: engine.camera,
      evolution: engine.evolution,
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

  // The arena's size is remembered between visits. Small is where a run
  // starts; grow it as the brains get smarter.
  const WORLD_SIZE_KEY = "ground-truth.world-size";
  /** @returns {keyof typeof WORLD_SIZES} */
  const rememberedSize = () => {
    try {
      const saved = localStorage.getItem(WORLD_SIZE_KEY);
      if (saved && saved in WORLD_SIZES) return /** @type {keyof typeof WORLD_SIZES} */ (saved);
    } catch {
      // Storage may be unavailable; the default is fine.
    }
    return DEFAULT_WORLD_SIZE;
  };
  const chosenSize = rememberedSize();
  worldSizeSelect.value = chosenSize;
  if (chosenSize !== DEFAULT_WORLD_SIZE) await engine.resizeWorld(WORLD_SIZES[chosenSize]);
  worldSizeSelect.addEventListener("change", async () => {
    const size = /** @type {keyof typeof WORLD_SIZES} */ (worldSizeSelect.value);
    if (!(size in WORLD_SIZES)) return;
    worldSizeSelect.disabled = true;
    try { localStorage.setItem(WORLD_SIZE_KEY, size); } catch { /* not remembered, still resized */ }
    statusLine.textContent = `Carving a ${WORLD_SIZES[size].width} x ${WORLD_SIZES[size].height} world…`;
    await engine.resizeWorld(WORLD_SIZES[size]);
    try {
      const grown = await carveWorld(worker, engine.settings.world, engine.settings.seed);
      engine.loadWorld(grown.field, grown.nuggets);
      lemmingsInput.value = `${engine.settings.agents.count}`;
      lemmingsValue.textContent = `${engine.settings.agents.count}`;
    } catch (error) {
      statusLine.textContent = error instanceof Error ? error.message : `${error}`;
    }
    worldSizeSelect.disabled = false;
  });

  statusLine.textContent = "Carving caves…";
  const carved = await carveWorld(worker, engine.settings.world, engine.settings.seed);
  engine.loadWorld(carved.field, carved.nuggets);

  // Evolution is slow and a reload is not: every generation is saved as it is
  // bred, and the last one saved is picked up here. A record that cannot be
  // trusted is dropped rather than loaded.
  engine.onGeneration = (population) => {
    const saved = packPopulation(population);
    store.save(saved).catch((error) => {
      statusLine.textContent = `Could not save the population: ${error instanceof Error ? error.message : error}`;
    });
    if (folder.writable) {
      const bytes = encodePopulationFile(saved);
      const writes = [folder.write(LATEST_POPULATION_FILE, bytes)];
      const every = engine.settings.evolution.snapshotEvery;
      if (every > 0 && saved.generation % every === 0) writes.push(folder.write(populationFileName(saved.generation), bytes));
      Promise.all(writes).catch((error) => {
        statusLine.textContent = `Could not write to ${folder.name}: ${error instanceof Error ? error.message : error}`;
        labelFolder();
      });
    }
  };

  // Where to start from: this browser's own progress, or the population
  // shipped with the repository — whichever has come further.
  /** @type {{ saved: import("./core/population.js").SavedPopulation, from: string }[]} */
  const candidates = [];
  try {
    const record = await store.load();
    if (record) candidates.push({ saved: unpackPopulation(record), from: "this browser" });
  } catch (error) {
    statusLine.textContent = `Saved population dropped: ${error instanceof Error ? error.message : error}`;
    store.clear().catch(() => {});
  }
  try {
    const response = await fetch(`./populations/${LATEST_POPULATION_FILE}`, { cache: "no-cache" });
    if (response.ok) candidates.push({ saved: decodePopulationFile(await response.arrayBuffer()), from: `populations/${LATEST_POPULATION_FILE}` });
  } catch {
    // No shipped population, or not one this build understands: start fresh.
  }
  candidates.sort((a, b) => b.saved.generation - a.saved.generation);
  if (candidates.length > 0) {
    const { saved, from } = candidates[0];
    engine.adoptPopulation(saved);
    const age = Math.round((Date.now() - saved.savedAt) / 60_000);
    statusLine.textContent = `Picked up generation ${saved.generation} (${saved.count} brains, saved ${age} min ago) from ${from}`;
  }
  if (PopulationFolder.supported) await folder.restore().catch(() => false);
  labelFolder();
} catch (error) {
  statusLine.textContent = error instanceof Error ? error.message : `${error}`;
  statusLine.classList.add("error");
}
