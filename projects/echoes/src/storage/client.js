import { validateDatabase } from "./validation.js";
/** @typedef {import('../core/types.js').Database} Database */

/** @param {Response} response */
async function readResponse(response) {
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? `Saving failed (${response.status}).`);
  return validateDatabase(json);
}
export class LocalDatabase {
  async load() { return readResponse(await fetch("/api/database", { cache: "no-store" })); }
  /** @param {Database} database */
  async save(database) {
    return readResponse(await fetch("/api/database", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision: database.revision, database }),
    }));
  }
}
