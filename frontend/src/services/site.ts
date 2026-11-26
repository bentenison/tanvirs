/**
 * Runtime presentation config chosen on the server (PORTFOLIO_HERO,
 * PORTFOLIO_ASK) and delivered by /site-config.js before first paint.
 * That script also sets <html data-hero data-ask> so CSS shows the right
 * variant immediately; components read the same values after mount.
 */
export type HeroKind = 'request' | 'organism'

export interface SiteRuntime {
  hero: HeroKind
  ask: boolean
}

export const DEFAULT_SITE: SiteRuntime = { hero: 'organism', ask: true }

export function siteRuntime(): SiteRuntime {
  if (typeof window === 'undefined') return DEFAULT_SITE
  const raw = (window as unknown as { __SITE__?: Partial<SiteRuntime> }).__SITE__
  return {
    hero: raw?.hero === 'organism' ? 'organism' : raw?.hero === 'request' ? 'request' : DEFAULT_SITE.hero,
    ask: typeof raw?.ask === 'boolean' ? raw.ask : DEFAULT_SITE.ask,
  }
}
