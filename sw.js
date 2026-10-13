/* Service worker. App shell cached so the courtside wifi stops mattering. */
var CACHE = "pv-v21";
var SHELL = [
  "./", "index.html", "app.html", "states.html", "pricing.html", "register.html", "404.html", "manifest.webmanifest",
  "assets/styles.css?v=21", "assets/data.js?v=21", "assets/store.js?v=21", "assets/i18n.js?v=21",
  "assets/qr.js?v=21", "assets/scan.js?v=21", "assets/site.js?v=21", "assets/figure.js?v=21", "assets/app.js?v=21",
  "assets/regions.js?v=21", "assets/clubs.js?v=21", "assets/sales.js?v=21", "assets/site-i18n.js?v=21",
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return c.add(u).catch(function(){ /* a missing file must not fail the install */ });
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("message", function(e){
  if(e.data === "skip") self.skipWaiting();
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.map(function(k){ return k === CACHE ? null : caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* network first for pages so updates land, cache first for assets */
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  var isPage = req.mode === "navigate" || req.destination === "document";
  if(isPage){
    e.respondWith(fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); });
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){ return m || caches.match("app.html"); });
    }));
    return;
  }
  /* stale while revalidate: serve the cached copy, refresh it in the background */
  e.respondWith(caches.match(req).then(function(m){
    var net = fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(c){ c.put(req, copy); });
      return res;
    }).catch(function(){ return m; });
    return m || net;
  }));
});
