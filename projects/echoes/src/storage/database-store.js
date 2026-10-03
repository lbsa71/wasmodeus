import { mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { createDatabase } from "../core/game.js";
import { validateDatabase } from "./validation.js";
/** @typedef {import('../core/types.js').Database} Database */

export class DatabaseStore {
  /** @param {string} path */
  constructor(path) {
    this.path = path;
    /** @type {Database | null} */ this.database = null;
    /** @type {Promise<void> | null} */ this.initialized = null;
    this.queue = Promise.resolve();
  }
  async initialize() {
    await mkdir(dirname(this.path), { recursive: true });
    try { this.database = validateDatabase(JSON.parse(await readFile(this.path, "utf8"))); }
    catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") throw new Error(`Cannot read games database: ${error instanceof Error ? error.message : String(error)}`);
      this.database = createDatabase();
      await this.write(this.database, false);
    }
  }
  async read() {
    this.initialized ??= this.initialize();
    await this.initialized;
    await this.queue;
    return structuredClone(/** @type {Database} */ (this.database));
  }
  /** @param {unknown} input @param {number} expectedRevision @returns {Promise<Database>} */
  async save(input, expectedRevision) {
    this.initialized ??= this.initialize();
    await this.initialized;
    const operation = this.queue.then(async () => {
      const current = /** @type {Database} */ (this.database);
      if (expectedRevision !== current.revision) {
        const error = Object.assign(new Error("Another tab saved progress. Reload to continue from the latest game."), { statusCode: 409 });
        throw error;
      }
      const next = validateDatabase(input);
      if (next.revision !== expectedRevision) throw new Error("Invalid database revision.");
      next.revision = current.revision + 1; next.updatedAt = new Date().toISOString();
      await this.write(next, true);
      this.database = next;
      return structuredClone(next);
    });
    this.queue = operation.then(() => {}, () => {});
    return operation;
  }
  /** @param {Database} db @param {boolean} backup */
  async write(db, backup) {
    if (backup && this.database) await this.atomicWrite(`${this.path}.bak`, JSON.stringify(this.database, null, 2) + "\n");
    await this.atomicWrite(this.path, JSON.stringify(db, null, 2) + "\n");
  }
  /** @param {string} path @param {string} contents */
  async atomicWrite(path, contents) {
    const temporary = `${path}.tmp`;
    const file = await open(temporary, "w", 0o600);
    try { await file.writeFile(contents, "utf8"); await file.sync(); } finally { await file.close(); }
    await rename(temporary, path);
    // Persist the rename as well as the file contents on filesystems that support it.
    const folder = await open(dirname(path), "r");
    try { await folder.sync(); } finally { await folder.close(); }
  }
}
