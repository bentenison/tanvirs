import type { Profile } from './types'

/**
 * Personal information. Anything left empty is hidden from the site rather
 * than rendered as a broken link.
 *
 * Deliberately absent: employer, employer products, phone number and
 * work-history figures.
 */
export const profile: Profile = {
  name: 'Tanvir Shaikh',
  shortName: 'Tanvir',
  title: 'Backend-focused full-stack developer',
  experience: '5+ years',
  location: 'Pune, India',
  headline: {
    lead: 'Engineering ideas into',
    emphasis: 'working',
    tail: 'products.',
  },
  introduction:
    'Backend-focused full-stack developer. Five-plus years building efficient Go services, interactive Vue applications and intelligent developer tools.',
  biography: [
    'I build software from the database up. Most of my work lives in Go (services, concurrent pipelines and the APIs that hold a product together) with Vue on the other side of the wire, so I care about the whole path a request travels.',
    'Over five years I have worked on large-scale learning platforms: designing schemas and APIs, moving data between databases, making slow paths fast, reviewing code and helping small teams ship with confidence.',
    'Outside that work I build my own products end to end. EduFlow, Kreovio, Forge and FlowQ are each a single Go service with a Vue front end and PostgreSQL underneath, designed, built and operated by me.',
    'I am most curious about concurrency, database behaviour under load, and how AI fits into a developer’s daily loop: retrieval-augmented generation, careful prompting, and using models as a fast collaborator while keeping tests and review as the source of truth.',
  ],
  principles: [
    {
      title: 'Efficient by default',
      body: 'Small binaries, few moving parts, queries that use their indexes. Performance is a product feature, not a later ticket.',
    },
    {
      title: 'Products, not demos',
      body: 'Permissions, migrations, offline states and languages are where real software lives. I build those parts first.',
    },
    {
      title: 'Measure, then change',
      body: 'Profiles and query plans before opinions. Every optimisation should be explainable in one sentence and one graph.',
    },
    {
      title: 'Keep learning in public',
      body: 'Experiments, playgrounds and small tools are how I test ideas before they reach a product.',
    },
  ],
  links: {
    // Left empty on purpose: the contact form delivers to the inbox set in the
    // server's CONTACT_TO, so no personal address is published on the site.
    email: '',
    github: 'https://github.com/bentenison',
    linkedin: '',
    resume: '',
  },
  /**
   * Availability status. Options:
   *   { mode: 'none' }                                  → hidden
   *   { mode: 'open' }                                  → "Open to new opportunities"
   *   { mode: 'freelance' }                             → "Available for freelance and product work"
   *   { mode: 'custom', text: 'Booking projects for Q2' }
   */
  availability: { mode: 'none' },
}

export const availabilityLabels: Record<Exclude<Profile['availability']['mode'], 'none' | 'custom'>, string> = {
  open: 'Open to new opportunities',
  freelance: 'Available for freelance and product work',
}

export function availabilityText(p: Profile = profile): string | null {
  const a = p.availability
  if (a.mode === 'none') return null
  if (a.mode === 'custom') return a.text?.trim() || null
  return availabilityLabels[a.mode]
}
