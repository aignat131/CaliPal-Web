// Build ID injected at registration time via ?v= query param — ensures a new SW
// is installed after each deployment (browser detects the changed SW URL).
const BUILD_ID = new URL(self.location.href).searchParams.get('v') ?? 'dev'
const CACHE_NAME = `calipal-${BUILD_ID}`
const STATIC_ASSETS = ['/', '/home', '/workout', '/community', '/map', '/profile']

// Install: cache static routes
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)).catch(() => {})
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Fetch: network-first for all assets, fall back to cache when offline
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Skip non-GET and external domains that must not be cached
  const SKIP_CACHE_DOMAINS = [
    'firebaseio.com', 'firebase.google.com', 'googleapis.com',
    'googleusercontent.com', 'accounts.google.com',
    'apis.google.com', 'google.com',
    'cartocdn.com', 'basemaps.cartocdn.com',
    'mediapipe.dev', 'cdn.jsdelivr.net', 'unpkg.com',
    'nominatim.openstreetmap.org',
  ]
  if (event.request.method !== 'GET') return
  if (SKIP_CACHE_DOMAINS.some(d => url.hostname === d || url.hostname.endsWith('.' + d))) return

  // Static assets: network-first, fall back to cache for offline support
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico|json)$/)) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
          return res
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // HTML pages: network-first, fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const clone = res.clone()
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone))
        return res
      })
      .catch(() =>
        caches.match(event.request).then(
          cached => cached ?? new Response('', { status: 503, statusText: 'Offline' })
        )
      )
  )
})

// Push notifications
self.addEventListener('push', event => {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'CaliPal', {
      body: data.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag ?? 'calipal',
      data: { url: data.url ?? '/home' },
    })
  )
})

// Notification click: open app at the right page
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      const target = event.notification.data?.url ?? '/home'
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(target)
          return
        }
      }
      if (clients.openWindow) clients.openWindow(target)
    })
  )
})
