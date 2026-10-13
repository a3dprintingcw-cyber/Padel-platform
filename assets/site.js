/* Shared behaviour for every page: menu, toasts, language picker,
   install prompt and the service worker registration. */
(function(){
  "use strict";

  /* ---------- mobile menu ---------- */
  var menuBtn = document.getElementById("menuBtn");
  var topnav  = document.getElementById("topnav");
  if(menuBtn && topnav){
    menuBtn.addEventListener("click", function(){
      var open = topnav.classList.toggle("open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  /* ---------- current page in the nav ---------- */
  var here = location.pathname.split("/").pop() || "index.html";
  Array.prototype.forEach.call(document.querySelectorAll(".topnav a, .foot-nav a"), function(a){
    if(a.getAttribute("href") === here) a.classList.add("here");
  });

  /* ---------- toast ---------- */
  var toastEl = document.getElementById("toast"), toastT, toastAct = null;
  /* r2toast(message) or r2toast(message, actionLabel, onAction) — the action turns
     a destructive tap into something you can take back for a few seconds. */
  window.r2toast = function(msg, actionLabel, onAction){
    if(!toastEl) return;
    toastAct = onAction || null;
    toastEl.textContent = "";
    var span = document.createElement("span");
    span.textContent = msg;
    toastEl.appendChild(span);
    if(actionLabel && onAction){
      var b = document.createElement("button");
      b.className = "toast-act";
      b.type = "button";
      b.textContent = actionLabel;
      toastEl.appendChild(b);
    }
    toastEl.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function(){ toastEl.classList.remove("show"); toastAct = null; }, actionLabel ? 5200 : 2800);
  };
  if(toastEl){
    toastEl.addEventListener("click", function(e){
      if(!e.target.closest(".toast-act") || !toastAct) return;
      var fn = toastAct;
      toastAct = null;
      toastEl.classList.remove("show");
      fn();
    });
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-toast]");
    if(b) window.r2toast(b.dataset.toast);
  });

  /* ---------- coach card, used on the coaches page ---------- */
  window.coachCard = function(c, i){
    return '<div class="coach"><div class="coach-top"><div class="avatar'+(i%2?" sea":"")+'">'+c.i+'</div>'+
      '<div><h3>'+c.n+'</h3><div class="coach-role">'+c.r+'</div></div></div>'+
      '<p>'+c.b+'</p><div class="chips">'+
      c.t.map(function(t){return '<span class="chip">'+t+'</span>';}).join("")+
      '<span class="chip sea">'+c.l+'</span></div></div>';
  };

  /* ---------- language picker (app only) ---------- */
  var pick = document.getElementById("langPick");
  if(pick && window.r2i18n){
    pick.innerHTML = window.r2i18n.langs.map(function(l){
      return '<button data-lang="'+l.id+'" title="'+l.label+'">'+l.short+'</button>';
    }).join("");
    function mark(){
      Array.prototype.forEach.call(pick.querySelectorAll("[data-lang]"), function(b){
        b.classList.toggle("on", b.dataset.lang === window.r2i18n.current);
      });
    }
    pick.addEventListener("click", function(e){
      var b = e.target.closest("[data-lang]");
      if(!b) return;
      window.r2i18n.set(b.dataset.lang);
      mark();
    });
    document.addEventListener("r2:lang", mark);
    setTimeout(mark, 0);
  }

  /* ---------- install to home screen ---------- */
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function(e){
    if(window.r2store && window.r2store.all.installDismissed) return;
    e.preventDefault();
    deferred = e;
    var bar = document.createElement("div");
    bar.className = "installbar";
    bar.innerHTML = '<span>Put the app on your home screen</span>'+
      '<button class="btn btn-primary btn-sm" data-install>Install</button>'+
      '<button class="link-btn" data-dismiss>Not now</button>';
    document.body.appendChild(bar);
    bar.addEventListener("click", function(ev){
      if(ev.target.closest("[data-install]") && deferred){ deferred.prompt(); bar.remove(); }
      if(ev.target.closest("[data-dismiss]")){
        if(window.r2store) window.r2store.patch({installDismissed:true});
        bar.remove();
      }
    });
  });

  /* A cached app shell that never refreshes is worse than no cache at all: players
     keep seeing last week's build and think the app is broken. When a new service
     worker takes over, reload once so the fresh files are actually the ones running.
     Guarded on controller and on a flag, so a first install cannot loop. */
  if("serviceWorker" in navigator && location.protocol !== "file:"){
    var reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", function(){
      if(reloading) return;
      reloading = true;
      location.reload();
    });
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("sw.js").then(function(reg){
        /* catch a worker that installed while the tab was closed */
        if(reg.waiting && navigator.serviceWorker.controller) reg.waiting.postMessage("skip");
        reg.addEventListener("updatefound", function(){
          var sw = reg.installing;
          if(!sw) return;
          sw.addEventListener("statechange", function(){
            if(sw.state === "installed" && navigator.serviceWorker.controller) sw.postMessage("skip");
          });
        });
        /* and look for a new build each time the app is opened */
        reg.update().catch(function(){});
      }).catch(function(){});
    });
  }

  var y = document.getElementById("year");
  if(y) y.textContent = new Date().getFullYear();
})();
