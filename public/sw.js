// Alora CRM — Service Worker for push notifications

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()))

self.addEventListener('push', (event) => {
  if (!event.data) return
  const { title, body, url, icon } = event.data.json()
  event.waitUntil(
    self.registration.showNotification(title || 'Alora CRM', {
      body:    body  || '',
      icon:    icon  || '/icons/icon-192.png',
      badge:         '/icons/badge-72.png',
      data:    { url: url || '/' },
      vibrate: [200, 100, 200],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // If the CRM is already open, focus that tab
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
