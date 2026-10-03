import globals from "globals";
export default [
  { ignores: ["public/app.js", "public/app.js.map", "data/**"] },
  { files: ["**/*.js"], languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.browser, ...globals.node } },
    rules: { eqeqeq: "error", "no-unused-vars": ["error", { argsIgnorePattern: "^_" }], "no-undef": "error", "no-constant-condition": "error", "prefer-const": "error" } }
];
