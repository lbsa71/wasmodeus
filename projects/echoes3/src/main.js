import { GameController } from "./controller.js";
import { LocalDatabase } from "./storage/client.js";
import { currentGame, discoveryScore, matchScore } from "./core/game.js";
import { isLegal, legalMoves, pieceCount } from "./core/rules.js";
import { WasmRules } from "./core/wasm-rules.js";
import { drawTree } from "./ui/tree.js";
import { animateTurn } from "./ui/animation.js";
import { phaseText } from "./ui/view-model.js";
import { RoundLoop, completedMatchId } from "./ui/round-loop.js";
/** @typedef {import('./core/types.js').Game} Game */
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Source} Source */
/** @typedef {import('./core/types.js').Move} Move */

/** @param {string} id @returns {HTMLElement} */
function element(id) { const node = document.getElementById(id); if (!node) throw new Error(`Missing interface element ${id}`); return node; }
/** @param {string} id @param {string} value */
function text(id, value) { element(id).textContent = value; }
/** @param {string} id @param {boolean} value */
function disabled(id, value) { /** @type {HTMLButtonElement} */ (element(id)).disabled = value; }
/** @param {Game['status']} status */
function resultLabel(status) { return status === "human" ? "you won" : status === "ghost" ? "ghost won" : status === "abandoned" ? "unfinished" : "playing"; }
/** @param {Source} source @param {Database} db */
function sourceLabel(source, db) { return `Your decision from match ${db.games.findIndex(game => game.id === source.gameId) + 1}, turn ${source.turnIndex + 1}. The entire tree matches.`; }
const gamePicker = /** @type {HTMLSelectElement} */ (element("game-picker"));
const turnPicker = /** @type {HTMLSelectElement} */ (element("turn-picker"));
const seedPicker = /** @type {HTMLSelectElement} */ (element("seed-picker"));
const historyPanel = /** @type {HTMLDetailsElement} */ (element("history-panel"));
/** @type {string | null} */ let viewingId = null;
/** @type {number | null} */ let viewingStep = null;
let failed = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const controller = new GameController(new LocalDatabase(), render,
  presentation => animateTurn(element("tree"), presentation, reducedMotion.matches));
const loop = new RoundLoop(() => { void perform(() => controller.nextGame()); });

/** @param {() => Promise<unknown>} operation */
async function perform(operation) {
  failed = false; element("error").hidden = true;
  try { await operation(); }
  catch (error) {
    failed = true; loop.update(null);
    text("error", `${error instanceof Error ? error.message : String(error)} Use Reload saved game in the memory archive to recover.`);
    element("error").hidden = false;
  }
}

/** @param {Move} move */
function onTip(move) {
  if (!controller.database || controller.busy || viewingId) return;
  const game = currentGame(controller.database);
  if (game.status !== "playing" || game.turn !== 1 || !isLegal(game.position, move)) return;
  void perform(() => controller.play(move));
}

function render() {
  const db = controller.database;
  for (const id of ["new-game", "grow-seed"]) disabled(id, controller.busy || !db);
  disabled("export", !db); disabled("reload", controller.busy);
  seedPicker.disabled = controller.busy || !db; gamePicker.disabled = controller.busy || !db; turnPicker.disabled = controller.busy || !db;
  if (!db || !db.activeGameId) return;
  const active = currentGame(db);
  const shown = db.games.find(game => game.id === viewingId) ?? active;
  const presentation = viewingId ? null : controller.presentation;
  const step = viewingId ? Math.min(viewingStep ?? shown.turns.length, shown.turns.length) : shown.turns.length;
  const last = step ? shown.turns[step - 1] : null;
  const position = presentation?.turn.before ?? last?.after ?? shown.initialPosition;
  const interactive = !viewingId && !controller.busy && active.status === "playing" && active.turn === 1;
  const complete = active.status === "human" || active.status === "ghost";
  loop.update(completedMatchId(active, { reviewing: Boolean(viewingId), archiveOpen: historyPanel.open, busy: controller.busy, hidden: document.hidden, failed }));
  text("round-count", `${viewingId ? "Reviewing " : ""}Match ${db.games.indexOf(shown) + 1}`);
  const pieces = pieceCount(position), tips = legalMoves(position).length;
  text("tree-count", `${pieces} ${pieces === 1 ? "branch" : "branches"} · ${tips} ${tips === 1 ? "tip" : "tips"}`);
  drawTree(element("tree"), position, { enabled: interactive, actor: presentation?.actor ?? last?.actor ?? 1, onTip });
  const pass = last?.actor === 2 && last.move === null;
  text("turn-label", presentation ? presentation.actor === 1 ? "Your cut" : "The ghost remembers"
    : viewingId ? `Position after ${step} ${step === 1 ? "turn" : "turns"}`
      : complete ? active.status === "human" ? "You took the last branch" : "The ghost took the last branch"
        : controller.busy ? "Saving your progress" : pass ? "Your extra turn" : "Your turn. Cut a gold tip.");
  text("instruction", presentation ? presentation.resolution.regrown ? "The tip is cut. Its remaining parent branch grows a copy." : "A cut beside the root removes this branch."
    : phaseText(shown, Boolean(viewingId)));
  const source = presentation?.turn.source ?? last?.source;
  const origin = shown.startSource ? `An unanswered tree from match ${db.games.findIndex(game => game.id === shown.startSource?.gameId) + 1}. Your next cut can teach the ghost a reply.` : "";
  element("source").hidden = !source && !(step === 0 && origin);
  if (source) text("source", sourceLabel(source, db)); else if (step === 0) text("source", origin);
  element("turn-status").classList.toggle("ghost-turn", presentation?.actor === 2);
  element("result").hidden = Boolean(viewingId) || Boolean(presentation) || controller.busy || !complete;
  text("result-title", active.status === "human" ? "You win" : "Ghost wins");
  element("return-live").hidden = !viewingId;
  element("replay-ghost").hidden = Boolean(viewingId) || last?.actor !== 2 || last.move === null;
  disabled("replay-ghost", controller.busy);
  const scores = matchScore(db);
  text("human-wins", String(scores.human)); text("ghost-wins", String(scores.ghost)); text("discoveries", String(discoveryScore(db)));
  text("save-status", controller.busy && !presentation ? "Saving full archive…" : `Saved locally · revision ${db.revision}`);
  const decisions = db.games.reduce((sum, game) => sum + game.turns.filter(turn => turn.actor === 1).length, 0);
  text("archive-summary", `${decisions} human ${decisions === 1 ? "decision" : "decisions"}`);
  gamePicker.replaceChildren(...db.games.map((game, index) => {
    const option = document.createElement("option"); option.value = game.id;
    option.textContent = `Match ${index + 1} — ${resultLabel(game.status)}`; option.selected = game.id === shown.id; return option;
  }));
  turnPicker.replaceChildren(...Array.from({ length: shown.turns.length + 1 }, (_, index) => {
    const option = document.createElement("option"); option.value = String(index); option.selected = index === step;
    const turn = shown.turns[index - 1];
    option.textContent = !turn ? origin ? "Opening — unanswered tree" : "Opening tree" : `${index}. ${turn.actor === 1 ? "You" : "Ghost"} ${turn.move === null ? "passed" : `cut tip ${turn.move.map(value => value + 1).join(".")}`}${turn.discovery ? " (+1)" : ""}`;
    return option;
  }));
  text("history-detail", step === 0 && origin ? origin : last?.source ? sourceLabel(last.source, db) : last?.move === null ? "A pass leaves the entire tree unchanged and returns the turn to you." : "Every saved position includes the whole tree and the decision that led to it.");
  text("position-code", position);
}

function leaveReview() { viewingId = null; viewingStep = null; loop.reset(); }
element("new-game").addEventListener("click", () => { leaveReview(); void perform(() => controller.nextGame(seedPicker.value)); });
element("grow-seed").addEventListener("click", () => { leaveReview(); void perform(() => controller.growSeed()); });
element("replay-ghost").addEventListener("click", () => void perform(() => controller.replayGhost()));
element("reload").addEventListener("click", () => { leaveReview(); void perform(() => controller.load()); });
element("return-live").addEventListener("click", () => { leaveReview(); render(); });
gamePicker.addEventListener("change", () => { viewingId = gamePicker.value; viewingStep = null; render(); });
turnPicker.addEventListener("change", () => { viewingId = gamePicker.value; viewingStep = Number(turnPicker.value); render(); });
historyPanel.addEventListener("toggle", render);
document.addEventListener("visibilitychange", render);
element("export").addEventListener("click", () => {
  if (!controller.database) return;
  const blob = new Blob([JSON.stringify(controller.database, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url;
  anchor.download = `echoes3-games-r${controller.database.revision}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

await perform(async () => {
  const response = await fetch("/echoes3.wasm");
  if (!response.ok) throw new Error("The branching engine could not load. Rebuild Echoes 3 and reload.");
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { env: { abort() { throw new Error("WASM assertion failed."); } } });
  controller.engine = new WasmRules(instance.exports);
  await controller.load();
});
