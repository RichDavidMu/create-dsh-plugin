## Adding a package

1. `mkdir -p packages/<group>/<name>/{src,tests}`
2. Copy `package.json` and `tsconfig.json` from `packages/plugin/hello` and adjust.
3. Add one `references` entry to the root `tsconfig.json`.
4. Add one `paths` entry to `tsconfig.base.json` pointing at `src`.
5. If it should mount in a profile, add a row to the bundle's `cordis.patch.yml`.
