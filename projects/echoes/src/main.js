import { GameController } from "./controller.js";
import { LocalDatabase } from "./storage/client.js";
import { currentGame, archiveReplies, discoveryScore, matchScore } from "./core/game.js";
import { progress, line, moveIntent } from "./core/contest.js";
import { opening, samePoint, isLegal } from "./core/rules.js";
import { canonicalKey, transformLabel } from "./core/symmetry.js";
import { WasmRules } from "./core/wasm-rules.js";
import { EncounterLoop } from "./ui/encounter-loop.js";
import { animateGhost } from "./ui/ghost-animation.js";
import { drawBoard } from "./ui/board.js";
/** @typedef {import('./core/types.js').Point} Point */
/** @typedef {import('./core/types.js').Game} Game */
/** @typedef {import('./core/types.js').Database} Database */

/** @param {string} id @returns {HTMLElement} */
function element(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing interface element ${id}`);
  return node;
}
/** @param {string} id @param {string} text */
function text(id, text) { element(id).textContent = text; }
/** @param {string} id @param {boolean} disabled */
function disabled(id, disabled) { /** @type {HTMLButtonElement} */ (element(id)).disabled = disabled; }
/** @param {Game} game @param {Database} db */
function openingOrigin(game, db) {
  const start = game.contest?.start;
  if (start?.kind === "history") {
    const encounter = db.games.findIndex(g => g.id === start.gameId) + 1;
    return `Historic encounter ${encounter} · after ${start.step} recorded ${start.step === 1 ? "move" : "moves"}`;
  }
  return start?.kind === "default" ? "Balanced opening" : game.contest ? "Original opening · four stones per side" : "Eight shared stones";
}
const picker = /** @type {HTMLSelectElement} */ (element("game-picker"));
/** @type {Point | null} */ let selected = null;
/** @type {string | null} */ let viewingId = null;
/** @type {number | null} */ let replayStep = null;
/** @type {WasmRules | null} */ let engine = null;
let hint = "";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const controller = new GameController(new LocalDatabase(), render, () => new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 0 : 260)), presentation => animateGhost(element("board"), element("ghost-cue"), presentation, reducedMotion.matches), true);
const loop = new EncounterLoop(() => {
  selected = null; hint = "";
  void perform(() => controller.continueGame());
}, 1200);

/** @param {() => Promise<unknown>} operation */
async function perform(operation) {
  element("error").hidden = true;
  try { await operation(); }
  catch (error) {
    text("error", error instanceof Error ? error.message : String(error));
    element("error").hidden = false;
  }
}
/** @param {Point} point */
function onCell(point) {
  const db = controller.database;
  if (!db || controller.busy || viewingId) return;
  const game = currentGame(db);
  if (game.status !== "playing" || game.turn !== "human") return;
  if (game.board.stones.some(p => samePoint(p, point))) {
    if (samePoint(point, game.board.resting)) { hint = "That stone is resting. Choose a different one."; selected = null; }
    else { selected = selected && samePoint(selected, point) ? null : point; hint = ""; }
    render();
    const focus = element("board").querySelector(`button[data-x="${point.x}"][data-y="${point.y}"]`);
    if (focus instanceof HTMLElement) focus.focus({ preventScroll: true });
    return;
  }
  if (!selected) { hint = "Select a shared stone first."; render(); return; }
  const move = { from: selected, to: point };
  if (!isLegal(game.board, move) || (engine && !engine.isLegal(game.board, move))) {
    hint = "Choose a highlighted cell; the constellation must stay connected."; render(); return;
  }
  selected = null; hint = "";
  void perform(() => controller.play(move));
}

function render() {
  const db = controller.database;
  disabled("new-game", controller.busy || !db); disabled("export", !db); disabled("reload", controller.busy);
  if (!db) return;
  const active = currentGame(db);
  const presentation = !viewingId ? controller.ghostPresentation : null;
  picker.disabled = controller.busy;
  loop.update(!viewingId && !controller.busy && !document.hidden && active.status !== "playing" ? active.id : null);
  text("score", String(discoveryScore(db)));
  const scores = matchScore(db);
  text("human-score", String(scores.human)); text("ghost-score", String(scores.ghost));
  const rewinding = !viewingId && Boolean(active.openingSource) && active.moves.length === 0;
  const bonus = Boolean(active.contest?.discoveries.includes(active.moves.length)) && active.turn === "human";
  const roundOver = Boolean(active.contest) && active.status !== "playing";
  const discovered = !viewingId && !presentation && (active.contest ? bonus || roundOver : active.status === "won");
  text("flash-value", roundOver ? active.contest?.winner === "human" ? "Four!" : active.contest?.winner === "ghost" ? "Ghost wins" : "Draw" : "+1");
  text("flash-caption", roundOver ? "Next match coming" : active.contest ? "Frontier found · extra move" : "New frontier");
  element("board-frame").classList.toggle("discovered", discovered);
  element("board-frame").classList.toggle("rewinding", rewinding);
  element("board-frame").classList.toggle("echo-arrival", !viewingId && Boolean(active.openingSource) && active.moves.length === 1);
  element("discovery-flash").hidden = !discovered;
  element("score-display").classList.toggle("score-pop", discovered);
  const shown = db.games.find(g => g.id === viewingId) ?? active;
  const index = db.games.indexOf(shown) + 1;
  const step = viewingId ? Math.min(replayStep ?? shown.moves.length, shown.moves.length) : shown.moves.length;
  const last = step > 0 ? shown.moves[step - 1] : null;
  const board = presentation?.turn.before ?? last?.after ?? shown.initialBoard ?? opening();
  const interactive = !viewingId && !controller.busy && active.status === "playing" && active.turn === "human";
  const matchNumber = db.games.slice(0, index).filter(g => g.contest).length;
  text("encounter-number", `${viewingId ? "Reviewing " : ""}${shown.contest ? `Match ${matchNumber}` : `Archive encounter ${index}`}`);
  const title = presentation ? presentation.kind === "reply" ? "The past has an answer." : "The archive learns your move." : rewinding ? "Your move becomes the ghost’s." : viewingId ? "An earlier constellation." : active.status === "won" ? "You reached the frontier." : active.status === "held" ? "The past held its ground." : "Find a shape the past cannot answer.";
  const contestTitle = presentation ? presentation.intent ?? "The ghost answers your move."
    : viewingId ? "An earlier contest." : active.status === "won" ? active.contest?.winner === "human" ? "Four blue. You win." : "Four amber. The ghost wins."
      : active.status === "held" ? "A draw. Try another line." : "Make four blue stones in a row.";
  text("headline", shown.contest ? contestTitle : title);
  text("turn-count", `${shown.humanTurns} / ${shown.turnLimit} moves`);
  element("goal-progress").hidden = !shown.contest;
  if (shown.contest) {
    text("human-line", `${progress(board, shown.contest.owners, "human")} / 4`);
    text("ghost-line", `${progress(board, shown.contest.owners, "ghost")} / 4`);
  }
  drawBoard(element("board"), board, { owners: shown.contest?.owners, winning: shown.contest?.winner ? line(board, shown.contest.owners, shown.contest.winner) : [], selected: viewingId ? null : selected, move: presentation?.turn.move ?? last?.move ?? null, ghost: last?.actor === "ghost", enabled: interactive, onCell });
  const ghostTurn = last?.actor === "ghost" ? last : null;
  const learning = Boolean(shown.openingSource) && step === 1;
  text("ghost-label", presentation ? presentation.kind === "reply" ? "Ghost’s turn" : "Learning echo" : ghostTurn ? learning ? "Learning echo completed" : "Ghost replied" : active.status === "won" ? "Archive exhausted" : "Your turn");
  const source = presentation?.turn.source ?? ghostTurn?.source;
  const origin = source ? db.games.findIndex(g => g.id === source.gameId) + 1 : 0;
  const replyCount = presentation?.replyCount ?? (ghostTurn ? archiveReplies(db, ghostTurn.before, shown).length : 0);
  text("ghost-cue", source ? `Encounter ${origin} · ${transformLabel(source.transform)}${!learning ? ` · ${replyCount} recorded ${replyCount === 1 ? "choice" : "choices"}` : " · replay of your discovery"}` : "The ghost checks four rotations and their reflections for a recorded reply.");
  element("ghost-status").classList.toggle("ghost-active", Boolean(presentation));
  element("replay-ghost").hidden = Boolean(viewingId) || !ghostTurn;
  disabled("replay-ghost", controller.busy);
  const instruction = presentation ? "Watch the archived shape align, then the ghost’s stone move." : hint || (viewingId ? `Recorded position after ${step} ${step === 1 ? "move" : "moves"}.` : rewinding ? "One step back. The ghost is learning your last move…" : controller.busy ? "Saving progress and asking the archive…" : active.status === "won" ? "A new discovery: no recorded human move fits this position." : active.status === "held" ? "No new discovery within this encounter’s move limit." : selected ? "Choose a highlighted destination." : active.openingSource && active.moves.length === 1 ? "The ghost just played your discovery. Answer it to go further." : active.handoffs?.includes(active.moves.length) ? "This frontier was already discovered. Make its missing response to teach the archive." : active.moves.length === 0 && archiveReplies(db, active.board).length > 0 ? "Choose your move from this known position. The ghost answers where history allows." : active.moves.length === 0 && canonicalKey(active.board) !== canonicalKey(opening()) ? "Begin at an earlier unanswered frontier. Your move teaches its response." : "Select a stone. The gold stone rests this turn.");
  const passed = active.handoffs?.includes(active.moves.length);
  const contestInstruction = presentation ? "Watch its remembered move. Colours stay with their stones."
    : viewingId ? instruction : controller.busy ? "Saving your move and checking the ghost’s replies…"
      : active.status === "won" ? active.contest?.winner === "human" ? "Your blue line wins the match." : "The amber line wins for the ghost."
        : active.status === "held" ? "Neither side made four within the move limit." : hint || (selected ? "Move either colour to build your line or break theirs."
          : passed ? bonus ? "New frontier: +1 discovery and an extra move. Keep playing this match." : "The archive has no reply here. You get an extra move." : "Move either colour. Make four blue; stop four amber. The ringed stone rests.");
  text("instruction", shown.contest ? contestInstruction : instruction);
  if (shown.contest && !presentation) {
    text("ghost-label", active.status === "won" ? "Match finished" : passed ? "Your extra turn" : ghostTurn ? "Ghost replied" : "Your turn");
    if (ghostTurn && !viewingId) text("ghost-cue", `${moveIntent(ghostTurn.before, shown.contest.owners, ghostTurn.move)} · ${transformLabel(ghostTurn.source?.transform ?? {orientation:0,dx:0,dy:0})}`);
    else if (passed) text("ghost-cue", "No recorded reply fits. The ghost passes; the board stays in play.");
    if (step === 0) {
      text("ghost-label", "Match opening");
      text("ghost-cue", openingOrigin(shown, db));
    }
  }
  element("return-live").hidden = !viewingId;
  element("outcome").hidden = Boolean(viewingId) || Boolean(presentation) || active.status === "playing";
  text("outcome-copy", active.status === "won" ? "+1 discovery. Returning to a position the past can answer." : "Moving to the next frontier…");
  if (active.contest) text("outcome-copy", "Saved. The next match starts automatically.");
  text("new-game", active.status === "playing" && active.moves.length ? "End & start new" : active.contest ? "New match" : "New encounter");

  const humanTurns = db.games.flatMap(g => g.moves.filter(m => m.actor === "human"));
  const positions = new Set(humanTurns.map(m => canonicalKey(m.before)));
  text("archive-summary", `${db.games.filter(g => g.status !== "playing").length} completed encounters · ${humanTurns.length} human decisions · ${positions.size} answered ${positions.size === 1 ? "position" : "positions"}`);
  const replies = archiveReplies(db, board, shown);
  text("density", `${replies.length} distinct recorded ${replies.length === 1 ? "reply fits" : "replies fit"} this position in the current encounter’s archive.`);
  text("save-status", controller.busy && !presentation ? "Saving complete database…" : `Saved locally · revision ${db.revision}`);

  picker.replaceChildren();
  let contestNumber = 0;
  for (const [i, game] of db.games.entries()) {
    if (game.contest) contestNumber++;
    const option = document.createElement("option"); option.value = game.id;
    option.textContent = `Encounter ${i + 1} — ${game.status === "won" ? "frontier" : game.status === "held" ? "archive held" : game.status}`;
    if (game.contest) option.textContent = `Match ${contestNumber} — ${game.status === "playing" ? "playing" : game.status === "abandoned" ? "abandoned" : game.contest.winner === "human" ? "you won" : game.contest.winner === "ghost" ? "ghost won" : "draw"}`;
    option.selected = game.id === shown.id; picker.append(option);
  }
  element("moves").replaceChildren();
  addHistoryEntry(shown, 0, "Opening", openingOrigin(shown, db), step === 0);
  let humanOrdinal = 0;
  for (const [i, turn] of shown.moves.entries()) {
    if (turn.actor === "human") humanOrdinal++;
    const label = turn.actor === "human" ? `You · move ${humanOrdinal}` : shown.openingSource && i === 0 ? "Learning echo" : "Ghost reply";
    const detail = turn.source ? `From encounter ${db.games.findIndex(g => g.id === turn.source?.gameId) + 1} · ${transformLabel(turn.source.transform)}` : `${turn.move.from.x},${turn.move.from.y} to ${turn.move.to.x},${turn.move.to.y}`;
    addHistoryEntry(shown, i + 1, label, detail, i + 1 === step, turn.actor === "ghost");
  }
  element("empty-history").hidden = shown.moves.length > 0;
  element("provenance").hidden = !last?.source;
  if (last?.source) {
    const source = last.source;
    const sourceGame = db.games.find(g => g.id === source.gameId);
    const original = sourceGame?.moves[source.moveIndex];
    if (original) {
      text("provenance-heading", "The original human decision");
      text("provenance-copy", `Encounter ${db.games.indexOf(/** @type {Game} */ (sourceGame)) + 1}, move ${sourceGame?.moves.slice(0, source.moveIndex + 1).filter(m => m.actor === "human").length}. ${transformLabel(source.transform)} to fit your constellation, including its resting stone.`);
      const mini = document.createElement("div"); mini.className = "board";
      element("original-board").replaceChildren(mini);
      drawBoard(mini, original.before, { owners: sourceGame?.contest?.owners, selected: null, move: original.move, ghost: true, enabled: false, onCell: () => {} });
    }
  }
}
/** @param {Game} game @param {number} step @param {string} label @param {string} detail @param {boolean} active @param {boolean} [ghost] */
function addHistoryEntry(game, step, label, detail, active, ghost = false) {
  const li = document.createElement("li"), button = document.createElement("button"); button.type = "button"; button.disabled = controller.busy;
  const content = document.createElement("span"), title = document.createElement("span"), small = document.createElement("small");
  title.textContent = label; small.textContent = detail; content.append(title, small); button.append(content);
  button.classList.toggle("ghost-turn", ghost); button.setAttribute("aria-current", String(active));
  button.addEventListener("click", () => { viewingId = game.id; replayStep = step; selected = null; hint = ""; render(); });
  li.append(button); element("moves").append(li);
}
async function nextGame() { viewingId = null; replayStep = null; selected = null; hint = ""; await controller.nextGame(); }
element("replay-ghost").addEventListener("click", () => void perform(() => controller.replayGhost()));
element("new-game").addEventListener("click", () => void perform(nextGame));
element("reload").addEventListener("click", () => { viewingId = null; selected = null; hint = ""; loop.reset(); void perform(() => controller.load()); });
element("return-live").addEventListener("click", () => { viewingId = null; replayStep = null; hint = ""; render(); });
document.addEventListener("visibilitychange", render);
picker.addEventListener("change", () => { viewingId = picker.value; replayStep = null; selected = null; hint = ""; render(); });
element("export").addEventListener("click", () => {
  if (!controller.database) return;
  const blob = new Blob([JSON.stringify(controller.database, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url;
  a.download = `echoes-games-r${controller.database.revision}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});

await perform(async () => {
  const response = await fetch("echoes.wasm");
  if (!response.ok) throw new Error("The WebAssembly game core could not load. Run npm run dev:echoes again.");
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), { env: { abort() { throw new Error("WASM assertion failed."); } } });
  engine = new WasmRules(instance.exports);
  await controller.load();
});
