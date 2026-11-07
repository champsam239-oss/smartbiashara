// App-shell cache only. Never caches Supabase/API calls: sales and stock always need a live connection (offline selling is NOT implemented).
const C = 'biashara-shell-v1'
self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url)
  if (e.request.method !== 'GET' || u.origin !== location.origin) return
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(C).then(ch => ch.put(e.request, c)) } return r }).catch(() => caches.match(e.request).then(m => m || caches.match('/'))))
})
