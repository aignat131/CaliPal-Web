const CACHE_NAME = 'calipal-v1'
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

// Fetch: network-first for API/Firestore, cache-first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)

  // Skip non-GET, Firebase, and external requests
  if (event.request.method !== 'GET') return
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) return
  if (url.hostname.includes('carto') || url.hostname.includes('mediapipe')) return

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|woff2?|png|svg|ico|json)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached ?? fetch(event.request))
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
      .catch(() => caches.match(event.request))
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
