import { site } from '@/config/site'
import { profile } from '@/config/profile'
import { projectBySlug, projects } from '@/config/projects'

/**
 * Per-route metadata. Used both by the prerenderer (real HTML for crawlers
 * and social previews) and on client navigation (document.title etc.).
 */
export interface RouteHead {
  title: string
  description: string
  path: string
  type: 'website' | 'profile' | 'article'
  jsonLd: Record<string, unknown>[]
  noindex?: boolean
}

const person = () => ({
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: profile.name,
  jobTitle: profile.title,
  url: site.baseUrl + '/',
  ...(profile.links.email ? { email: `mailto:${profile.links.email}` } : {}),
  sameAs: [profile.links.github, profile.links.linkedin].filter(Boolean),
  knowsAbout: ['Go', 'Vue.js', 'PostgreSQL', 'MongoDB', 'Concurrency', 'REST APIs', 'Retrieval-augmented generation'],
  ...(profile.location ? { address: { '@type': 'PostalAddress', addressLocality: profile.location } } : {}),
})

const softwareApp = (slug: string) => {
  const p = projectBySlug(slug)
  if (!p) return null
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: p.name,
    description: p.summary,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    ...(p.url ? { url: p.url } : {}),
    author: { '@type': 'Person', name: profile.name, url: site.baseUrl + '/' },
  }
}

export function headFor(path: string): RouteHead {
  const clean = path.replace(/\/+$/, '') || '/'
  const work = clean.match(/^\/work\/([a-z0-9-]+)$/)
  if (work) {
    const p = projectBySlug(work[1])
    if (p && p.presentation === 'feature') {
      return {
        title: `${p.name}: ${p.category} · ${profile.name}`,
        description: `${p.tagline} ${p.summary}`.slice(0, 300),
        path: clean,
        type: 'article',
        jsonLd: [softwareApp(p.slug)!, person()],
      }
    }
  }
  if (clean === '/playground') {
    return {
      title: `Engineering playground · ${profile.name}`,
      description:
        'Interactive, deterministic simulations of a Go worker pool, a database connection pool, an LRU/TTL cache and a retrieval-augmented generation pipeline.',
      path: clean,
      type: 'website',
      jsonLd: [person()],
    }
  }
  if (clean === '/') {
    return {
      title: site.title,
      description: site.description,
      path: '/',
      type: 'profile',
      jsonLd: [
        person(),
        ...projects.map((p) => softwareApp(p.slug)).filter((x): x is NonNullable<typeof x> => !!x),
      ],
    }
  }
  return {
    title: `Not found · ${profile.name}`,
    description: 'This page does not exist.',
    path: clean,
    type: 'website',
    jsonLd: [],
    noindex: true,
  }
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Serialise head tags for prerendering. */
export function renderHeadTags(h: RouteHead): string {
  const url = site.baseUrl + (h.path === '/' ? '/' : h.path)
  const image = site.baseUrl + site.ogImage
  const tags = [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" />`,
    h.noindex ? `<meta name="robots" content="noindex" />` : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${h.type}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(profile.name)}: engineering ideas into working products" />`,
    `<meta property="og:locale" content="${site.locale}" />`,
    `<meta property="og:site_name" content="${esc(profile.name)}" />`,
    `<meta name="twitter:card" content="${site.twitterCard}" />`,
    `<meta name="twitter:title" content="${esc(h.title)}" />`,
    `<meta name="twitter:description" content="${esc(h.description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...h.jsonLd.map(
      (j) => `<script type="application/ld+json">${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`,
    ),
  ]
  return tags.join('\n    ')
}

/** Client-side update after navigation. */
export function applyHead(path: string): void {
  if (typeof document === 'undefined') return
  const h = headFor(path)
  document.title = h.title
  const set = (selector: string, attr: string, value: string) => {
    const el = document.head.querySelector(selector)
    if (el) el.setAttribute(attr, value)
  }
  set('meta[name="description"]', 'content', h.description)
  set('link[rel="canonical"]', 'href', site.baseUrl + (h.path === '/' ? '/' : h.path))
  set('meta[property="og:title"]', 'content', h.title)
  set('meta[property="og:description"]', 'content', h.description)
  set('meta[property="og:url"]', 'content', site.baseUrl + h.path)
}
