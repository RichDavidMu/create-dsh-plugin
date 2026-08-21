/**
 * Composition coverage: mount the plugin over REAL dsh services and assert what
 * the model actually sees, then assert the registration is withdrawn on dispose.
 *
 * This is the test shape dsh requires of product-visible plugins. A test that
 * hand-builds a fake `ctx.tools` proves only that the test's own mock was
 * called; mounting the real registry proves the schema compiles, the arguments
 * validate, the output schema accepts the returned value, and disposal is clean.
 *
 * The disposal case is not optional — it is what makes hot reload safe. A
 * registration that outlives its fiber leaks a duplicate tool on every reload.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as pluginHello from '../src/index.ts'

const signal = new AbortController().signal

let ctx: Context

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
})

afterEach(async () => {
  await ctx.fiber.dispose()
})

/** Execute `hello_greet` through the real registry and return the outcome. */
async function callGreet(args: Record<string, unknown>): ReturnType<ToolRuntime['execute']> {
  return ctx.tools.execute({
    callId: CallId('test-call'),
    name: 'hello_greet',
    arguments: args,
    signal,
  })
}

describe('plugin-hello', () => {
  it('exposes hello_greet to the model with both parameters', async () => {
    await ctx.plugin(pluginHello, {})
    const schema = ctx.tools.schemas().find(entry => entry.name === 'hello_greet')
    expect(schema).toBeDefined()
    expect(schema?.description).toMatch(/Greet someone by name/)
    expect(Object.keys(schema?.parameters.properties ?? {})).toEqual(['name', 'language'])
    expect(schema?.parameters.required).toEqual(['name'])
  })

  it('greets in the language the call requests', async () => {
    await ctx.plugin(pluginHello, {})
    const result = await callGreet({ name: 'Ada', language: 'zh' })
    expect(result.isError).toBeFalsy()
    expect(result.content).toEqual([{ type: 'text', text: '你好，Ada！' }])
  })

  it('falls back to the configured default language', async () => {
    await ctx.plugin(pluginHello, { defaultLanguage: 'ja' })
    const result = await callGreet({ name: 'Ada' })
    expect(result.content).toEqual([{ type: 'text', text: 'こんにちは、Adaさん！' }])
  })

  it('surfaces a bad argument as a tool error rather than a crash', async () => {
    await ctx.plugin(pluginHello, {})
    const result = await callGreet({ name: 'Ada', language: 'fr' })
    expect(result.isError).toBe(true)
  })

  it('refuses to mount with an unsupported default language', async () => {
    await expect(ctx.plugin(pluginHello, { defaultLanguage: 'fr' })).rejects.toThrow(/not supported/)
  })

  it('contributes a system-prompt section naming the tool', async () => {
    await ctx.plugin(pluginHello, {})
    // `assemble()` runs the real assembly waterfall; `renderPrompt` turns the
    // result into the exact text a model request would carry.
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toMatch(/hello_greet/)
  })

  it('withdraws the tool when its plugin fiber is disposed', async () => {
    const fiber = await ctx.plugin(pluginHello, {})
    expect(ctx.tools.schemas().some(entry => entry.name === 'hello_greet')).toBe(true)
    await fiber.dispose()
    expect(ctx.tools.schemas().some(entry => entry.name === 'hello_greet')).toBe(false)
  })

  it('presents a pending call as a generic read card titled by the name', async () => {
    await ctx.plugin(pluginHello, {})
    // `ctx.tools.get` returns the registered definition, which is how a UI reaches
    // the presenters. They are pure functions of the arguments, so they can be
    // called directly — no running call needed.
    const definition = ctx.tools.get('hello_greet')
    expect(definition?.presentCall?.({ name: 'Ada' })).toEqual({
      card: 'generic',
      title: 'Ada',
      kind: 'read',
      rawInput: 'Ada',
    })
  })

  it('classifies calls as parallel-safe through the registry', async () => {
    await ctx.plugin(pluginHello, {})
    // `executionMode` is what the agent loop's scheduler asks, and it is the path
    // that calls the definition's `isConcurrencySafe`.
    expect(ctx.tools.executionMode({
      callId: CallId('test-call'),
      name: 'hello_greet',
      arguments: { name: 'Ada' },
      signal,
    })).toEqual({ kind: 'parallel' })
  })
})
