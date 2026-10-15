/* Service worker. App shell cached so the courtside wifi stops mattering. */
var V = "41";
var CACHE = "pv-v" + V;
var SHELL = [
  "./", "index.html", "app.html", "states.html", "pricing.html", "register.html", "404.html", "manifest.webmanifest",
  "assets/styles.css?v="+V, "assets/data.js?v="+V, "assets/store.js?v="+V, "assets/i18n.js?v="+V,
  "assets/qr.js?v="+V, "assets/scan.js?v="+V, "assets/site.js?v="+V, "assets/figure.js?v="+V, "assets/app.js?v="+V,
  "assets/regions.js?v="+V, "assets/region.js?v="+V, "assets/clubs.js?v="+V, "assets/sales.js?v="+V, "assets/site-i18n.js?v="+V,
  "assets/icon.svg", "assets/icon-192.png", "assets/icon-512.png"
];

self.addEventListener("install", function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(SHELL.map(function(u){
      return fetch(u).then(clean).then(function(r){ if(r && r.ok) return c.put(u, r); })
        .catch(function(){ /* a missing file must not fail the install */ });
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

/* Cloudflare serves /app.html as /app via a redirect. Browsers refuse a redirected
   response for a page load, so store and serve a clean copy instead. */
function clean(res){
  if(!res || !res.redirected) return Promise.resolve(res);
  return res.blob().then(function(b){ return new Response(b, {status:res.status, statusText:res.statusText, headers:res.headers}); });
}

/* network first for pages so updates land, cache first for assets */
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  var isPage = req.mode === "navigate" || req.destination === "document";
  if(isPage){
    e.respondWith(fetch(req).then(function(res){
      if(res.ok && res.type === "basic"){ var copy = res.clone(); clean(copy).then(function(c2){ caches.open(CACHE).then(function(c){ c.put(req, c2); }); }); }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(m){ return m || caches.match("app.html"); }).then(clean);
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

/* phone notifications */
self.addEventListener("push", function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(err){ d = {body: e.data ? e.data.text() : ""}; }
  e.waitUntil(self.registration.showNotification(d.title || "Padel Vitals", {
    body: d.body || "", icon: "assets/icon-192.png", badge: "assets/icon-192.png",
    data: {url: d.url || "app.html"}, tag: d.tag || undefined
  }));
});
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "app.html";
  e.waitUntil(self.clients.matchAll({type:"window", includeUncontrolled:true}).then(function(list){
    for(var i = 0; i < list.length; i++){ if(list[i].url.indexOf("app.html") !== -1 && "focus" in list[i]) return list[i].focus(); }
    return self.clients.openWindow(url);
  }));
});
