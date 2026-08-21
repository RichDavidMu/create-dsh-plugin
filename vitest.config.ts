import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Mirrors the deepseek-harness test setup so a plugin's tests behave the same
 * here and there.
 *
 * `vite-tsconfig-paths` points at `tsconfig.base.json`, which deliberately has
 * no `include` — vite-tsconfig-paths treats that as match-all, so the alias map
 * applies to every test file and workspace imports resolve to `src` rather than
 * a built `lib`. That is what keeps a service from being loaded twice as two
 * module singletons.
 *
 * `pool: 'forks'` follows dsh: Node 24 has aborted inside its CJS lexer when
 * driven from worker threads, and forked workers avoid that shared path.
 */
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['./tsconfig.base.json'] })],
  test: {
    pool: 'forks',
    include: ['packages/*/*/tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/*/src/**/*.ts'],
      exclude: [
        // Process entry points, and nothing else: each one is argv parsing, an io
        // object built from `node:` APIs, and an exit code. The decisions they make
        // live in `dsh-source.ts` and the ordering in `graph-runner.ts`, both
        // covered here. Anything in a bin that deserves a test belongs in one of
        // those instead.
        'packages/*/*/src/bin.ts',
        'packages/*/*/src/dsh-trace.ts',
        'packages/*/*/src/dsh-graph.ts',
        // Re-export barrel with no logic of its own.
        'packages/*/*/src/index.ts',
      ],
      // Per-file 100%, matching what deepseek-harness holds its own packages to.
      // Every `v8 ignore` in this repository states why the branch is
      // unreachable — an unexplained one is a bug, not a waiver.
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
