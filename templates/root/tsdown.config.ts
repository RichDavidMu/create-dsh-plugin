import { defineConfig } from 'tsdown'

/**
 * Bundle every workspace package that has source, the way deepseek-harness does:
 * tsdown consumes the JavaScript `tsc` already emitted into `lib/types/`, so
 * `pnpm run build` is `tsc -b` followed by this. tsdown never compiles
 * TypeScript here, and declarations come from `tsc` (hence `dts: false`).
 *
 * `lib/types/index.js` becomes `lib/index.js` and `lib/types/invariant.js`
 * becomes `lib/invariant.js` — exactly the paths each package's `exports` and
 * `files` publish. A package with no `invariant.ts` simply has no second entry;
 * the glob matches whichever exist.
 *
 * Bundle packages are excluded: their substance is `cordis.patch.yml`, they ship
 * no JavaScript, and tsdown fails on a package whose entry glob matches nothing.
 * Add a new package group here only if it has TypeScript source.
 */
export default defineConfig({
  workspace: ['packages/*/*', '!packages/bundle/*'],
  entry: ['lib/types/{index,invariant}.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
})
