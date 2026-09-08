import globals from "globals";

export default [
  // Everything in `public/` that is JavaScript is esbuild output: bundled
  // source, already linted where it was written.
  { ignores: ["public/*.js", "public/*.js.map", "node_modules/**"] },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        GPU: "readonly",
        GPUBufferUsage: "readonly",
        GPUTextureUsage: "readonly",
        GPUShaderStage: "readonly",
        GPUMapMode: "readonly",
      },
    },
    rules: {
      eqeqeq: "error",
      "no-constant-condition": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
    },
  },
];
