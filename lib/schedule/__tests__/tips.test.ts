import { describe, it, expect } from 'vitest'
import { parseTipInput, isTipCategory, TIP_MAX_LENGTH } from '../tips'

describe('coach tips', () => {
  it('accepts a valid tip and trims it', () => {
    expect(parseTipInput({ text: '  Încălzește încheieturile 5 min  ', category: 'warmup' }))
      .toEqual({ text: 'Încălzește încheieturile 5 min', category: 'warmup' })
  })
  it('falls back to "general" for unknown categories', () => {
    expect(parseTipInput({ text: 'ok', category: 'hack' })?.category).toBe('general')
    expect(parseTipInput({ text: 'ok' })?.category).toBe('general')
  })
  it('rejects empty, non-string and too long text', () => {
    expect(parseTipInput({ text: '   ' })).toBeNull()
    expect(parseTipInput({ text: 42 })).toBeNull()
    expect(parseTipInput({ text: 'x'.repeat(TIP_MAX_LENGTH + 1) })).toBeNull()
  })
  it('collapses runs of blank lines', () => {
    expect(parseTipInput({ text: 'a\n\n\n\nb' })?.text).toBe('a\n\nb')
  })
  it('knows its categories', () => {
    expect(isTipCategory('mobility')).toBe(true)
    expect(isTipCategory('MOBILITY')).toBe(false)
  })
})
