/**
 * Package-owned invariant companion for `@example/dsh-plugin-hello`.
 *
 * Every dsh workspace package ships one of these next to its main entry and
 * exports it as the `./invariant` subpath. A companion registers runtime checks
 * over relationships the package OWNS — an event stream it emits, mutable data
 * it maintains — so a violated assumption surfaces as a loud failure instead of
 * corrupt state. Checks assert relationships, never that a service or method
 * exists.
 *
 * Note the export form: named `name` / `inject` / `apply`, no default export,
 * exactly like the main plugin. A default export here would make the Loader
 * discard the namespace and never see `inject`.
 * @module @example/dsh-plugin-hello/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@example/dsh-plugin-hello'

/** Cordis companion plugin name. */
export const name = 'plugin-hello-invariant'

/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: this plugin holds no mutable state and emits no events.
 * Its tool is a pure function of validated arguments, so there is no owned
 * relationship two observations could disagree about.
 *
 * An empty installer with a stated reason is the correct answer for a stateless
 * plugin — do not invent a check that merely asserts a service exists. When your
 * plugin DOES own state, replace this with `(ctx, fail) => { … }` and call
 * `fail(message)` from a listener on the authoritative event stream.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
