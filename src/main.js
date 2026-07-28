import { Camera } from "./camera.js";
import { AdaptivePopulationController } from "./adaptive-population.js";
import { createRenderer } from "./renderer-factory.js";
import { SimulationClient } from "./simulation-client.js";

const CAR_COUNT = 100_000;
const FIXED_STEP = 1 / 30;

/** @param {string} id */
function element(id) {
  const node = document.getElementById(id);
  if (!node) {
    throw new Error(`Missing page element: #${id}`);
  }
  return node;
}

const canvasNode = element("world");
if (!(canvasNode instanceof HTMLCanvasElement)) {
  throw new Error("#world must be a canvas element.");
}
const canvas = canvasNode;
const loading = element("loading");
const playButton = element("play-button");
const resetButton = element("reset-button");
const speedSelectNode = element("speed");
if (!(speedSelectNode instanceof HTMLSelectElement)) {
  throw new Error("#speed must be a select element.");
}
const speedSelect = speedSelectNode;
const dynamicCarsNode = element("dynamic-cars");
if (!(dynamicCarsNode instanceof HTMLInputElement)) {
  throw new Error("#dynamic-cars must be a checkbox.");
}
const dynamicCars = dynamicCarsNode;
const desiredDemandNode = element("desired-demand");
if (!(desiredDemandNode instanceof HTMLInputElement)) {
  throw new Error("#desired-demand must be a range input.");
}
const desiredDemand = desiredDemandNode;
const demandValue = element("demand-value");
const activeCarsOutput = element("active-cars");
const fpsOutput = element("fps");
const tickOutput = element("tick");
const zoomOutput = element("zoom");
const backendOutput = element("backend");
const drawnOutput = element("drawn");
const junctionOutput = element("junction-flow");
const downstreamOutput = element("downstream-blocked");
const demandOutput = element("demand-state");
const backendWarning = element("backend-warning");

async function start() {
  const simulation = await SimulationClient.load("./simulation.wasm");
  simulation.initialize(Date.now() >>> 0, CAR_COUNT);
  const populationController = new AdaptivePopulationController({
    capacity: CAR_COUNT,
  });

  const camera = new Camera(window.innerWidth, window.innerHeight, {
    minZoom: 0.25,
    maxZoom: 32,
    worldSize: simulation.gridSize,
  });
  const rendererResult = await createRenderer(canvas, camera, simulation);
  const renderer = rendererResult.renderer;
  backendOutput.textContent = renderer.backendName;
  if (rendererResult.warning) {
    backendWarning.textContent =
      `${rendererResult.warning} Using the compatibility renderer.`;
    backendWarning.hidden = false;
  }

  let playing = true;
  let dragging = false;
  let pointerX = 0;
  let pointerY = 0;
  let accumulator = 0;
  let previousTime = performance.now();
  let smoothedFps = 60;
  let demandState = "stable";
  let demandPressure = 0;

  function resetView() {
    const fitZoom =
      Math.min(window.innerWidth, window.innerHeight) /
      simulation.gridSize *
      0.9;
    camera.zoom = Math.max(camera.minZoom, fitZoom);
    camera.centerOn(simulation.gridSize / 2, simulation.gridSize / 2);
  }

  function resize() {
    renderer.resize(window.innerWidth, window.innerHeight);
  }

  /** @param {number} time */
  function frame(time) {
    const elapsed = Math.min(0.1, (time - previousTime) / 1_000);
    previousTime = time;
    const speedMultiplier = Number(speedSelect.value);

    if (playing) {
      accumulator += elapsed * speedMultiplier;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 6) {
        simulation.step(FIXED_STEP);
        if (dynamicCars.checked) {
          const population = populationController.observe({
            activeCars: simulation.carCount,
            candidates: simulation.junctionCandidates,
            demandCars: Number(desiredDemand.value),
            downstreamBlocked: simulation.downstreamBlocked,
            grants: simulation.junctionGrants,
          });
          if (population.state !== "sampling") {
            demandState = population.state;
          }
          demandPressure = population.pressure;
          if (population.targetCarCount !== simulation.carCount) {
            simulation.setActiveCarCount(population.targetCarCount);
          }
        }
        accumulator -= FIXED_STEP;
        steps += 1;
      }
    }

    renderer.render();
    const instantFps = elapsed > 0 ? 1 / elapsed : 60;
    smoothedFps = smoothedFps * 0.92 + instantFps * 0.08;
    fpsOutput.textContent = `${Math.round(smoothedFps)}`;
    activeCarsOutput.textContent = simulation.carCount.toLocaleString();
    tickOutput.textContent = `${simulation.tick.toLocaleString()}`;
    zoomOutput.textContent = `${camera.zoom.toFixed(2)}×`;
    drawnOutput.textContent = renderer.drawnCarCount.toLocaleString();
    junctionOutput.textContent =
      `${simulation.junctionGrants.toLocaleString()} / ` +
      simulation.junctionCandidates.toLocaleString();
    downstreamOutput.textContent =
      simulation.downstreamBlocked.toLocaleString();
    demandOutput.textContent = dynamicCars.checked
      ? `${demandState} ${Math.round(demandPressure * 100)}%`
      : "Manual";
    requestAnimationFrame(frame);
  }

  playButton.addEventListener("click", () => {
    playing = !playing;
    playButton.textContent = playing ? "Pause" : "Resume";
    playButton.setAttribute("aria-pressed", String(!playing));
  });

  resetButton.addEventListener("click", resetView);
  dynamicCars.addEventListener("change", () => {
    populationController.reset();
    demandState = dynamicCars.checked ? "sampling" : "stable";
    demandPressure = 0;
    const requestedCars = Number(desiredDemand.value);
    if (!dynamicCars.checked && simulation.carCount !== requestedCars) {
      simulation.setActiveCarCount(requestedCars);
    }
  });
  desiredDemand.addEventListener("input", () => {
    const requestedCars = Number(desiredDemand.value);
    demandValue.textContent = `${Math.round(requestedCars / 1_000)}k`;
    populationController.reset();
    demandState = dynamicCars.checked ? "sampling" : "stable";
    demandPressure = 0;
    if (!dynamicCars.checked || simulation.carCount > requestedCars) {
      simulation.setActiveCarCount(requestedCars);
    }
  });
  window.addEventListener("resize", resize);

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointerX = event.clientX;
    pointerY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) {
      return;
    }
    camera.panBy(event.clientX - pointerX, event.clientY - pointerY);
    pointerX = event.clientX;
    pointerY = event.clientY;
  });

  canvas.addEventListener("pointerup", (event) => {
    dragging = false;
    canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("dragging");
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      camera.zoomAt(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX,
        event.clientY,
      );
    },
    { passive: false },
  );

  window.addEventListener("keydown", (event) => {
    if (event.key === " " && event.target === document.body) {
      event.preventDefault();
      playButton.click();
    } else if (event.key === "0") {
      resetView();
    } else if (event.key === "+" || event.key === "=") {
      camera.zoomAt(1.4, window.innerWidth / 2, window.innerHeight / 2);
    } else if (event.key === "-") {
      camera.zoomAt(1 / 1.4, window.innerWidth / 2, window.innerHeight / 2);
    }
  });

  resize();
  resetView();
  loading.remove();
  requestAnimationFrame(frame);
}

start().catch((error) => {
  loading.classList.add("error");
  loading.textContent =
    error instanceof Error ? error.message : "Unable to start WASMODEUS.";
  console.error(error);
});
