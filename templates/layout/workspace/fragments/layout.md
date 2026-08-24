```
packages/
  plugin/hello/          the plugin: one tool, one prompt section
  bundle/hello-bundle/   the patch layer that mounts it into a dsh profile
docs/                    authoring guides — the common path, plus how to trace the rest
scripts/                 tooling shipped by the scaffold; not linted or built here
.dsh-source/             the pinned dsh release's source, fetched and indexed; never committed
tsconfig.base.json       shared compiler options; also the vitest paths facade
tsconfig.json            the aggregate solution `tsc -b` builds
```

`scripts/` is excluded from lint and from the TypeScript solution: those files
arrive already typechecked and linted from `@rdmu/create-dsh-plugin`, and re-checking
them here would only ask you to maintain someone else's code. Your own code lives
under `packages/`.
