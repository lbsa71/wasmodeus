import { readFile } from "node:fs/promises";

const wasmUrl = new URL("../public/simulation.wasm", import.meta.url);

export async function loadSimulation() {
  const binary = await readFile(wasmUrl);
  const { instance } = await WebAssembly.instantiate(binary, {
    env: {
      abort(message, file, line, column) {
        throw new Error(`WASM abort: ${message}:${file}:${line}:${column}`);
      },
    },
  });

  return instance.exports;
}
