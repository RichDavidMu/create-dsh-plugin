---
name: dsh-source
description: Read dsh's actual implementation instead of guessing it. Use when a DeepSeek Harness question is not answered by docs/plugin-authoring.md — an unfamiliar ctx.<service>, whether an event's listener must call next(), a field of a tool option object, why a dsh guard exists, what calls what — or when a plugin behaves in a way the declared contract does not explain.
---

# Reading dsh's source

This project pins one dsh release, and that release's full source is fetched to
`.dsh-source/dsh-v<version>/` and indexed as its own code graph. Implementation
questions are answerable locally; guessing is never the cheaper option.

## 1. Confirm the graph is there

```sh
ls .dsh-source                 # which release is on disk
pnpm run dsh:graph             # fetch + index; costs nothing when already current
pnpm run dsh:graph --dry-run   # what it would do, offline
```

`postinstall` already ran this. When the snapshot is absent, the reason was
printed there: no network, no `git`, or no `codegraph` CLI — install it with
`npm i -g @colbymchenry/codegraph`.

## 2. Ask the graph

Prefer the codegraph MCP tools, passing the snapshot directory as `projectPath`:
`codegraph_explore` for an area, `codegraph_node` for one symbol's source and its
caller trail, `codegraph_callers` for who depends on it. The CLI is equivalent:

```sh
codegraph explore 'how tool timeouts are enforced' --path .dsh-source/dsh-v<version>
codegraph node defineTool --path .dsh-source/dsh-v<version>
```

Ask about behavior, not about files. One `explore` returns the relevant symbols'
verbatim source, the call paths between them, and which tests exercise them — and
those tests are usually the real answer to "how is this meant to be used".

The project's own code is a separate graph, queried without `projectPath`. Keeping
them apart is deliberate: your plugin's blast radius should not include all of dsh.

## 3. When the graph is not the right tool

- The **contract** — what a service promises — is in the installed declarations,
  where grep is faster:
  `packages/plugin/hello/node_modules/@deepseek-ai/*/lib/types/*.d.ts`.
- A package's **config keys, limitations, and model cost** are in its shipped
  `README.md`.
- `pnpm run trace <pkg>` prints every route for one package, the local snapshot
  included.

[docs/tracing-dsh.md](../../../docs/tracing-dsh.md) is the full reference.

Whatever the route: the compiler catches a misspelled name, not a waterfall
listener that forgets `next()` or a `render` that is not pure. Read those.
