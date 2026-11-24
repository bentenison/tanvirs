// Build-time prerendering: renders every public route to static HTML with
// real <head> metadata, then writes sitemap.xml and robots.txt.
// Run after `build:client` and `build:server`.
import { readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = join(root, 'dist', 'client')
const serverEntry = join(root, 'dist', 'server', 'entry-server.js')

const server = await import(pathToFileURL(serverEntry).href)

const problems = server.contentErrors()
if (problems.length) {
  console.error('Content configuration is invalid:\n  - ' + problems.join('\n  - '))
  process.exit(1)
}

const template = await readFile(join(clientDir, 'index.html'), 'utf8')

// Preload the display face and text face so the hero headline renders in its final font.
const assets = await readdir(join(clientDir, 'assets'))
const preload = assets
  .filter((f) => /^(instrument-serif-latin-400-normal|geist-latin-wght-normal)-.*\.woff2$/.test(f))
  .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`)
  .join('\n    ')

async function renderRoute(url, outFile) {
  const { html, head } = await server.render(url)
  const page = template
    .replace('<!--head-->', `${preload}\n    ${head}`)
    .replace('<!--app-html-->', html)
  await mkdir(dirname(outFile), { recursive: true })
  await writeFile(outFile, page)
  console.log(`  prerendered ${url} → ${outFile.slice(clientDir.length + 1)}`)
}

const routes = server.routes()
for (const url of routes) {
  const out = url === '/' ? join(clientDir, 'index.html') : join(clientDir, url.slice(1), 'index.html')
  await renderRoute(url, out)
}
await renderRoute('/404', join(clientDir, '404.html'))

const today = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes
  .map(
    (r) => `  <url><loc>${server.baseUrl}${r === '/' ? '/' : r}</loc><lastmod>${today}</lastmod><priority>${r === '/' ? '1.0' : '0.8'}</priority></url>`,
  )
  .join('\n')}
</urlset>
`
await writeFile(join(clientDir, 'sitemap.xml'), sitemap)
await writeFile(join(clientDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${server.baseUrl}/sitemap.xml\n`)

// The SSR bundle is a build tool only; it must never be embedded.
await rm(join(root, 'dist', 'server'), { recursive: true, force: true })
console.log(`prerendered ${routes.length + 1} pages, sitemap.xml, robots.txt`)
