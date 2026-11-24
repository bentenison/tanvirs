import { describe, expect, it } from 'vitest'
import { validateContent } from '@/config/validate'
import { profile, availabilityText } from '@/config/profile'
import { projects } from '@/config/projects'
import { domains, technologies } from '@/config/technologies'
import { articles } from '@/config/site'
import type { Profile } from '@/config/types'

const content = () => ({
  profile: structuredClone(profile),
  projects: structuredClone(projects),
  domains,
  technologies,
  articles: [...articles],
})

describe('content configuration', () => {
  it('is valid as shipped', () => {
    expect(validateContent(content())).toEqual([])
  })

  it('never contains employer or private details', () => {
    const blob = JSON.stringify({ profile, projects, technologies }).toLowerCase()
    for (const banned of ['mkcl', 'maharashtra knowledge', '8208099303', 'epic', 'codesense', 'exam server']) {
      expect(blob).not.toContain(banned)
    }
  })

  it('does not claim adoption metrics', () => {
    const blob = JSON.stringify(projects)
    expect(blob).not.toMatch(/\b\d[\d,]*\+?\s*(institutes|students|customers|users)\b/i)
    expect(blob).not.toMatch(/uptime/i)
  })

  it('flags duplicate slugs, unknown domains and bad links', () => {
    const c = content()
    c.projects.push({ ...c.projects[0] })
    c.projects[1].domains = ['nope' as never]
    c.profile.links.github = 'http://insecure.example'
    const errors = validateContent(c)
    expect(errors.some((e) => e.includes('duplicate slug'))).toBe(true)
    expect(errors.some((e) => e.includes('unknown domain'))).toBe(true)
    expect(errors.some((e) => e.includes('github'))).toBe(true)
  })

  it('requires text for a custom availability', () => {
    const c = content()
    c.profile.availability = { mode: 'custom' }
    expect(validateContent(c)).toContain('profile.availability.text is required when mode is "custom"')
  })

  it('every domain has technologies and every feature project has engineering notes', () => {
    for (const d of domains) expect(technologies.some((t) => t.domain === d.id)).toBe(true)
    for (const p of projects.filter((x) => x.presentation === 'feature')) expect(p.engineering?.length).toBeGreaterThan(0)
  })
})

describe('availabilityText', () => {
  const with_ = (availability: Profile['availability']) => ({ ...profile, availability })
  it('hides when mode is none', () => expect(availabilityText(with_({ mode: 'none' }))).toBeNull())
  it('uses preset labels', () => {
    expect(availabilityText(with_({ mode: 'open' }))).toMatch(/open/i)
    expect(availabilityText(with_({ mode: 'freelance' }))).toMatch(/freelance/i)
  })
  it('uses custom text and hides empty custom text', () => {
    expect(availabilityText(with_({ mode: 'custom', text: 'Booking Q3' }))).toBe('Booking Q3')
    expect(availabilityText(with_({ mode: 'custom', text: '  ' }))).toBeNull()
  })
})
