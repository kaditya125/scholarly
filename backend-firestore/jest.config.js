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
  setupFiles: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/scripts/**',
    '!src/seed/**',
  ],
};
