import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  preferences,
  initPreferences,
  setMotion,
  setTheme,
  onPreferencesChange,
  MOTION_KEY,
  THEME_KEY,
  _resetPreferencesForTests,
} from '@/services/preferences'

function mockMatchMedia(matches: Record<string, boolean>) {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: matches[q] ?? false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('preferences', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-motion')
    _resetPreferencesForTests()
    mockMatchMedia({})
  })

  it('defaults to full motion and system theme', () => {
    initPreferences()
    expect(preferences.motion).toBe('full')
    expect(preferences.theme).toBe('system')
    expect(document.documentElement.dataset.motion).toBe('full')
  })

  it('respects prefers-reduced-motion when nothing is stored', () => {
    mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    initPreferences()
    expect(preferences.motion).toBe('reduced')
    expect(preferences.motionExplicit).toBe(false)
  })

  it('persists an explicit motion level and restores it', () => {
    initPreferences()
    setMotion('minimal')
    expect(localStorage.getItem(MOTION_KEY)).toBe('minimal')
    expect(document.documentElement.dataset.motion).toBe('minimal')

    _resetPreferencesForTests()
    mockMatchMedia({ '(prefers-reduced-motion: reduce)': true })
    initPreferences()
    expect(preferences.motion).toBe('minimal')
    expect(preferences.motionExplicit).toBe(true)
  })

  it('persists theme, and system clears storage', () => {
    initPreferences()
    setTheme('dark')
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(preferences.resolvedTheme).toBe('dark')
    setTheme('system')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })

  it('ignores invalid stored values', () => {
    localStorage.setItem(MOTION_KEY, 'warp-speed')
    localStorage.setItem(THEME_KEY, 'neon')
    initPreferences()
    expect(preferences.motion).toBe('full')
    expect(preferences.theme).toBe('system')
  })

  it('notifies non-Vue listeners', () => {
    initPreferences()
    const fn = vi.fn()
    const off = onPreferencesChange(fn)
    setMotion('reduced')
    setTheme('light')
    expect(fn).toHaveBeenCalledTimes(2)
    off()
    setMotion('full')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('survives unavailable storage', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    initPreferences()
    expect(() => setMotion('reduced')).not.toThrow()
    expect(preferences.motion).toBe('reduced')
    spy.mockRestore()
  })
})
