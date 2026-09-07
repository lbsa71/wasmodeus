/**
 * Where a population is kept between visits: IndexedDB, because a population
 * of four thousand brains is two megabytes of binary and that is what
 * IndexedDB is for. One record, "latest", overwritten after every generation.
 *
 * Nothing in here inspects the record. Its shape and its checks live in
 * `src/core/population.js`, where they can be tested without a browser.
 */

const DATABASE = "ground-truth";
const STORE = "population";
const KEY = "latest";

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function settle(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export class PopulationStore {
  constructor() {
    /** @type {Promise<IDBDatabase>|null} */
    this.opening = null;
  }

  /** @returns {Promise<IDBDatabase>} */
  #database() {
    if (!this.opening) {
      this.opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
      });
    }
    return this.opening;
  }

  /**
   * @param {IDBTransactionMode} mode
   * @returns {Promise<IDBObjectStore>}
   */
  async #store(mode) {
    const database = await this.#database();
    return database.transaction(STORE, mode).objectStore(STORE);
  }

  /** @returns {Promise<unknown>} the saved record, or undefined */
  async load() {
    return settle((await this.#store("readonly")).get(KEY));
  }

  /** @param {unknown} record */
  async save(record) {
    await settle((await this.#store("readwrite")).put(record, KEY));
  }

  async clear() {
    await settle((await this.#store("readwrite")).delete(KEY));
  }
}
