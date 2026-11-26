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
    'I build software from the database up: Go services and APIs on one side of the wire, Vue on the other, so I care about the whole path a request travels.',
    'Over five years I have designed schemas and APIs for large learning platforms and made slow paths fast. On my own I build and run EduFlow, Kreovio, Forge and FlowQ end to end.',
  ],
  principles: [
    {
      title: 'Efficient by default',
      body: 'Small binaries, few moving parts, indexed queries.',
    },
    {
      title: 'Products, not demos',
      body: 'Permissions, migrations and offline states come first.',
    },
    {
      title: 'Measure, then change',
      body: 'Profiles and query plans before opinions.',
    },
    {
      title: 'Keep learning in public',
      body: 'Small tools and experiments test ideas before products do.',
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
