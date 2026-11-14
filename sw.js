/* RichText.online service worker: lets the editor open offline and be installed.
 * Network-first, so a new deployment is always picked up when online; the cache is only a fallback.
 * Only static files are handled: analytics, sign-in and Firestore requests go straight to the network. */
const CACHE = 'richtext-online-v1';
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];
const SLOW_NETWORK_MS = 4000;

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (event) {
	event.waitUntil(
		caches.keys()
			.then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
			.then(function () { return self.clients.claim(); })
	);
});

function handles(url) {
	if (url.origin === self.location.origin) return url.pathname !== '/sw.js';
	return CDN_HOSTS.indexOf(url.hostname) !== -1 || (url.hostname === 'www.gstatic.com' && url.pathname.indexOf('/firebasejs/') === 0);
}

self.addEventListener('fetch', function (event) {
	const req = event.request;
	if (req.method !== 'GET' || !handles(new URL(req.url))) return;
	event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
	const cache = await caches.open(CACHE);
	const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
	const network = fetch(req).then(function (res) {
		if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
		return res;
	});
	if (!cached) return network;
	// With a cached copy, don't make people wait on a slow or dead connection.
	const timeout = new Promise(function (resolve) { setTimeout(function () { resolve(cached); }, SLOW_NETWORK_MS); });
	return Promise.race([network.catch(function () { return cached; }), timeout]);
}

// The page lists what it has already loaded so the very first visit also works offline.
self.addEventListener('message', function (event) {
	const data = event.data;
	if (!data || data.type !== 'precache' || !Array.isArray(data.urls)) return;
	event.waitUntil(caches.open(CACHE).then(function (cache) {
		return Promise.all(data.urls.map(function (u) {
			let url;
			try { url = new URL(u); } catch (e) { return null; }
			if (!handles(url)) return null;
			return fetch(u).then(function (res) {
				if (res.ok && (res.type === 'basic' || res.type === 'cors')) return cache.put(u, res);
			}).catch(function () {});
		}));
	}));
});
