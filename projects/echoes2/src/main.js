import { GameController } from "./controller.js";
import { LocalDatabase } from "./storage/client.js";
import { currentGame, discoveryScore, matchScore } from "./core/game.js";
import { legalMoves, territory } from "./core/rules.js";
import { WasmRules } from "./core/wasm-rules.js";
import { drawBoard } from "./ui/board.js";
import { animateTurn } from "./ui/animation.js";
import { phaseText, openingOrigin } from "./ui/view-model.js";
import { RoundLoop, completedMatchId } from "./ui/round-loop.js";
/** @typedef {import('./core/types.js').Game} Game */
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Source} Source */

/** @param {string} id @returns {HTMLElement} */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element ${id}`);
  return node;
}
/** @param {string} id @param {string} value */
function text(id, value) { element(id).textContent = value; }
/** @param {string} id @param {boolean} value */
function disabled(id, value) { /** @type {HTMLButtonElement} */ (element(id)).disabled = value; }
/** @param {number} index */
function coordinate(index) { return `${String.fromCharCode(65 + index % 5)}${Math.floor(index / 5) + 1}`; }
/** @param {Game['status']} status */
function resultLabel(status) { return status === "human" ? "you won" : status === "ghost" ? "ghost won" : status === "abandoned" ? "unfinished" : status; }
/** @param {Source} source @param {Database} db */
function sourceLabel(source, db) {
  const rotation = source.orientation % 4;
  const transforms = [source.orientation >= 4 ? "reflected" : "", rotation ? `rotated ${rotation * 90}°` : ""].filter(Boolean);
  return `Match ${db.games.findIndex(game => game.id === source.gameId) + 1}, turn ${source.turnIndex + 1}; ${transforms.length ? transforms.join(" and ") : "same orientation"}; your blue pattern becomes coral.`;
}
const gamePicker = /** @type {HTMLSelectElement} */ (element("game-picker"));
const turnPicker = /** @type {HTMLSelectElement} */ (element("turn-picker"));
const historyPanel = /** @type {HTMLDetailsElement} */ (element("history-panel"));
/** @type {string | null} */ let viewingId = null;
/** @type {number | null} */ let viewingStep = null;
let failed = false;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const controller = new GameController(new LocalDatabase(), render,
  presentation => animateTurn(element("board"), presentation, reducedMotion.matches));
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

/** @param {number} index */
function onCell(index) {
  if (!controller.database || controller.busy || viewingId) return;
  const game = currentGame(controller.database);
  if (!game || game.status !== "playing" || game.turn !== 1 || !legalMoves(game.board, 1).includes(index)) return;
  void perform(() => controller.play(index));
}

function render() {
  const db = controller.database;
  disabled("new-game", controller.busy || !db); disabled("export", !db); disabled("reload", controller.busy);
  gamePicker.disabled = controller.busy || !db; turnPicker.disabled = controller.busy || !db;
  if (!db) return;
  const active = currentGame(db);
  if (!active) return;
  const shown = db.games.find(game => game.id === viewingId) ?? active;
  const presentation = viewingId ? null : controller.presentation;
  const step = viewingId ? Math.min(viewingStep ?? shown.turns.length, shown.turns.length) : shown.turns.length;
  const last = step ? shown.turns[step - 1] : null;
  const board = presentation?.turn.before ?? last?.after ?? shown.initialBoard;
  const interactive = !viewingId && !controller.busy && active.status === "playing" && active.turn === 1;
  const complete = ["human", "ghost", "draw"].includes(active.status);
  loop.update(completedMatchId(active, {
    reviewing: Boolean(viewingId), archiveOpen: historyPanel.open,
    busy: controller.busy, hidden: document.hidden, failed,
  }));

  text("round-count", `${viewingId ? "Reviewing " : ""}Match ${db.games.indexOf(shown) + 1}`);
  text("headline", viewingId ? "A moment from the archive." : "Charge. Burst. Take over.");
  text("human-territory", String(territory(board, 1)));
  text("ghost-territory", String(territory(board, 2)));
  const moves = viewingId ? shown.turns.slice(0, step).filter(turn => turn.actor === 1).length : active.humanTurns;
  text("turn-count", `${moves} / ${shown.limit} moves`);
  for (const [id, count] of [["human-territory", territory(board, 1)], ["ghost-territory", territory(board, 2)]]) {
    const unit = element(String(id)).parentElement?.querySelector(".score-unit");
    if (unit) unit.textContent = count === 1 ? "cell" : "cells";
  }
  drawBoard(element("board"), board, {
    legal: interactive ? legalMoves(board, 1) : [], enabled: interactive,
    lastMove: presentation?.turn.move ?? last?.move ?? null,
    actor: presentation?.actor ?? last?.actor ?? 1, onCell,
  });

  const pass = last?.actor === 2 && last.move === null;
  text("turn-label", presentation ? presentation.actor === 1 ? "Your charge" : "The ghost remembers"
    : viewingId ? `Position after ${step} ${step === 1 ? "turn" : "turns"}`
      : complete ? active.status === "human" ? "You took the board" : active.status === "ghost" ? "The ghost took the board" : "Even territory"
        : controller.busy ? "Saving your progress" : pass ? "Your extra turn" : "Your turn");
  text("instruction", presentation ? presentation.bursts.some(wave => wave.length)
    ? `${presentation.actor === 1 ? "Blue" : "Coral"} bursts into its neighbours. Watch the chain reaction.`
    : presentation.actor === 1 ? "One more charge. Three charges means the next one bursts." : "A recorded human decision, replayed for coral."
    : phaseText(shown, Boolean(viewingId)));
  const source = presentation?.turn.source ?? last?.source;
  const origin = openingOrigin(shown, db);
  element("source").hidden = !source && !(step === 0 && origin);
  if (source) text("source", sourceLabel(source, db));
  else if (step === 0 && origin) text("source", origin);
  element("turn-status").classList.toggle("ghost-turn", presentation?.actor === 2);
  element("result").hidden = Boolean(viewingId) || Boolean(presentation) || controller.busy || !complete;
  text("result-title", active.status === "human" ? "You win" : active.status === "ghost" ? "Ghost wins" : "A draw");
  element("return-live").hidden = !viewingId;
  element("replay-ghost").hidden = Boolean(viewingId) || last?.actor !== 2 || last.move === null;
  disabled("replay-ghost", controller.busy);
  text("new-game", active.status === "playing" && active.turns.length ? "Start fresh" : "New match");

  const scores = matchScore(db);
  text("human-wins", String(scores.human)); text("ghost-wins", String(scores.ghost)); text("discoveries", String(discoveryScore(db)));
  text("save-status", controller.busy && !presentation ? "Saving full archive…" : `Saved locally · revision ${db.revision}`);
  const decisions = db.games.reduce((sum, game) => sum + game.turns.filter(turn => turn.actor === 1).length, 0);
  text("archive-summary", `${decisions} human ${decisions === 1 ? "decision" : "decisions"} remembered`);
  gamePicker.replaceChildren(...db.games.map((game, index) => {
    const option = document.createElement("option"); option.value = game.id;
    option.textContent = `Match ${index + 1} — ${resultLabel(game.status)}`; option.selected = game.id === shown.id;
    return option;
  }));
  turnPicker.replaceChildren(...Array.from({ length: shown.turns.length + 1 }, (_, index) => {
    const option = document.createElement("option"); option.value = String(index); option.selected = index === step;
    const turn = shown.turns[index - 1];
    option.textContent = !turn ? origin ? "Opening — unanswered position, colours reversed" : "Opening position" : `${index}. ${turn.actor === 1 ? "You" : "Ghost"} ${turn.move === null ? "passed" : `charged ${coordinate(turn.move)}`}${turn.discovery ? " (+1)" : ""}`;
    return option;
  }));
  text("history-detail", step === 0 && origin ? origin : last?.source ? sourceLabel(last.source, db) : last?.move === null ? "A pass leaves the board unchanged and returns the turn to you." : "Each saved position includes every cell, charge and remembered source.");
}

element("new-game").addEventListener("click", () => {
  viewingId = null; viewingStep = null; historyPanel.open = false;
  void perform(() => controller.nextGame());
});
element("replay-ghost").addEventListener("click", () => void perform(() => controller.replayGhost()));
element("reload").addEventListener("click", () => {
  viewingId = null; viewingStep = null; loop.reset(); void perform(() => controller.load());
});
element("return-live").addEventListener("click", () => {
  viewingId = null; viewingStep = null; historyPanel.open = false; render();
});
gamePicker.addEventListener("change", () => { viewingId = gamePicker.value; viewingStep = null; render(); });
turnPicker.addEventListener("change", () => { viewingId = gamePicker.value; viewingStep = Number(turnPicker.value); render(); });
historyPanel.addEventListener("toggle", render);
document.addEventListener("visibilitychange", render);
element("export").addEventListener("click", () => {
  if (!controller.database) return;
  const blob = new Blob([JSON.stringify(controller.database, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url;
  anchor.download = `echoes2-games-r${controller.database.revision}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

await perform(async () => {
  const response = await fetch("/echoes2.wasm");
  if (!response.ok) throw new Error("The charge engine could not load. Rebuild Echoes 2 and reload.");
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { env: { abort() { throw new Error("WASM assertion failed."); } } });
  controller.engine = new WasmRules(instance.exports);
  await controller.load();
});
