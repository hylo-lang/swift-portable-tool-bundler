module.exports = {
  clearMocks: true,
  moduleFileExtensions: ["js", "ts"],
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  verbose: true,
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    "<rootDir>/build/",
    "<rootDir>/node_modules/",
    "<rootDir>/tests",
    "<rootDir>/dist",
    // Pure bootstrap; the testable logic lives in `src/run.ts`, which
    // `tests/run.test.ts` exercises directly. Including the bootstrap
    // would require running the action under a child process and would
    // not add real coverage.
    "<rootDir>/src/action.ts",
  ],
  collectCoverageFrom: [
    "src/**",
    "!**/node_modules/**",
    "!**/build/**",
    "!**/dist/**",
  ],
};
