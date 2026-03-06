/**
 * Service Worker for caching map tiles
 * Caches MapTiler satellite tiles and vector resources locally
 * so repeat views are instant
 */

const CACHE_NAME = 'kdt-aso-tiles-v1'
const MAX_CACHE_SIZE = 500 // max tiles to keep

// Patterns to cache
const TILE_PATTERNS = [
  /api\.maptiler\.com/,
  /tiles\.maptiler\.com/,
  /protomaps\.github\.io\/basemaps-assets/,
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = event.request.url

  // Only cache tile/map resources
  const isTile = TILE_PATTERNS.some(p => p.test(url))
  if (!isTile) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Check cache first
      const cached = await cache.match(event.request)
      if (cached) return cached

      // Fetch from network
      try {
        const response = await fetch(event.request)
        if (response.ok) {
          // Cache the tile (don't await — fire and forget)
          cache.put(event.request, response.clone()).then(() => {
            // Evict old entries if cache is too large
            cache.keys().then(keys => {
              if (keys.length > MAX_CACHE_SIZE) {
                // Delete oldest 100 entries
                keys.slice(0, 100).forEach(key => cache.delete(key))
              }
            })
          })
        }
        return response
      } catch (err) {
        // Network failed, return cached if available (stale)
        return cached || new Response('', { status: 503 })
      }
    })
  )
})
