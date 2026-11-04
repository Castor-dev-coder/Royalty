// Post-build: stamp the service worker with a hash of the built outage page.
//
// Runs after `vite build` (see package.json "build"). A deploy that changes
// public/outage.html changes the hash, which changes dist/sw.js's bytes, which
// makes the browser install the new worker and its fresh cache.
//
// Usage: node scripts/stamp-sw.mjs
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const outageHtml = readFileSync(join(dist, 'outage.html'))
const version = createHash('sha256').update(outageHtml).digest('hex').slice(0, 12)

const swPath = join(dist, 'sw.js')
const sw = readFileSync(swPath, 'utf8')
if (!sw.includes('__OUTAGE_VERSION__')) {
  console.error('stamp-sw: __OUTAGE_VERSION__ placeholder missing from dist/sw.js')
  process.exit(1)
}
writeFileSync(swPath, sw.replaceAll('__OUTAGE_VERSION__', version))
console.log(`stamp-sw: outage cache version ${version}`)
