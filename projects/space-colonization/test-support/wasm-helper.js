/** @param {URL} wasmUrl */
export async function loadWasm(wasmUrl) {
  const binary = await (await import("node:fs/promises")).readFile(wasmUrl);
  const { instance } = await WebAssembly.instantiate(binary, {
    env: { abort(message, file, line, column) { throw new Error(`Wasm abort ${message}:${file}:${line}:${column}`); } },
  });
  return instance.exports;
}
