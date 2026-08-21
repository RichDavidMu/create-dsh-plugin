import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

/**
 * Mirrors the deepseek-harness test setup so this plugin's tests behave the same
 * here and in dsh itself.
 *
 * `vite-tsconfig-paths` points at `tsconfig.base.json`, which deliberately has
 * no `include` — vite-tsconfig-paths treats that as match-all, so the alias map
 * applies to every test file and workspace imports resolve to `src` rather than
 * a built `lib`. That is what keeps a dsh service from being loaded twice as two
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
        // Type-only module: no runtime code to cover.
        'packages/*/*/src/types.ts',
      ],
      // Per-file 100%, matching what deepseek-harness holds its own packages to.
      // The generated example starts here, so this is a floor to keep rather than
      // a target to reach. When a line genuinely cannot be exercised, add a
      // `/* v8 ignore next -- <why> */` stating why; an unexplained waiver is a
      // bug, and lowering the threshold would hide every future gap too.
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
