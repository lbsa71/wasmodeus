import { moveIntent } from "./core/contest.js";
import { continueAgainstArchive } from "./core/continuation.js";
import { currentGame, startGame, startNextContest, humanMove, advanceGhost, archiveReplies } from "./core/game.js";
/** @typedef {import('./core/types.js').Database} Database */
/** @typedef {import('./core/types.js').Move} Move */
/** @typedef {import('./core/types.js').GhostPresentation} GhostPresentation */
/** @typedef {{load: () => Promise<Database>, save: (db: Database) => Promise<Database>}} Storage */

export class GameController {
  /** @param {Storage} storage @param {() => void} [onChange] @param {() => Promise<void>} [pauseForRewind] @param {(p: GhostPresentation) => Promise<void>} [presentGhost] @param {boolean} [contestMode] */
  constructor(storage, onChange = () => {}, pauseForRewind = async () => {}, presentGhost = async () => {}, contestMode = false) {
    this.contestMode = contestMode; this.presentGhost = presentGhost;
    /** @type {GhostPresentation | null} */ this.ghostPresentation = null;
    this.pauseForRewind = pauseForRewind; this.storage = storage; this.onChange = onChange; this.busy = false;
    /** @type {Database | null} */ this.database = null;
  }
  async load() {
    if (this.busy) return;
    this.busy = true; this.onChange();
    try {
      const loaded = await this.storage.load();
      if (this.contestMode && (!loaded.activeGameId || !currentGame(loaded).contest)) await this.commit(startNextContest(loaded));
      else if (!loaded.activeGameId) await this.commit(startGame(loaded));
      else this.database = loaded;
      if (currentGame(/** @type {Database} */ (this.database)).turn === "ghost") await this.resolveGhost();
    } finally { this.busy = false; this.onChange(); }
  }
  /** @param {Database} next */
  async commit(next) {
    this.database = await this.storage.save(next);
    this.onChange();
  }
  async resolveGhost() {
    const before = /** @type {Database} */ (this.database);
    const game = currentGame(before);
    const next = advanceGhost(before);
    const hasMove = currentGame(next).moves.length > game.moves.length;
    // Save before showing motion; an animation can never imply an unsaved reply.
    this.database = await this.storage.save(next);
    if (hasMove) await this.showGhost();
    else this.onChange();
  }
  async showGhost() {
    const db = /** @type {Database} */ (this.database);
    const game = currentGame(db);
    const turn = game.moves.at(-1);
    if (turn?.actor !== "ghost" || !turn.source) return;
    const original = db.games.find(g => g.id === turn.source?.gameId)?.moves[turn.source.moveIndex];
    if (!original) throw new Error("Missing human source for ghost animation.");
    this.ghostPresentation = { turn, original, kind: game.openingSource && game.moves.length === 1 ? "learning" : "reply", replyCount: archiveReplies(db, turn.before).length, owners: game.contest?.owners, intent: game.contest ? moveIntent(turn.before, game.contest.owners, turn.move) : undefined };
    this.onChange();
    try { await this.presentGhost(this.ghostPresentation); }
    finally { this.ghostPresentation = null; this.onChange(); }
  }
  async replayGhost() {
    if (this.busy || !this.database) return;
    this.busy = true;
    try { await this.showGhost(); }
    finally { this.busy = false; this.onChange(); }
  }
  /** @param {Move} move */
  async play(move) {
    if (this.busy || !this.database) return;
    this.busy = true; this.onChange();
    try {
      await this.commit(humanMove(this.database, move));
      if (currentGame(this.database).turn === "ghost") await this.resolveGhost();
    } finally { this.busy = false; this.onChange(); }
  }
  async continueGame() {
    if (this.busy || !this.database || currentGame(this.database).status === "playing") return;
    this.busy = true; this.onChange();
    try {
      await this.commit(this.contestMode ? startNextContest(this.database) : continueAgainstArchive(this.database));
      if (currentGame(this.database).turn === "ghost") {
        await this.pauseForRewind();
        await this.resolveGhost();
      }
    } finally { this.busy = false; this.onChange(); }
  }
  async nextGame() {
    if (this.busy || !this.database) return;
    this.busy = true; this.onChange();
    try { await this.commit(this.contestMode ? startNextContest(this.database) : startGame(this.database)); }
    finally { this.busy = false; this.onChange(); }
  }
}
