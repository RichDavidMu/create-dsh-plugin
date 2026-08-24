## Adding a package

This project is one package. A second one means moving to the workspace layout,
which is a real but small migration:

1. Create `packages/plugin/<name>/` and `git mv src tests package.json tsconfig.json`
   into it, then `git mv bundle packages/bundle/<name>-bundle`.
2. Split the manifest: the project's scripts and toolchain devDependencies stay at
   the root, which becomes `private: true`; the plugin's own fields go with it.
3. Turn the root `tsconfig.json` into a solution (`"files": []` plus one
   `references` entry per package) and give each package its own.
4. Widen the globs that were anchored at the root: `pnpm-workspace.yaml`,
   `paths` in `tsconfig.base.json`, `include` in `tsconfig.tests.json`,
   `vitest.config.ts`, `.oxlintrc.json`, and `workspace` in `tsdown.config.ts`.
5. If the new package should mount in a profile, add a row to the bundle's
   `cordis.patch.yml`.

Generating a throwaway project with `--layout workspace` and diffing it against
this one is the fastest way to get every glob right.
