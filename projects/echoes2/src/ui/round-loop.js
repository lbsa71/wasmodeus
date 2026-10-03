/** @param {Pick<import('../core/types.js').Game, 'id' | 'status'>} game
 * @param {{reviewing:boolean, archiveOpen:boolean, busy:boolean, hidden:boolean, failed:boolean}} state
 * @returns {string | null} */
export function completedMatchId(game, state) {
  const complete = ["human", "ghost", "draw"].includes(game.status);
  // Archive controls can stay open during live play; only a selected history view pauses it.
  return complete && !state.reviewing && !state.busy && !state.hidden && !state.failed ? game.id : null;
}

/** One automatic restart per completed match; cancel while reviewing or animating. */
export class RoundLoop {
  /** @param {() => void} advance @param {number} [delay] */
  constructor(advance, delay = 1400) {
    this.advance = advance; this.delay = delay;
    /** @type {ReturnType<typeof setTimeout> | null} */ this.timer = null;
    /** @type {string | null} */ this.pending = null;
    /** @type {string | null} */ this.attempted = null;
  }
  /** @param {string | null} completedId */
  update(completedId) {
    if (completedId === this.pending) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null; this.pending = null;
    if (!completedId || completedId === this.attempted) return;
    this.pending = completedId;
    this.timer = setTimeout(() => {
      this.timer = null; this.pending = null; this.attempted = completedId;
      this.advance();
    }, this.delay);
  }
  reset() { this.update(null); this.attempted = null; }
}
