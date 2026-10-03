import { createServer as httpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, extname, sep } from "node:path";
import { DatabaseStore } from "./storage/database-store.js";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));
const defaultDatabase = fileURLToPath(new URL("../data/games.json", import.meta.url));
const mime = /** @type {Record<string, string>} */ ({ ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".json": "application/json", ".map": "application/json" });
/** @param {{databasePath?: string}} [options] */
export function createServer(options = {}) {
  const store = new DatabaseStore(options.databasePath ?? defaultDatabase);
  return httpServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    /** @param {number} status @param {unknown} payload */
    const json = (status, payload) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(payload)); };
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (url.pathname === "/api/database") {
        if (request.method === "GET") { json(200, await store.read()); return; }
        if (request.method !== "PUT") { json(405, { error: "Use GET or PUT." }); return; }
        const origin = request.headers.origin;
        if (origin && origin !== `http://${request.headers.host}`) { json(403, { error: "Save from the local game page." }); return; }
        let text = "";
        for await (const chunk of request) {
          text += chunk.toString();
          if (Buffer.byteLength(text) > 64 * 1024 * 1024) { json(413, { error: "Database exceeds the 64 MB limit." }); return; }
        }
        let payload;
        try { payload = JSON.parse(text); } catch { json(400, { error: "Invalid JSON database." }); return; }
        if (!payload || !Number.isSafeInteger(payload.expectedRevision)) { json(400, { error: "Missing save revision." }); return; }
        try { json(200, await store.save(payload.database, payload.expectedRevision)); }
        catch (error) { json(/** @type {{statusCode?: number}} */ (error).statusCode ?? 400, { error: error instanceof Error ? error.message : String(error) }); }
        return;
      }
      if (request.method !== "GET" && request.method !== "HEAD") { json(405, { error: "Read only." }); return; }
      const path = resolve(publicPath, "." + decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
      if (!path.startsWith(publicPath.endsWith(sep) ? publicPath : publicPath + sep)) { json(403, { error: "Outside the game directory." }); return; }
      const bytes = await readFile(path);
      response.writeHead(200, { "Content-Type": mime[extname(path)] ?? "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : bytes);
    } catch (error) {
      const missing = /** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT";
      json(missing ? 404 : 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT ?? 4179);
  const databasePath = process.env.ECHOES3_DATABASE_PATH ?? defaultDatabase;
  const server = createServer({ databasePath });
  server.listen(port, "127.0.0.1", () => console.log(`Echoes 3: http://localhost:${port}\nComplete games database: ${databasePath}`));
}
