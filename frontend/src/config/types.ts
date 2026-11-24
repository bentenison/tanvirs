/** Typed content model. Presentation components read these; they never hard-code content. */

export type ProjectStatus = 'released' | 'in-development' | 'experimental' | 'archived'

export type DomainId =
  | 'frontend'
  | 'backend'
  | 'data'
  | 'infrastructure'
  | 'distributed'
  | 'ai'
  | 'performance'
  | 'tooling'

export type AvailabilityMode = 'none' | 'open' | 'freelance' | 'custom'

export interface Availability {
  /** `none` hides the status entirely. */
  mode: AvailabilityMode
  /** Used only when mode is `custom`. */
  text?: string
}

export interface Profile {
  name: string
  shortName: string
  title: string
  /** Shown verbatim; keep it honest. */
  experience: string
  location?: string
  headline: { lead: string; emphasis: string; tail: string }
  introduction: string
  biography: string[]
  principles: { title: string; body: string }[]
  links: {
    email?: string
    github?: string
    linkedin?: string
    /** Path under /public, e.g. "/resume.pdf". Leave empty to hide the download. */
    resume?: string
  }
  availability: Availability
}

export interface ProjectCapabilityGroup {
  title: string
  items: string[]
}

export type SurfaceId = 'eduflow' | 'kreovio' | 'forge' | 'flowq'

export interface Project {
  slug: string
  name: string
  status: ProjectStatus
  /** `feature` projects get a dedicated case-study route; `compact` stay on the home page. */
  presentation: 'feature' | 'compact'
  category: string
  tagline: string
  summary: string
  audience: string
  url?: string
  repository?: string
  stack: string[]
  domains: DomainId[]
  surface: SurfaceId
  highlights: string[]
  capabilities: ProjectCapabilityGroup[]
  /** Engineering themes stated only from publicly visible product behaviour. */
  engineering?: { title: string; body: string }[]
  /** Accent hue used for small project-specific details (not the global accent). */
  hue: number
}

export interface Technology {
  id: string
  name: string
  domain: DomainId
  role: string
  capabilities: string[]
  /** Project slugs. */
  projects?: string[]
}

export interface Domain {
  id: DomainId
  name: string
  short: string
  summary: string
  /** Polar placement of the lobe around the core, in degrees (0 = right, clockwise). */
  angle: number
  /** Relative lobe size, ~0.7–1.2. */
  weight: number
}

export interface Article {
  title: string
  url: string
  date: string
  topic: string
}

export interface NavItem {
  id: string
  label: string
  to: string
  index: string
}

export interface SiteMeta {
  baseUrl: string
  title: string
  description: string
  locale: string
  ogImage: string
  twitterCard: 'summary_large_image' | 'summary'
}
