// Service Worker for WeatherView PWA
const CACHE_NAME = 'yash-weather-app-v5';
const STATIC_CACHE_URLS = [
  '/',
  '/forecast',
  '/map',
  '/locations',
  '/settings',
  '/static/css/custom.css',
  '/static/js/weather-scene.js',
  '/static/js/wv-shared.js',
  '/static/js/pages/today.js',
  '/static/js/pages/forecast.js',
  '/static/js/pages/map.js',
  '/static/js/pages/locations.js',
  '/static/js/pages/settings.js',
  '/static/manifest.json',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/icon-maskable-192.png',
  '/static/icons/icon-maskable-512.png',
  '/static/icons/apple-touch-icon-180.png',
  '/static/icons/favicon-32.png',
  '/static/icons/favicon-16.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
  // Leaflet + OpenStreetMap/OpenWeatherMap tiles are deliberately not
  // precached here - the map page degrades gracefully offline (blank
  // tiles), and the tile key space is far too large to precache.
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_CACHE_URLS);
      })
      .catch(error => {
        console.error('[SW] Failed to cache static assets:', error);
      })
  );
  
  // Skip waiting to activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  // Claim all clients immediately
  return self.clients.claim();
});

// Fetch event - cache strategy
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle different types of requests
  if (url.pathname.startsWith('/api/')) {
    // API requests - network first with fallback
    event.respondWith(networkFirstStrategy(request));
  } else if (request.mode !== 'navigate' && STATIC_CACHE_URLS.some(staticUrl => {
    const filename = staticUrl.split('/').pop();
    return filename && request.url.includes(filename);
  })) {
    // Static assets (not page navigations) - cache first
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Navigations and everything else - network first, falling back to cache,
    // then to the offline page for navigations with no cache available
    event.respondWith(networkFirstStrategy(request));
  }
});

// Network first strategy (good for API calls and dynamic content)
async function networkFirstStrategy(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // If successful, cache the response (except API calls)
    if (networkResponse.ok && !request.url.includes('/api/')) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, return offline page for navigation requests
    if (request.mode === 'navigate') {
      return new Response(
        generateOfflinePage(),
        {
          status: 200,
          statusText: 'OK',
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }
    
    // For other requests, return a basic offline response
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Cache first strategy (good for static assets)
async function cacheFirstStrategy(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache the response for future use
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('[SW] Cache first strategy failed:', error);
    return new Response('Resource unavailable', { status: 503 });
  }
}

// Generate offline page HTML
function generateOfflinePage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>WeatherView - Offline</title>
      <link rel="stylesheet" href="/static/css/custom.css">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
      <script>
        // Same-origin localStorage is available here even on the SW-generated
        // page - respect the user's last theme choice before first paint.
        try {
          var isDark = localStorage.getItem('darkMode') === 'true';
          document.documentElement.setAttribute('data-bs-theme', isDark ? 'dark' : 'light');
        } catch (e) {}
      </script>
    </head>
    <body>
      <section class="wv-empty-state" aria-labelledby="offlineTitle">
        <div class="wv-empty-state__inner glass-card">
          <div class="wv-empty-state__icon">
            <i class="fas fa-wifi-slash" aria-hidden="true"></i>
          </div>
          <h1 id="offlineTitle" class="wv-empty-state__title">You're Offline</h1>
          <p class="wv-empty-state__description">
            It looks like you're not connected to the internet. Please check your
            connection and try again.
          </p>
          <div class="wv-empty-state__actions">
            <button type="button" class="wv-btn wv-btn--primary wv-btn--lg" onclick="window.location.reload()">
              <i class="fas fa-redo" aria-hidden="true"></i>
              <span>Try Again</span>
            </button>
          </div>
          <p id="lastCityHint" class="wv-empty-state__description" style="display: none; font-size: var(--wv-text-sm);"></p>
        </div>
      </section>

      <script>
        document.addEventListener('DOMContentLoaded', function () {
          var lastCity = localStorage.getItem('lastWeatherCity');
          if (lastCity) {
            var hint = document.getElementById('lastCityHint');
            hint.textContent = 'Last searched city: ' + lastCity;
            hint.style.display = 'block';
          }
        });

        window.addEventListener('online', function () {
          window.location.reload();
        });
      </script>
    </body>
    </html>
  `;
}

// Handle background sync (future enhancement)
self.addEventListener('sync', event => {
  console.log('[SW] Background sync event:', event.tag);
  
  if (event.tag === 'weather-update') {
    event.waitUntil(
      // Could implement background weather updates here
      console.log('[SW] Background weather update requested')
    );
  }
});

// Handle push notifications (future enhancement)
self.addEventListener('push', event => {
  console.log('[SW] Push event received');
  
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Weather update available',
      icon: '/static/icons/icon-192.png',
      badge: '/static/icons/icon-192.png',
      tag: 'weather-notification',
      requireInteraction: false,
      actions: [
        {
          action: 'view',
          title: 'View Weather'
        }
      ]
    };
    
    event.waitUntil(
      self.registration.showNotification(data.title || 'Weather App', options)
    );
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notification click event');
  
  event.notification.close();
  
  if (event.action === 'view' || !event.action) {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle messages from main thread
self.addEventListener('message', event => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Send response back to main thread, if it provided a reply channel
  if (event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      type: 'SW_RESPONSE',
      payload: 'Service Worker received message'
    });
  }
});

console.log('[SW] Service Worker script loaded');
