/**
 * The invariant companion, mounted over the real `InvariantRegistry`.
 *
 * A stateless plugin's companion has an empty installer, so what there is to
 * verify is the registration contract itself: the package name is reserved, the
 * declared export shape is the one the dsh Loader needs, and disposal releases
 * the reservation. Registering the same package name twice must fail — that
 * reservation is what stops two packages from silently claiming one identity.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as companion from '../src/invariant.ts'

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(InvariantRegistry)
})

afterEach(async () => {
  await ctx.fiber.dispose()
})

describe('plugin-hello invariant companion', () => {
  it('exports the function-plugin shape and no default', () => {
    expect(companion.name).toBe('plugin-hello-invariant')
    expect(companion.inject).toEqual(['invariants'])
    expect(typeof companion.apply).toBe('function')
    // A default export here would make the dsh Loader discard the namespace, so
    // `inject` would never be read.
    expect('default' in companion).toBe(false)
  })

  it('mounts over the real registry and reserves the package name', async () => {
    const fiber = await ctx.plugin(companion)
    expect(fiber).toBeDefined()
    // The name is now taken: a second claim on it must be refused.
    expect(() => ctx.invariants.register('@example/dsh-plugin-hello', () => {})).toThrow()
  })

  it('releases the reservation when its fiber is disposed', async () => {
    const fiber = await ctx.plugin(companion)
    await fiber.dispose()
    const release = ctx.invariants.register('@example/dsh-plugin-hello', () => {})
    expect(typeof release).toBe('function')
    release()
  })
})
