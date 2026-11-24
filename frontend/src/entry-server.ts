import { createMemoryHistory } from 'vue-router'
import { renderToString } from 'vue/server-renderer'
import { createApp } from './app'
import { headFor, renderHeadTags } from './services/head'
import { site } from './config/site'
import { featureProjects } from './config/projects'
import { validateContent } from './config/validate'
import { profile } from './config/profile'
import { projects } from './config/projects'
import { domains, technologies } from './config/technologies'
import { articles } from './config/site'

/** Build-time renderer used by scripts/prerender.mjs. Never shipped to browsers. */
export async function render(url: string): Promise<{ html: string; head: string }> {
  const { app, router } = createApp(createMemoryHistory(), { hydrate: true })
  await router.push(url)
  await router.isReady()
  const html = await renderToString(app)
  return { html, head: renderHeadTags(headFor(url)) }
}

export function routes(): string[] {
  return ['/', ...featureProjects().map((p) => `/work/${p.slug}`), '/playground']
}

export function contentErrors(): string[] {
  return validateContent({ profile, projects, domains, technologies, articles })
}

export const baseUrl = site.baseUrl
