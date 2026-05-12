import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    coverage: {
      include: ["src/**"],
      exclude: ["src/action.ts"],
    },
  },
});
