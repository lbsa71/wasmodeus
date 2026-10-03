/** @typedef {import('./core/types.js').Database} Database */

/** Serial complete snapshots. A save acknowledgment must never rewind a moving world. */
export class Checkpoints {
  /** @param {Database} database @param {{save: (snapshot: Database) => Promise<Database>}} store */
  constructor(database, store) {
    this.database = database;
    this.store = store;
    this.busy = false;
    this.pending = false;
    /** @type {Promise<void> | null} */ this.operation = null;
    this.savedTick = database.active?.tick ?? 0;
  }
  request() {
    this.pending = true;
    if (this.operation) return this.operation;
    this.busy = true;
    this.operation = this.drain().finally(() => { this.busy = false; this.operation = null; });
    return this.operation;
  }
  async drain() {
    while (this.pending) {
      this.pending = false;
      const snapshot = structuredClone(this.database);
      const saved = await this.store.save(snapshot);
      this.database.revision = saved.revision;
      this.database.updatedAt = saved.updatedAt;
      this.savedTick = snapshot.active?.tick ?? 0;
    }
  }
}
