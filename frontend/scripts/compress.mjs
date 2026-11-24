// Build-time precompression: writes .br and .gz siblings for text assets.
// The Go server negotiates Accept-Encoding and serves them; it never
// compresses on the fly. Already-compressed formats are skipped.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync, constants } from 'node:zlib'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'client')
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest', '.xml', '.txt', '.map'])
const MIN_BYTES = 1024

async function* walk(d) {
  for (const entry of await readdir(d, { withFileTypes: true })) {
    const p = join(d, entry.name)
    if (entry.isDirectory()) yield* walk(p)
    else yield p
  }
}

let files = 0
let before = 0
let afterBr = 0
for await (const file of walk(dir)) {
  if (!COMPRESSIBLE.has(extname(file))) continue
  const { size } = await stat(file)
  if (size < MIN_BYTES) continue
  const data = await readFile(file)
  const br = brotliCompressSync(data, {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
  })
  const gz = gzipSync(data, { level: 9 })
  // Only keep a variant if it actually saves bytes.
  if (br.length < data.length) await writeFile(file + '.br', br)
  if (gz.length < data.length) await writeFile(file + '.gz', gz)
  files++
  before += data.length
  afterBr += Math.min(br.length, data.length)
}
console.log(`compressed ${files} files: ${(before / 1024).toFixed(1)} KiB → ${(afterBr / 1024).toFixed(1)} KiB (brotli)`)
