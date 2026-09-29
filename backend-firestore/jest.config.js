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
  // uuid v14 is ESM-only and Jest's CommonJS runtime can't load it. See tests/shims/uuid.ts.
  moduleNameMapper: { '^uuid$': '<rootDir>/tests/shims/uuid.ts' },
  // cockatiel v4 is ESM-only too (Node 22 require()s it in production; Jest can't). Transpile just
  // that package to CommonJS; everything else in node_modules stays untransformed.
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    'node_modules[\\\\/]cockatiel[\\\\/].+\\.js$': ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs' } }],
  },
  transformIgnorePatterns: ['node_modules[\\\\/](?!cockatiel[\\\\/])'],
  setupFiles: ['<rootDir>/tests/setup.ts'],
  // Several suites import most of the service graph (ts-jest compiles it on first use); under a
  // full parallel run their FIRST test can pass 5s on compile time alone. Hangs are mocked out,
  // so this only absorbs load, it doesn't hide a stuck network call for long.
  testTimeout: 20_000,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/scripts/**',
    '!src/seed/**',
  ],
};
