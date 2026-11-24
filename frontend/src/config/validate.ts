import type { Article, Profile, Project } from './types'
import type { Domain, Technology } from './types'

/**
 * Structural checks for the content configuration. Run by unit tests and
 * prerendering so a bad entry fails the build instead of the page.
 */
export function validateContent(input: {
  profile: Profile
  projects: Project[]
  domains: Domain[]
  technologies: Technology[]
  articles: Article[]
}): string[] {
  const errors: string[] = []
  const { profile, projects, domains, technologies, articles } = input

  if (!profile.name.trim()) errors.push('profile.name is required')
  if (profile.links.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.links.email)) {
    errors.push('profile.links.email is not a valid address')
  }
  for (const key of ['github', 'linkedin'] as const) {
    const v = profile.links[key]
    if (v && !/^https:\/\//.test(v)) errors.push(`profile.links.${key} must be an https URL`)
  }
  if (profile.links.resume && !profile.links.resume.startsWith('/')) {
    errors.push('profile.links.resume must be a site-relative path such as /resume.pdf')
  }
  if (profile.availability.mode === 'custom' && !profile.availability.text?.trim()) {
    errors.push('profile.availability.text is required when mode is "custom"')
  }

  const domainIds = new Set(domains.map((d) => d.id))
  const slugs = new Set<string>()
  for (const p of projects) {
    if (!/^[a-z0-9-]+$/.test(p.slug)) errors.push(`project ${p.name}: slug must be kebab-case`)
    if (slugs.has(p.slug)) errors.push(`project ${p.slug}: duplicate slug`)
    slugs.add(p.slug)
    if (p.url && !/^https?:\/\//.test(p.url)) errors.push(`project ${p.slug}: url must be absolute`)
    for (const d of p.domains) if (!domainIds.has(d)) errors.push(`project ${p.slug}: unknown domain ${d}`)
    if (p.capabilities.length === 0) errors.push(`project ${p.slug}: needs at least one capability group`)
  }

  const techIds = new Set<string>()
  for (const t of technologies) {
    if (techIds.has(t.id)) errors.push(`technology ${t.id}: duplicate id`)
    techIds.add(t.id)
    if (!domainIds.has(t.domain)) errors.push(`technology ${t.id}: unknown domain ${t.domain}`)
    for (const s of t.projects ?? []) if (!slugs.has(s)) errors.push(`technology ${t.id}: unknown project ${s}`)
  }
  for (const d of domains) {
    if (!technologies.some((t) => t.domain === d.id)) errors.push(`domain ${d.id}: has no technologies`)
  }

  for (const a of articles) {
    if (!/^https?:\/\//.test(a.url)) errors.push(`article "${a.title}": url must be absolute`)
    if (Number.isNaN(Date.parse(a.date))) errors.push(`article "${a.title}": invalid date`)
  }
  return errors
}
