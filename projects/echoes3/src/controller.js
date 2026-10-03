import { currentGame, startGame, startEncounter, growOpening, humanMove, advanceGhost } from "./core/game.js";
import { applyMove } from "./core/rules.js";
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Turn} Turn */
/** @typedef {import('./core/types.js').Move} Move */
/** @typedef {import('./core/types.js').Resolution} Resolution */
/** @typedef {import('./core/types.js').Presentation} Presentation */
/** @typedef {{load:()=>Promise<Database>,save:(db:Database)=>Promise<Database>}} Storage */
/** @typedef {{applyMove:(position:string,move:Move)=>Resolution}} Engine */

export class GameController {
  /** @param {Storage} storage @param {()=>void} [onChange] @param {(p:Presentation)=>Promise<void>} [present] @param {Engine|null} [engine] */
  constructor(storage, onChange = () => {}, present = async () => {}, engine = null) {
    this.storage = storage; this.onChange = onChange; this.present = present; this.engine = engine;
    this.busy = false;
    /** @type {Database|null} */ this.database = null;
    /** @type {Presentation|null} */ this.presentation = null;
  }
  async load() {
    if (this.busy) return;
    this.busy = true; this.onChange();
    try {
      const db = await this.storage.load();
      this.database = db.activeGameId ? db : await this.storage.save(startEncounter(db));
      if (currentGame(this.database).turn === 2) await this.resolveGhost();
    } finally { this.busy = false; this.onChange(); }
  }
  /** @param {Turn} turn @returns {Resolution} */
  resolution(turn) {
    if (turn.move === null) throw new Error("A pass has no cut to animate.");
    const result = this.engine ? this.engine.applyMove(turn.before, turn.move) : applyMove(turn.before, turn.move);
    if (result.position !== turn.after) throw new Error("The tree engines disagree; reload saved progress.");
    return result;
  }
  /** @param {Turn} turn @param {Resolution} resolution */
  async showTurn(turn, resolution) {
    this.presentation = { actor: turn.actor, turn, resolution }; this.onChange();
    try { await this.present(this.presentation); }
    finally { this.presentation = null; this.onChange(); }
  }
  async resolveGhost() {
    const next = advanceGhost(/** @type {Database} */ (this.database));
    const turn = /** @type {Turn} */ (currentGame(next).turns.at(-1));
    const resolution = turn.move === null ? null : this.resolution(turn);
    this.database = await this.storage.save(next);
    if (resolution) await this.showTurn(turn, resolution);
    else this.onChange();
  }
  /** @param {Move} move */
  async play(move) {
    if (this.busy || !this.database) return;
    this.busy = true; this.onChange();
    try {
      const next = humanMove(this.database, move);
      const turn = /** @type {Turn} */ (currentGame(next).turns.at(-1));
      const resolution = this.resolution(turn);
      this.database = await this.storage.save(next);
      await this.showTurn(turn, resolution);
      if (currentGame(this.database).turn === 2) await this.resolveGhost();
    } finally { this.busy = false; this.onChange(); }
  }
  /** @param {string} [initialPosition] */
  async nextGame(initialPosition) {
    if (this.busy || !this.database) return;
    this.busy = true; this.onChange();
    try {
      const next = initialPosition === undefined ? startEncounter(this.database) : startGame(this.database, { initialPosition });
      this.database = await this.storage.save(next);
    } finally { this.busy = false; this.onChange(); }
  }
  async growSeed() {
    if (this.busy || !this.database) return;
    await this.nextGame(growOpening(currentGame(this.database).initialPosition));
  }
  async replayGhost() {
    if (this.busy || !this.database) return;
    const turn = currentGame(this.database).turns.at(-1);
    if (!turn || turn.actor !== 2 || turn.move === null) return;
    this.busy = true; this.onChange();
    try { await this.showTurn(turn, this.resolution(turn)); }
    finally { this.busy = false; this.onChange(); }
  }
}
