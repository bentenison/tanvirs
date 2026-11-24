import type { Article, SiteMeta } from './types'
import { profile } from './profile'

/** Overridable at build time with VITE_BASE_URL. */
const baseUrl = (import.meta.env?.VITE_BASE_URL as string | undefined) || 'https://tanvirs.alwaysdata.net'

export const site: SiteMeta = {
  baseUrl: baseUrl.replace(/\/+$/, ''),
  title: `${profile.name} · Backend-focused full-stack developer`,
  description:
    'Tanvir Shaikh is a backend-focused full-stack developer building efficient Go services, interactive Vue applications and intelligent developer tools.',
  locale: 'en_IN',
  ogImage: '/og.png',
  twitterCard: 'summary_large_image',
}

/**
 * Published articles only. The writing section stays hidden while empty.
 * Example: { title: '…', url: 'https://…', date: '2026-03-01', topic: 'Concurrency' }
 */
export const articles: Article[] = []
