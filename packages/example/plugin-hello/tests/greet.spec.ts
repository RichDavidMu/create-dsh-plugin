/**
 * Unit coverage for the pure greeting logic. No Context, no services — this is
 * why the logic lives in its own module.
 */

import { describe, expect, it } from 'vitest'
import { greet, SUPPORTED_LANGUAGES } from '../src/greet.ts'

describe('greet', () => {
  it('renders the requested language', () => {
    expect(greet('Ada', 'en')).toEqual({ greeting: 'Hello, Ada!', language: 'en' })
    expect(greet('Ada', 'zh')).toEqual({ greeting: '你好，Ada！', language: 'zh' })
  })

  it('trims the name before rendering', () => {
    expect(greet('  Ada  ', 'en').greeting).toBe('Hello, Ada!')
  })

  it('rejects a blank name', () => {
    expect(() => greet('   ', 'en')).toThrow(/name must not be blank/)
  })

  it('rejects an unsupported language and names the supported set', () => {
    expect(() => greet('Ada', 'fr')).toThrow(/not supported; use one of en, zh, ja/)
  })

  it('supports every language it advertises', () => {
    for (const language of SUPPORTED_LANGUAGES) {
      expect(greet('Ada', language).language).toBe(language)
    }
  })
})
