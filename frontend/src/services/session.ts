/** Session-scoped flags (e.g. play the opening sequence once per visit). */
const OPENING_KEY = 'portfolio:opening-seen'

export function shouldPlayOpening(): boolean {
  try {
    return sessionStorage.getItem(OPENING_KEY) !== '1'
  } catch {
    return false
  }
}

export function markOpeningSeen(): void {
  try {
    sessionStorage.setItem(OPENING_KEY, '1')
  } catch {
    /* ignore */
  }
}
