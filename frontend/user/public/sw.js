/*
 * Offline shell for the customer app. Serves the static outage page ONLY when
 * a navigation fails because the network or the host is unreachable.
 *
 * Deliberately narrow:
 *  - only request.mode === 'navigate' is ever handled — API responses and
 *    tokens are never read, written, or cached;
 *  - a normal network response (including 4xx/5xx) passes straight through;
 *  - the cache holds exactly one entry: the static outage page.
 *
 * __OUTAGE_VERSION__ is replaced at build time with a hash of outage.html
 * (scripts/stamp-sw.mjs), so any deploy that touches the page changes this
 * file's bytes and the browser installs the new cache.
 */
const OUTAGE_CACHE = 'royalty-outage-__OUTAGE_VERSION__'
const OUTAGE_PAGE = '/outage.html'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OUTAGE_CACHE)
      .then((cache) => cache.add(new Request(OUTAGE_PAGE, { cache: 'no-cache' })))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('royalty-outage-') && key !== OUTAGE_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.mode !== 'navigate') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(
    fetch(request).catch(() =>
      caches.match(OUTAGE_PAGE).then(
        (cached) =>
          cached ||
          new Response('The salon server is unreachable right now.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          }),
      ),
    ),
  )
})
