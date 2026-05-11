// SPDX short identifier: Apache-2.0
//
// Flat config for ESLint v9. Keeps the same rule set as the legacy
// `.eslintrc.js` used by setup-hylo.

const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
  {
    ignores: [
      "build/**",
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "examples/**",
    ],
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
        project: "./tsconfig.json",
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-floating-promises": ["error"],
      "@typescript-eslint/no-explicit-any": ["off"],
      "@typescript-eslint/no-unused-vars": ["off"],
      "@typescript-eslint/no-require-imports": ["off"],
    },
  },
];
