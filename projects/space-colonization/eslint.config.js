import globals from "globals";

export default [
  { ignores: ["build/**", "public/app.js", "public/galaxy-worker.js", "node_modules/**"] },
  {
    files: ["**/*.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...globals.node, GPU: "readonly", GPUBufferUsage: "readonly", GPUTextureUsage: "readonly", GPUShaderStage: "readonly", GPUMapMode: "readonly" } },
    rules: {
      eqeqeq: "error",
      "no-constant-condition": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
    },
  },
];
