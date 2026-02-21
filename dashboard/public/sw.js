/**
 * KDT Aso - Service Worker
 * Enables offline functionality and PWA features
 */

const CACHE_NAME = 'kdt-aso-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// API routes to cache with network-first strategy
const API_CACHE_ROUTES = [
  '/api/status',
  '/api/standing-orders',
  '/api/sensors',
  '/api/languages'
];

// Install event - precache assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Precaching assets');
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip WebSocket connections
  if (url.protocol === 'ws:' || url.protocol === 'wss:') {
    return;
  }
  
  // API requests - network first, then cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }
  
  // Static assets - cache first, then network
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }
  
  // HTML pages - network first with offline fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }
  
  // Default - network first
  event.respondWith(networkFirstStrategy(request));
});

// Network first strategy
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Try cache on network failure
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return error response for API
    if (request.url.includes('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Offline', cached: false }),
        { 
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    throw error;
  }
}

// Cache first strategy
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    // Update cache in background
    fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, response);
        });
      }
    }).catch(() => {});
    
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Return placeholder for images
    if (request.url.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) {
      return new Response(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#333" width="100" height="100"/><text fill="#666" x="50%" y="50%" text-anchor="middle">Offline</text></svg>',
        { headers: { 'Content-Type': 'image/svg+xml' } }
      );
    }
    
    throw error;
  }
}

// Network first with offline fallback for HTML
async function networkFirstWithOfflineFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page
    const offlineResponse = await caches.match(OFFLINE_URL);
    if (offlineResponse) {
      return offlineResponse;
    }
    
    // Generate offline response
    return new Response(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>KDT Aso - Offline</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: system-ui; background: #1a1a2e; color: #eee; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
          .container { text-align: center; padding: 20px; }
          h1 { color: #0f3460; }
          button { background: #0f3460; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>📡 Offline</h1>
          <p>KDT Aso is currently unavailable.</p>
          <p>Check your connection and try again.</p>
          <button onclick="location.reload()">Retry</button>
        </div>
      </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

// Check if URL is a static asset
function isStaticAsset(pathname) {
  return /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/.test(pathname);
}

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
  
  if (event.tag === 'sync-alerts') {
    event.waitUntil(syncAlerts());
  }
});

async function syncMessages() {
  // Sync queued messages when back online
  const db = await openIndexedDB();
  const messages = await db.getAll('pendingMessages');
  
  for (const message of messages) {
    try {
      await fetch('/api/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      });
      await db.delete('pendingMessages', message.id);
    } catch (error) {
      console.error('[SW] Failed to sync message:', error);
    }
  }
}

async function syncAlerts() {
  // Sync alert acknowledgments when back online
  const db = await openIndexedDB();
  const acks = await db.getAll('pendingAcks');
  
  for (const ack of acks) {
    try {
      await fetch(`/api/alerts/${ack.alertId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: ack.userId })
      });
      await db.delete('pendingAcks', ack.id);
    } catch (error) {
      console.error('[SW] Failed to sync alert ack:', error);
    }
  }
}

// Simple IndexedDB wrapper
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kdt-aso-offline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      resolve({
        getAll: (store) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAll();
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        }),
        delete: (store, key) => new Promise((res, rej) => {
          const tx = db.transaction(store, 'readwrite');
          const req = tx.objectStore(store).delete(key);
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
        })
      });
    };
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingMessages')) {
        db.createObjectStore('pendingMessages', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pendingAcks')) {
        db.createObjectStore('pendingAcks', { keyPath: 'id' });
      }
    };
  });
}

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  
  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'default',
    data: data.data || {},
    actions: data.actions || []
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'KDT Aso', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Focus existing window if available
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        return clients.openWindow(urlToOpen);
      })
  );
});

console.log('[SW] Service worker loaded');
