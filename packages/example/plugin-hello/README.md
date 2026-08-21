# @example/dsh-plugin-hello

An example DeepSeek Harness plugin: one model-facing tool, one system-prompt
section, no state.

## What it registers

**`hello_greet`** — greets someone by name.

| Argument | Type | Required | Meaning |
|---|---|---|---|
| `name` | string | yes | who to greet |
| `language` | string | no | `en`, `zh`, or `ja`; defaults to the configured language |

Returns the canonical value `{ greeting, language }`. The model reads the
greeting text; `language` reaches the UI through presentation metadata.

A blank `name` or an unsupported `language` fails as a structured tool error
naming the supported set, so the model can correct itself in one turn.

**A system-prompt section** (`tool:hello_greet`, order 900) telling the model what
the tool is for and that it is a demonstration.

## Config

| Key | Type | Default | Meaning |
|---|---|---|---|
| `defaultLanguage` | string | `en` | language used when a call omits `language` |

An unsupported `defaultLanguage` throws at load rather than at first call — a
plugin that mounts should be one that works.

## Role

Function plugin: named `name` / `inject` / `Config` / `apply`, no default export.
Injects `tools` and `systemPrompt`. Both registrations are fiber-scoped, so
disposal withdraws them with no manual teardown.

`src/greet.ts` holds the logic as a pure function; `src/index.ts` is only wiring.
That split is what keeps the interesting cases unit-testable without booting a
Context.

## Model Experience

### Tool schema

#### What the model sees

The `hello_greet` schema: a required `name` string, an optional `language` string
whose description names the supported tags, and the description above.

#### Token effect

Fixed schema cost on every request where the tool is visible.

#### KV Cache effect

Prefix-stable while the definition and visibility are unchanged. Plugin lifecycle
or a config change that alters the schema invalidates reuse from it.

### Prompt section and tool result

#### What the model sees

One short static prompt section, plus the rendered greeting text on each call.

#### Token effect

The section is a fixed cost per request; each result adds one short line.

#### KV Cache effect

Append-only: the section sits in the stable request prefix, and results follow it
without invalidating existing entries.

## Known Limitations and Deferred Work

- **Three hardcoded languages** — the greeting table is a constant, not config.
  A real plugin whose value set varies by deployment would make it a `Config`
  field.
- **No `presentResult`** — a completed call falls back to the generic card. A tool
  whose result deserves richer rendering should implement it and carry the fields
  through `presentationMeta`.
