import { defineConfig } from 'tsdown'

/**
 * Bundle every workspace package the way deepseek-harness does: tsdown consumes
 * the JavaScript `tsc` already emitted into `lib/types/`, so `pnpm run build` is
 * `tsc -b` followed by this. tsdown never compiles TypeScript here, and
 * declarations come from `tsc` (hence `dts: false`).
 *
 * `lib/types/index.js` becomes `lib/index.js` and `lib/types/invariant.js`
 * becomes `lib/invariant.js` — exactly the paths a package's `exports` and
 * `files` publish. A package with no `invariant.ts` simply has no second entry;
 * the glob matches whichever exist.
 */
export default defineConfig({
  workspace: ['packages/*/*'],
  entry: ['lib/types/{index,invariant,bin,dsh-trace,dsh-graph}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
