## Where to start

This project is one package: this README is both the package's and the project's,
because in this layout they are the same thing.

```sh
pnpm install
pnpm run check          # typecheck + lint + test + build
pnpm run pack:bundle    # pack bundle/ for `dsh plugin add`
```

- [docs/plugin-authoring.md](docs/plugin-authoring.md) — how to write a dsh plugin.
- [docs/loading-into-dsh.md](docs/loading-into-dsh.md) — get this running in a real
  profile, including the route that needs no bundle at all.
- [docs/tracing-dsh.md](docs/tracing-dsh.md) — read dsh itself: the source graph
  under `.dsh-source/`, and the installed declarations.
- [AGENTS.md](AGENTS.md) — the conventions an agent must follow here.

Replace the greeting logic in `src/greet.ts` with something you actually want, and
keep the shape: `src/index.ts` stays wiring, the logic stays unit-testable.
