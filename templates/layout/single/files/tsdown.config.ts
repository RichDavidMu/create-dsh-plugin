import { defineConfig } from 'tsdown'

/**
 * Bundle this package the way deepseek-harness bundles its own: tsdown consumes
 * the JavaScript `tsc` already emitted into `lib/types/`, so `pnpm run build` is
 * `tsc -b` followed by this. tsdown never compiles TypeScript here, and
 * declarations come from `tsc` (hence `dts: false`).
 *
 * `lib/types/index.js` becomes `lib/index.js` and `lib/types/invariant.js`
 * becomes `lib/invariant.js` — exactly the paths this package's `exports` and
 * `files` publish. Drop the second entry if you remove `src/invariant.ts`; the
 * glob matches whichever exist.
 *
 * No `workspace` key: this project is one package. The bundle beside it ships a
 * `cordis.patch.yml` rather than JavaScript, and tsdown fails on a package whose
 * entry glob matches nothing.
 */
export default defineConfig({
  entry: ['lib/types/{index,invariant}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
