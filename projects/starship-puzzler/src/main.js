import { PilotInput } from "./input/pilot-input.js";
import { advanceOrbitCamera, createOrbitCamera } from "./render/orbit-camera.js";
import { WebGpuOrbitRenderer } from "./render/webgpu-renderer.js";
import { WasmOrbitSimulation } from "./simulation/wasm-orbit.js";

const INNER_ROUTE_RADIUS = 140;
const OUTER_ROUTE_RADIUS = 560;
const FIXED_STEP_SECONDS = 1 / 120;

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector("#prototype"));
const status = /** @type {HTMLParagraphElement} */ (document.querySelector("#status"));
const backendLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#backend"));
const routeLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#route"));
const modeLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#mode"));
const speedLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#speed"));
const enemyLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#enemy"));
const objectiveLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#objective"));
const laserLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#laser"));
const crashesLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#crashes"));
const fleetLabel = /** @type {HTMLSpanElement} */ (document.querySelector("#fleet"));

try {
  const simulation = await WasmOrbitSimulation.create(new URL("../orbital-motion.wasm", import.meta.url));
  simulation.initialize(INNER_ROUTE_RADIUS, OUTER_ROUTE_RADIUS);
  simulation.reset(0, 1);
  const input = new PilotInput();
  const renderer = await WebGpuOrbitRenderer.create(canvas);
  let camera = createOrbitCamera();
  backendLabel.textContent = renderer.backend;
  status.textContent = "Prototype 3 · switch ships before the fleet runs out";

  const resize = () => {
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * scale));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * scale));
  };
  resize();
  window.addEventListener("resize", resize);

  const reset = (/** @type {KeyboardEvent} */ event) => {
    if (event.code === "KeyR") simulation.reset();
  };
  window.addEventListener("keydown", reset);

  let lastFrame = performance.now();
  let accumulator = 0;
  const frame = (/** @type {number} */ now) => {
    const elapsedSeconds = Math.min(0.1, Math.max(0, (now - lastFrame) / 1_000));
    accumulator += elapsedSeconds;
    lastFrame = now;
    const axes = input.sample();
    if (axes.switch) simulation.switchShip(axes.switch);
    if (axes.fire) simulation.fireLaser();
    while (accumulator >= FIXED_STEP_SECONDS) {
      simulation.step(axes, FIXED_STEP_SECONDS);
      accumulator -= FIXED_STEP_SECONDS;
    }
    const snapshot = simulation.snapshot();
    const platformHeading = snapshot.angle + Math.PI / 2;
    const renderSnapshot = { ...snapshot, heading: platformHeading };
    camera = advanceOrbitCamera(camera, renderSnapshot);
    renderer.render(renderSnapshot, now / 1_000, camera);
    routeLabel.textContent = snapshot.route < 0 ? "between levels" : `level ${snapshot.route + 1} / 4`;
    modeLabel.textContent = snapshot.activeShip === 0 ? (snapshot.mode === 0 ? "scout · captured" : "scout · free flight") : "laser platform";
    speedLabel.textContent = `${snapshot.speed.toFixed(1)} u/s`;
    enemyLabel.textContent = snapshot.enemyMode === 2 ? "destroyed" : snapshot.enemyMode === 0 ? "scanning" : snapshot.enemyAimLevel > 0 ? "locking on" : snapshot.enemyShotLevel > 0 ? "firing" : "pursuing";
    objectiveLabel.textContent = snapshot.gameOver ? "fleet lost · R to restart" : snapshot.targetDestroyed ? "pursuer destroyed" : "clear the laser lane, then switch to fire";
    laserLabel.textContent = snapshot.activeShip === 1 ? (snapshot.laserCharge > 0 ? "firing" : "selected · A fires") : snapshot.targetDestroyed ? "hit" : "ready";
    fleetLabel.textContent = `${snapshot.scoutAlive ? "Scout" : "Scout lost"} · ${snapshot.laserAlive ? "Laser" : "Laser lost"}`;
    crashesLabel.textContent = String(snapshot.crashes);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  window.addEventListener("beforeunload", () => {
    input.dispose();
    renderer.dispose();
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", reset);
  }, { once: true });
} catch (error) {
  status.textContent = error instanceof Error ? error.message : "Unable to start Prototype 0.";
}
