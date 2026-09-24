/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  // Nested Claude worktrees live under .claude/worktrees/ INSIDE this package, so each one holds
  // a full second copy of tests/. Without this, `jest` collects every suite twice — measured at
  // 241 suites instead of 121 — and reports doubled pass/fail counts that make a regression
  // comparison meaningless.
  testPathIgnorePatterns: ['/node_modules/', 'worktrees'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // uuid v14 ships ESM only, which this CommonJS runtime cannot load ("Unexpected token 'export'"),
  // so every suite whose import graph reaches it dies before a single test runs. The stand-in is
  // byte-compatible — verified against the real package, including the uuidv5 that Qdrant point ids
  // derive from — so mapping it here costs no fidelity. A suite with its own jest.mock('uuid', ...)
  // overrides this and must supply v5 itself; see tests/helpers/uuidCjs.ts.
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/helpers/uuidCjs.ts',
  },
  setupFiles: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/scripts/**',
    '!src/seed/**',
  ],
};
