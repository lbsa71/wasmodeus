/** Schedules one automatic continuation per completed encounter. */
export class EncounterLoop {
  /** @param {() => void} advance @param {number} [delay] */
  constructor(advance, delay = 750) {
    this.advance = advance; this.delay = delay;
    /** @type {ReturnType<typeof setTimeout> | null} */ this.timer = null;
    /** @type {string | null} */ this.pending = null;
    /** @type {string | null} */ this.attempted = null;
  }
  /** Pass null while saving, reviewing history, or hiding the tab.
   * @param {string | null} completedId */
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
