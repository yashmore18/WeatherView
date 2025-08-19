// Service Worker for Weather App PWA
const CACHE_NAME = 'weather-app-v1';
const STATIC_CACHE_URLS = [
  '/',
  '/static/css/custom.css',
  '/static/js/app.js',
  'https://cdn.replit.com/agent/bootstrap-agent-dark-theme.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'
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
  } else if (STATIC_CACHE_URLS.some(staticUrl => request.url.includes(staticUrl.split('/').pop()))) {
    // Static assets - cache first
    event.respondWith(cacheFirstStrategy(request));
  } else {
    // Other requests - network first with cache fallback
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
    <html lang="en" data-bs-theme="light">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Weather App - Offline</title>
      <link href="https://cdn.replit.com/agent/bootstrap-agent-dark-theme.min.css" rel="stylesheet">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    </head>
    <body>
      <div class="container mt-5">
        <div class="row justify-content-center">
          <div class="col-md-6 text-center">
            <i class="fas fa-wifi-slash fa-4x text-muted mb-4"></i>
            <h1 class="h3 mb-3">You're Offline</h1>
            <p class="text-muted mb-4">
              It looks like you're not connected to the internet. 
              Please check your connection and try again.
            </p>
            <button onclick="window.location.reload()" class="btn btn-primary">
              <i class="fas fa-redo me-2"></i>
              Try Again
            </button>
            <div class="mt-4">
              <p class="small text-muted">
                Last weather data may be available in your browser's local storage.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        // Try to load last weather data from localStorage
        document.addEventListener('DOMContentLoaded', function() {
          const lastCity = localStorage.getItem('lastWeatherCity');
          if (lastCity) {
            const offlineMessage = document.createElement('div');
            offlineMessage.className = 'alert alert-info mt-3';
            offlineMessage.innerHTML = 
              '<i class="fas fa-info-circle me-2"></i>' +
              'Last searched city: <strong>' + lastCity + '</strong>';
            document.querySelector('.col-md-6').appendChild(offlineMessage);
          }
        });
        
        // Listen for online status
        window.addEventListener('online', function() {
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
      icon: '/static/icon-192x192.png',
      badge: '/static/badge-72x72.png',
      tag: 'weather-notification',
      requireInteraction: false,
      actions: [
        {
          action: 'view',
          title: 'View Weather',
          icon: '/static/action-view.png'
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
  
  // Send response back to main thread
  event.ports[0].postMessage({
    type: 'SW_RESPONSE',
    payload: 'Service Worker received message'
  });
});

console.log('[SW] Service Worker script loaded');
