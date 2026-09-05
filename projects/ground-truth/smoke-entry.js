import { GroundTruthEngine } from "./src/engine.js";
import { WATER_BOND, cellBond, isOccupied, packCell } from "./src/core/field-format.js";

const say = (t) => fetch("/result", { method: "POST", body: t });
const canvas = document.querySelector("#world");
canvas.width = 900; canvas.height = 506;
const wait = () => new Promise((r) => requestAnimationFrame(r));
const run = async (e, n) => { for (let i = 0; i < n; i += 1) { e.step(); await wait(); } };
const capture = async (name) =>
  fetch(`/shot/${name}`, { method: "POST", body: await new Promise((r) => canvas.toBlob(r, "image/png")) });
const lines = [];

try {
  const engine = await GroundTruthEngine.create(canvas);
  engine.onDeviceError = (m) => lines.push(`GPU ERROR: ${m.slice(0, 300)}`);
  const { width, height } = engine.settings.world;

  const BEDROCK = packCell(70, 70, 76, 0);
  const WATER = packCell(58, 132, 208, WATER_BOND);
  const SAND = packCell(206, 184, 126, 3);

  const world = new Uint32Array(new ArrayBuffer(width * height * 4));
  const at = (x, y) => y * width + x;

  // A tank: bedrock walls and floor, water inside, and something on top of it.
  const FLOOR = 100; const W = 90; const DEEP = 70; const WALL = 3;
  /** @param {number} x0 @param {(x0: number, surface: number) => void} load */
  const tank = (x0, load) => {
    for (let y = FLOOR - WALL; y < FLOOR + DEEP + 40; y += 1) {
      for (let t = 1; t <= WALL; t += 1) { world[at(x0 - t, y)] = BEDROCK; world[at(x0 + W - 1 + t, y)] = BEDROCK; }
    }
    for (let t = 1; t <= WALL; t += 1) {
      for (let x = x0 - WALL; x < x0 + W + WALL; x += 1) world[at(x, FLOOR - t)] = BEDROCK;
    }
    for (let y = FLOOR; y < FLOOR + DEEP; y += 1) for (let x = x0; x < x0 + W; x += 1) world[at(x, y)] = WATER;
    load(x0, FLOOR + DEEP);
  };

  // Left tank: a solid slab dropped on the surface in one piece.
  const SLAB = 600;
  tank(SLAB, (x0, surface) => {
    for (let y = surface; y < surface + 8; y += 1) for (let x = x0; x < x0 + W; x += 1) world[at(x, y)] = SAND;
  });
  // Right tank: a loose scatter, which is how debris actually arrives.
  const SCATTER = 900;
  tank(SCATTER, (x0, surface) => {
    for (let y = surface; y < surface + 24; y += 1) {
      for (let x = x0; x < x0 + W; x += 1) {
        if (((x * 7 + y * 13) % 10) < 3) world[at(x, y)] = SAND;
      }
    }
  });

  engine.reset(2_000_000);
  engine.loadWorld(world);

  const bytes = width * height * 4;
  const stage = engine.device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const readField = async () => {
    const enc = engine.device.createCommandEncoder();
    enc.copyBufferToBuffer(engine.resources.field, 0, stage, 0, bytes);
    engine.device.queue.submit([enc.finish()]);
    await stage.mapAsync(GPUMapMode.READ);
    const copy = new Uint32Array(stage.getMappedRange().slice(0));
    stage.unmap();
    return copy;
  };

  /** Sand and water in one tank: how many, and how high they sit. */
  const census = (field, x0) => {
    let sand = 0; let sandY = 0; let water = 0; let waterY = 0; let inverted = 0;
    for (let y = FLOOR; y < FLOOR + DEEP + 40; y += 1) {
      for (let x = x0; x < x0 + W; x += 1) {
        const word = field[at(x, y)];
        if (!isOccupied(word)) continue;
        if (cellBond(word) === WATER_BOND) { water += 1; waterY += y; continue; }
        if (cellBond(word) === 0) continue;
        sand += 1; sandY += y;
        if (y > FLOOR && cellBond(field[at(x, y - 1)]) === WATER_BOND
            && isOccupied(field[at(x, y - 1)])) inverted += 1;
      }
    }
    return {
      sand, water, inverted,
      sandHeight: sand ? sandY / sand : 0,
      waterHeight: water ? waterY / water : 0,
    };
  };

  const report = (label, field) => {
    for (const [name, x0] of [["slab", SLAB], ["scatter", SCATTER]]) {
      const c = census(field, x0);
      lines.push(`${label} ${name}: sand=${c.sand} at y=${c.sandHeight.toFixed(1)}`
        + ` water=${c.water} at y=${c.waterHeight.toFixed(1)} sand-on-water=${c.inverted}`);
    }
    return [census(field, SLAB), census(field, SCATTER)];
  };

  const before = report("start ", world);
  await run(engine, 600);
  const settled = await readField();
  const after = report("f600  ", settled);
  lines.push(`sank/f=${engine.stats.sank} moving=${engine.stats.moving}`);

  // Look at the tanks.
  const view = engine.worldFromScreen(canvas.width / 2, canvas.height / 2);
  engine.pan((view.x - (SLAB + W + 100)) * engine.camera.scale, -(view.y - (FLOOR + DEEP / 2)) * engine.camera.scale);
  engine.zoomAt(2.2, canvas.width / 2, canvas.height / 2);
  await run(engine, 3);
  await capture("sink-tanks");

  before.forEach((start, i) => {
    const name = ["slab", "scatter"][i];
    const end = after[i];
    if (end.sand !== start.sand) lines.push(`PROBLEM: ${name} sand ${start.sand} -> ${end.sand}, not conserved`);
    if (end.water !== start.water) lines.push(`PROBLEM: ${name} water ${start.water} -> ${end.water}, not conserved`);
    if (end.sandHeight >= end.waterHeight) {
      lines.push(`PROBLEM: ${name} sand sits at ${end.sandHeight.toFixed(1)},`
        + ` water at ${end.waterHeight.toFixed(1)}: it has not sunk`);
    }
  });

  const bad = lines.some((x) => x.includes("PROBLEM") || x.startsWith("GPU"));
  say(`DONE ${bad ? "PROBLEMS" : "OK"}\n${lines.join("\n")}`);
} catch (error) {
  say(`DONE FATAL ${error && error.stack}\n${lines.join("\n")}`);
}
