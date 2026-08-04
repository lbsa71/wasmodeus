import { GalaxyEngine } from "./galaxy-engine.js";
import { createGalaxyCamera, panCamera, resizeCamera, zoomCameraAt } from "./render/camera.js";
import { formatTimeScale, sliderFromTimeScale, timeScaleFromSlider } from "./core/time-scale.js";
import { bodyKind } from "./core/identity.js";
import { formatBodyRef } from "./core/body-ref.js";

const canvas = /** @type {HTMLCanvasElement} */ (document.querySelector("#galaxy"));
const status = /** @type {HTMLParagraphElement} */ (document.querySelector("#status"));
const debugX = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-x"));
const debugY = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-y"));
const debugZoom = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-zoom"));
const debugLayer = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-layer"));
const debugGalaxy = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-galaxy"));
const debugFocus = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-focus"));
const debugBody = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-body"));
const debugFps = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-fps"));
const debugTime = /** @type {HTMLSpanElement} */ (document.querySelector("#debug-time"));
const timeScaleInput = /** @type {HTMLInputElement} */ (document.querySelector("#time-scale"));
const timeScaleValue = /** @type {HTMLOutputElement} */ (document.querySelector("#time-scale-value"));

try {
  const resize = () => {
    canvas.width = Math.round(window.innerWidth * window.devicePixelRatio);
    canvas.height = Math.round(window.innerHeight * window.devicePixelRatio);
  };
  resize();
  const engine = await GalaxyEngine.create(canvas);
  let camera = createGalaxyCamera(canvas.width / canvas.height);
  let dragging = false;
  let pointer = [0, 0];
  let lastFrame = performance.now();
  let frameSamples = 0;
  let accumulatedFrameSeconds = 0;
  let timeScale = 1;
  const updateCamera = () => engine.setCamera(camera);
  engine.onSystemView = (view) => {
    camera = zoomCameraAt({ ...camera, positionParsecs: view.positionParsecs, zoomParsecs: view.zoomParsecs, aspect: view.aspect ?? camera.aspect }, 0, 0, 0);
    updateCamera();
  };
  const updateDebug = () => {
    debugX.textContent = camera.positionParsecs[0].toFixed(0);
    debugY.textContent = camera.positionParsecs[1].toFixed(0);
    debugZoom.textContent = camera.zoomParsecs.toFixed(0);
    debugLayer.textContent = engine.layer;
    debugGalaxy.textContent = engine.galaxyId;
    debugFocus.textContent = engine.focusedBody ? formatBodyRef(engine.focusedBody) : "—";
    debugBody.textContent = engine.focusedBody ? bodyKind(engine.focusedBody.bodyPath) : "—";
    debugTime.textContent = formatTimeScale(timeScale);
    timeScaleValue.textContent = formatTimeScale(timeScale);
    debugFps.textContent = frameSamples ? (frameSamples / accumulatedFrameSeconds).toFixed(1) : "0";
  };
  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    pointer = [event.clientX, event.clientY];
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  const moveCamera = (/** @type {PointerEvent} */ event) => {
    if (!dragging) return;
    const worldPerPixel = (2 * camera.zoomParsecs) / canvas.clientHeight;
    camera = panCamera(camera, (event.clientX - pointer[0]) * worldPerPixel, (pointer[1] - event.clientY) * worldPerPixel);
    pointer = [event.clientX, event.clientY];
    updateCamera();
  };
  // Listen on window as well as holding pointer capture: browsers can stop
  // delivering canvas-local moves once a fast drag leaves the drawing area.
  window.addEventListener("pointermove", moveCamera);
  const stopDragging = () => { dragging = false; };
  canvas.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("pointercancel", stopDragging);
  window.addEventListener("pointerup", stopDragging);
  canvas.addEventListener("dblclick", async (event) => {
    const picked = await engine.pick(event.clientX, event.clientY);
    if (!picked) return;
    camera = zoomCameraAt({ ...camera, positionParsecs: picked.positionParsecs, zoomParsecs: 0.0005 }, 0, 0, 0);
    engine.focus(picked.body, camera);
  });
  const zoomAtPointer = (/** @type {WheelEvent} */ event) => {
    const bounds = canvas.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
    event.preventDefault();
    const normalizedX = (((event.clientX - bounds.left) / bounds.width) * 2) - 1;
    const normalizedY = 1 - (((event.clientY - bounds.top) / bounds.height) * 2);
    camera = zoomCameraAt(camera, event.deltaY, normalizedX, normalizedY);
    updateCamera();
  };
  window.addEventListener("wheel", zoomAtPointer, { passive: false });
  timeScaleInput.value = String(sliderFromTimeScale(timeScale));
  timeScaleInput.addEventListener("input", () => { timeScale = timeScaleFromSlider(Number(timeScaleInput.value)); updateDebug(); });
  window.addEventListener("resize", () => { resize(); camera = resizeCamera(camera, canvas.width / canvas.height); updateCamera(); });
  updateCamera();
  status.textContent = "100,000,000,000 deterministic stars · drag to pan · wheel to zoom";
  const frame = (/** @type {number} */ now) => {
    const elapsedSeconds = (now - lastFrame) / 1_000;
    accumulatedFrameSeconds += elapsedSeconds;
    lastFrame = now;
    frameSamples += 1;
    if (accumulatedFrameSeconds >= 0.25) { updateDebug(); frameSamples = 0; accumulatedFrameSeconds = 0; }
    engine.advance(elapsedSeconds, timeScale);
    engine.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", () => engine.dispose(), { once: true });
} catch (error) {
  status.textContent = error instanceof Error ? error.message : "Unable to start the galaxy engine.";
}
