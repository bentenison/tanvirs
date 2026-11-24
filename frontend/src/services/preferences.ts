import { reactive } from 'vue'

/**
 * Visitor preferences: motion intensity and colour theme.
 * Persisted to localStorage, mirrored onto <html data-*> so CSS can react
 * before Vue mounts (see public/theme-init.js).
 */
export type MotionLevel = 'full' | 'reduced' | 'minimal'
export type ThemeChoice = 'system' | 'light' | 'dark'

export const MOTION_KEY = 'portfolio:motion'
export const THEME_KEY = 'portfolio:theme'

const MOTION_LEVELS: MotionLevel[] = ['full', 'reduced', 'minimal']
const THEMES: ThemeChoice[] = ['system', 'light', 'dark']

interface State {
  motion: MotionLevel
  /** Whether the motion level came from an explicit choice. */
  motionExplicit: boolean
  theme: ThemeChoice
  /** Theme actually applied after resolving `system`. */
  resolvedTheme: 'light' | 'dark'
}

export const preferences = reactive<State>({
  motion: 'full',
  motionExplicit: false,
  theme: 'system',
  resolvedTheme: 'light',
})

type Listener = () => void
const listeners = new Set<Listener>()

/** Subscribe from non-Vue code (renderers). Returns an unsubscribe. */
export function onPreferencesChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(): void {
  for (const l of listeners) l()
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* private mode or storage disabled, preference lasts for the session only */
  }
}

function systemReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

function applyTheme(): void {
  preferences.resolvedTheme = preferences.theme === 'system' ? (systemDark() ? 'dark' : 'light') : preferences.theme
  const root = document.documentElement
  if (preferences.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preferences.theme)
}

function applyMotion(): void {
  document.documentElement.setAttribute('data-motion', preferences.motion)
}

let initialised = false

/** Call once in the browser before mounting. Safe to call again. */
export function initPreferences(): void {
  if (initialised || typeof window === 'undefined') return
  initialised = true

  const storedMotion = read(MOTION_KEY) as MotionLevel | null
  if (storedMotion && MOTION_LEVELS.includes(storedMotion)) {
    preferences.motion = storedMotion
    preferences.motionExplicit = true
  } else {
    preferences.motion = systemReducedMotion() ? 'reduced' : 'full'
  }

  const storedTheme = read(THEME_KEY) as ThemeChoice | null
  preferences.theme = storedTheme && THEMES.includes(storedTheme) ? storedTheme : 'system'

  applyMotion()
  applyTheme()

  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', (e) => {
      if (preferences.motionExplicit) return
      preferences.motion = e.matches ? 'reduced' : 'full'
      applyMotion()
      emit()
    })
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (preferences.theme !== 'system') return
      applyTheme()
      emit()
    })
  }
}

export function setMotion(level: MotionLevel): void {
  if (!MOTION_LEVELS.includes(level)) return
  preferences.motion = level
  preferences.motionExplicit = true
  write(MOTION_KEY, level)
  applyMotion()
  emit()
}

export function setTheme(theme: ThemeChoice): void {
  if (!THEMES.includes(theme)) return
  preferences.theme = theme
  write(THEME_KEY, theme === 'system' ? null : theme)
  applyTheme()
  emit()
}

/** Reset internal state, for tests only. */
export function _resetPreferencesForTests(): void {
  initialised = false
  listeners.clear()
  preferences.motion = 'full'
  preferences.motionExplicit = false
  preferences.theme = 'system'
  preferences.resolvedTheme = 'light'
}

export const motionLabels: Record<MotionLevel, { label: string; hint: string }> = {
  full: { label: 'Full', hint: 'Every interaction, spring and transition' },
  reduced: { label: 'Reduced', hint: 'No idle motion or parallax; short fades' },
  minimal: { label: 'Minimal', hint: 'Static visuals, instant changes' },
}
