/* The app. Player, coach and bar views over the same local state.
   Sample data in data.js, state in store.js, language in i18n.js, drawing in figure.js. */
(function(){
  "use strict";

  var D = window.R2, S = window.r2store, I = window.r2i18n;
  /* REAL: signed in with a real account, data comes from the database (backend.js).
     Otherwise the app runs on the sample club, for demos. */
  var PVB = window.PV, REAL = false;
  function oops(err){
    var m = (err && (err.message || err.error_description)) || "Something went wrong";
    if(/not enough points/i.test(m)) m = t("p.short");
    window.r2toast(m);
  }
  /* run a server action, then pull fresh data and redraw */
  function sync(promise, okMsg){
    return Promise.resolve(promise).then(function(res){
      return reload().then(function(){ if(okMsg) window.r2toast(okMsg); return res; });
    }).catch(function(err){ oops(err); return reload(); });
  }
  function reload(){
    if(!REAL) return Promise.resolve();
    return PVB.load().then(function(){
      renderAll(); drawAttendance();
      if(window.r2figure) window.r2figure.mount();
    });
  }
  var CODE_LIFE = 10 * 60 * 1000;   /* a kantine code is good for ten minutes */

  function $(s, r){ return (r || document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function fmt(n){ return Number(n).toLocaleString("en-US"); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
  function t(k, v){ return I.t(k, v); }
  function icon(d, size){
    return '<svg width="'+(size||18)+'" height="'+(size||18)+'" viewBox="0 0 22 22" fill="none" '+
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
  }
  function locale(){
    return {en:"en-US", es:"es-419", pt:"pt-BR", it:"it-IT", fr:"fr-FR", de:"de-DE", nl:"nl-NL", sv:"sv-SE"}[I.current] || "en-US";
  }
  function fmtDay(d){
    return new Intl.DateTimeFormat(locale(), {weekday:"short", day:"numeric", month:"short"}).format(d);
  }
  function fmtTime(d){
    return new Intl.DateTimeFormat(locale(), {hour:"2-digit", minute:"2-digit", hour12:false}).format(d);
  }

  /* A short tap on a real action. Silent where the browser has no vibrator,
     and skipped entirely for anyone who asked for less motion. */
  var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function haptic(ms){
    if(calm || !navigator.vibrate) return;
    try{ navigator.vibrate(ms || 12); }catch(e){}
  }

  function share(title, text, url){
    if(navigator.share){
      navigator.share({title:title, text:text, url:url}).catch(function(){});
      return true;
    }
    if(navigator.clipboard && url){
      navigator.clipboard.writeText(url).then(function(){ window.r2toast(t("c.share") + " \u2713"); }, function(){});
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- navigation */

  var NAV = [
    {id:"dash",     roles:"player", icon:'<path d="M3 10.5L11 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/>'},
    {id:"schedule", roles:"player", icon:'<rect x="3" y="4.5" width="16" height="15" rx="2"/><path d="M3 9h16M7.5 2.5v4M14.5 2.5v4"/>'},
    {id:"dev",      roles:"player", icon:'<path d="M4 18V9M9.5 18V4M15 18v-6M20.5 18v-9"/>'},
    {id:"pts",      roles:"player", icon:'<circle cx="11" cy="11" r="8"/><path d="M11 7v8M8 11h6"/>'},
    {id:"home",     roles:"player", icon:'<path d="M4 5h16v11H4z"/><path d="M10 8.5l4.5 3-4.5 3z"/>'},
    {id:"squad",    roles:"player", icon:'<path d="M3 19v-1.5C3 15 5 13.5 7.5 13.5S12 15 12 17.5V19M19 19v-1.5c0-2-1.3-3.3-3.2-3.8"/><circle cx="7.5" cy="8" r="3"/><path d="M15 5.2a3 3 0 0 1 0 5.6"/>'},
    {id:"coach",    roles:"player", icon:'<circle cx="8" cy="8" r="3.2"/><path d="M3 19c0-3 2.4-5 5-5s5 2 5 5M16 6.5a3 3 0 0 1 0 6M17 19c0-2.2-.9-3.9-2.3-4.6"/>'},
    {id:"staff",    roles:"coach", icon:'<path d="M4 11.5l4.5 4.5L18 6.5"/>'},
    {id:"players",  roles:"coach", icon:'<path d="M3 19v-1.5C3 15 5 13.5 7.5 13.5S12 15 12 17.5V19M19 19v-1.5c0-2-1.3-3.3-3.2-3.8"/><circle cx="7.5" cy="8" r="3"/><path d="M15 5.2a3 3 0 0 1 0 5.6"/>'},
    {id:"cschedule",roles:"coach", icon:'<rect x="3" y="4.5" width="16" height="15" rx="2"/><path d="M3 9h16M7.5 2.5v4M14.5 2.5v4"/>'},
    {id:"cdrills",  roles:"coach", icon:'<path d="M4 5h16v11H4z"/><path d="M10 8.5l4.5 3-4.5 3z"/>'},
    {id:"bar",      roles:"bar", icon:'<path d="M4 4h14l-6 7v7h3M4 4l6 7M8 18h4"/>'}
  ];

  /* ---------------------------------------------------------------- who is signed in
     No backend yet, so no real authentication: the email typed at the gate is looked up
     in D.ACCOUNTS and the account's role decides the views. Unknown emails are players.
     Real sign in later replaces findAccount() and signIn(), nothing else. */
  function findAccount(email){
    var e = String(email || "").trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(e)) return null;
    var hit = (D.ACCOUNTS || []).filter(function(a){ return a.email.toLowerCase() === e; })[0];
    if(hit) return hit;
    var name = e.split("@")[0].replace(/[._-]+/g, " ").trim().split(" ").map(function(w){
      return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ") || "Player";
    return {email:e, name:name, role:"player",
            initials:name.split(" ").map(function(w){ return w.charAt(0); }).join("").slice(0,3).toUpperCase()};
  }
  var account = S.all.account || null;
  var role = account ? account.role : "player";

  function navFor(r){
    var list = NAV.filter(function(n){ return n.roles.indexOf(r) !== -1; });
    return list;
  }

  function shortLabel(id){
    var k = "short." + id;
    return I.t(k) === k ? t("nav." + id) : t(k);
  }

  function buildNav(){
    var side = $("#sideNav"), tabs = $("#tabNav"), list = navFor(role);
    side.innerHTML = list.map(function(n){
      return '<button class="navbtn" data-go="'+n.id+'">'+icon(n.icon)+'<span>'+t("nav."+n.id)+'</span></button>';
    }).join("");
    /* Five slots. Anything past four goes behind More, so nothing is stranded off
       the bottom of a phone the way Coach tools used to be. */
    var inBar = list.length > 5 ? list.slice(0, 4) : list;
    tabs.innerHTML = inBar.map(function(n){
      return '<button class="tabbtn" data-go="'+n.id+'">'+icon(n.icon)+'<span>'+shortLabel(n.id)+'</span></button>';
    }).join("") + (list.length > 5 ?
      '<button class="tabbtn" id="moreTab">'+
      icon('<circle cx="4.5" cy="11" r="1.6"/><circle cx="11" cy="11" r="1.6"/><circle cx="17.5" cy="11" r="1.6"/>')+
      '<span>'+t("c.more")+'</span></button>' : "");
  }

  function openMore(){
    var list = navFor(role);
    modal('<div class="more-wrap"><div class="eyebrow">'+t("c.goTo")+'</div>'+
      '<div class="more-grid">'+list.map(function(n){
        return '<button class="more-btn" data-go="'+n.id+'" data-close>'+icon(n.icon, 20)+
               '<span>'+t("nav."+n.id)+'</span></button>';
      }).join("")+'</div>'+
      '<div class="langpick more-lang">'+I.langs.map(function(l){
        return '<button data-lang="'+l.id+'" class="'+(l.id===I.current?"on":"")+'" title="'+l.label+'">'+l.short+'</button>';
      }).join("")+'</div></div>');
  }

  /* language buttons inside the More sheet */
  document.addEventListener("click", function(e){
    var b = e.target.closest(".more-lang [data-lang]");
    if(!b) return;
    I.set(b.dataset.lang);
    $$(".more-lang [data-lang]").forEach(function(x){ x.classList.toggle("on", x === b); });
  });

  function show(id, push){
    var list = navFor(role);
    if(!list.some(function(n){ return n.id === id; })) id = list[0].id;
    if(id !== "bar" && typeof stopScan === "function" && scanning) stopScan();
    $$(".view").forEach(function(v){ v.classList.toggle("on", v.id === "v-" + id); });
    $$("[data-go]").forEach(function(x){ x.classList.toggle("active", x.dataset.go === id); });
    if(push && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    window.scrollTo({top:0, behavior: calm ? "auto" : "smooth"});
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#moreTab")){ openMore(); return; }
    var b = e.target.closest("[data-go]");
    if(!b) return;
    if(b.hasAttribute("data-close")) closeModal();
    show(b.dataset.go, true);
  });

  /* never leave the camera running behind another screen */
  document.addEventListener("visibilitychange", function(){
    if(document.hidden && typeof stopScan === "function") stopScan();
  });

  window.addEventListener("hashchange", function(){ route(location.hash.slice(1)); });

  function route(hash){
    if(hash.indexOf("verify-") === 0){
      if(REAL && role === "player"){ show("pts", false); return; }
      if(!REAL) setRole("bar");
      show("bar", false);
      var input = $("#barCode");
      if(input){ input.value = hash.slice(7).toUpperCase(); checkCode(); }
      return;
    }
    show(hash, false);
  }

  /* ---------------------------------------------------------------- role switch */

  function setRole(r){
    role = r;
    S.patch({role:r});
    document.body.dataset.role = r;
    buildNav();
    show(navFor(r)[0].id, true);
  }

  /* ---------------------------------------------------------------- points */

  function points(){ return S.club.points; }

  function paintPoints(){
    var v = points();
    $$("[data-points]").forEach(function(el){ el.textContent = fmt(v); });
    $$("[data-cost]").forEach(function(b){
      var short = v < parseInt(b.dataset.cost, 10);
      b.disabled = short;
      b.textContent = short ? t("p.short") : t("p.redeem");
    });
  }

  function award(n, label){
    S.addPoints(n);
    paintPoints();
    renderSquad();
    if(label) window.r2toast(label);
  }

  /* ---------------------------------------------------------------- dashboard */

  function feedHTML(rows, emptyMsg){
    if(!rows.length) return '<p class="empty">'+(emptyMsg || "")+'</p>';
    return rows.map(function(f){
      var tag = f.tap ? "button" : "div";
      return '<'+tag+' class="fitem'+(f.tap?" tap":"")+'"'+(f.tap?' data-open-code="'+f.tap+'"':'')+'>'+
        '<span class="fdot '+(f.c||"")+'"></span>'+
        '<div><div class="t">'+f.t+'</div><div class="d">'+f.d+'</div></div>'+
        (f.a ? '<div class="amt'+(f.neg?" neg":"")+'">'+f.a+'</div>' : '')+'</'+tag+'>';
    }).join("");
  }

  function ring(pct, label, sub){
    var r = 34, c = 2*Math.PI*r, off = c * (1 - Math.min(1, pct));
    return '<svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">'+
      '<circle cx="42" cy="42" r="'+r+'" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="9"/>'+
      '<circle cx="42" cy="42" r="'+r+'" fill="none" stroke="var(--sea)" stroke-width="9" stroke-linecap="round" '+
      'stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'" transform="rotate(-90 42 42)"/>'+
      '</svg><div class="ring-txt"><b>'+label+'</b><span>'+sub+'</span></div>';
  }

  function renderDash(){
    var next = D.SCHEDULE[0];
    var rs = next ? S.rsvp(next.id) : null;
    $("#nextWrap").innerHTML = next ?
      '<div><div class="eyebrow">'+t("d.next")+'</div>'+
      '<div class="when">'+fmtDay(next.date)+' &middot; '+fmtTime(next.date)+'</div>'+
      '<div class="meta">'+esc(next.court)+' &middot; '+esc(next.kind)+' &middot; '+esc(next.note)+'</div></div>'+
      '<div class="next-act">'+
        '<button class="btn '+(rs==="in"?"btn-primary":"btn-ghost")+' btn-sm" data-rsvp="in" data-sid="'+next.id+'">'+
          (rs==="in" ? "&#10003; " : "") + t("s.going")+'</button>'+
        '<button class="btn '+(rs==="out"?"btn-primary":"btn-ghost")+' btn-sm" data-rsvp="out" data-sid="'+next.id+'">'+t("d.cant")+'</button>'+
      '</div>' : "";

    var done = S.club.weekDrills || 0;
    var going = Object.keys(S.club.rsvp).filter(function(k){ return S.club.rsvp[k] === "in"; }).length;
    var pct = Math.min(1, (going + done) / 3);
    $("#weekGoal").innerHTML = ring(pct, Math.round(pct*100) + "%", t("d.goalSub"));

    $("#feed").innerHTML = feedHTML(D.FEED);
    renderNba();
    paintPoints();
  }

  /* One card, one thing to do. Beats a dashboard that shows six numbers and asks
     the player to work out what it wants from them. */
  function renderNba(){
    var el = $("#nba");
    if(!el) return;
    var next = D.SCHEDULE[0];
    var cheapest = D.SHOP.reduce(function(a,b){ return b.c < a.c ? b : a; }, D.SHOP[0]);
    var pick;

    if(next && !S.rsvp(next.id)){
      pick = {go:"schedule", label:t("d.nbaRsvp"), sub:fmtDay(next.date) + " · " + fmtTime(next.date)};
    } else if((S.club.weekDrills || 0) < 1){
      pick = {go:"home", label:t("d.nbaDrill"), sub:"+15 " + t("c.points")};
    } else if(cheapest && points() >= cheapest.c){
      pick = {go:"pts", label:t("d.nbaSpend"), sub:cheapest.n + " · " + fmt(cheapest.c) + " " + t("c.pts")};
    } else {
      pick = null;
    }

    if(!pick){ el.hidden = true; return; }
    el.hidden = false;
    el.dataset.go = pick.go;
    el.innerHTML = '<span class="nba-eye">'+t("d.doNext")+'</span>'+
      '<span class="nba-t">'+esc(pick.label)+'</span>'+
      '<span class="nba-s">'+esc(pick.sub)+'</span>'+
      '<svg class="nba-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg>';
  }

  function drawAttendance(){
    var s = '<svg viewBox="0 0 300 120" width="100%" role="img" aria-label="Attendance by week">';
    s += '<line x1="0" y1="86" x2="300" y2="86" stroke="rgba(255,255,255,.14)" stroke-width="1"/>';
    D.ATT.forEach(function(v,i){
      var x = i*25 + 4, h = v ? 58 : 14, y = 86 - h;
      s += '<rect x="'+x+'" y="'+y+'" width="17" height="'+h+'" rx="3" fill="'+(v?"#35C6D6":"rgba(255,255,255,.13)")+'">'+
           '<animate attributeName="height" from="0" to="'+h+'" dur="'+(0.35+i*0.04).toFixed(2)+'s" fill="freeze"/>'+
           '<animate attributeName="y" from="86" to="'+y+'" dur="'+(0.35+i*0.04).toFixed(2)+'s" fill="freeze"/></rect>';
      s += '<text x="'+(x+8.5)+'" y="104" font-size="9" font-family="IBM Plex Mono, monospace" fill="#9AA3AB" text-anchor="middle">'+(i+1)+'</text>';
    });
    s += '</svg>';
    $("#attChart").innerHTML = s;
    var pct = $("#attPct");
    if(pct) pct.textContent = Math.round(D.ATT.filter(Boolean).length / D.ATT.length * 100) + "%";
  }
  drawAttendance();

  /* ---------------------------------------------------------------- schedule */

  function ics(sess){
    function z(n){ return (n<10?"0":"") + n; }
    function stamp(d){
      return d.getUTCFullYear()+z(d.getUTCMonth()+1)+z(d.getUTCDate())+"T"+
             z(d.getUTCHours())+z(d.getUTCMinutes())+"00Z";
    }
    var body = [
      "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//PadelVitals//Padel//EN","BEGIN:VEVENT",
      "UID:"+sess.id+"@padelvitals",
      "DTSTAMP:"+stamp(new Date()),
      "DTSTART:"+stamp(sess.date),
      "DTEND:"+stamp(sess.end),
      "SUMMARY:"+sess.kind+" at Miami Padel Club",
      "LOCATION:"+sess.court,
      "DESCRIPTION:"+sess.coach+". "+sess.note,
      "END:VEVENT","END:VCALENDAR"
    ].join("\r\n");
    var url = URL.createObjectURL(new Blob([body], {type:"text/calendar"}));
    var a = document.createElement("a");
    a.href = url; a.download = "padel-" + sess.id + ".ics";
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
  }

  function renderSchedule(){
    $("#schedList").innerHTML = D.SCHEDULE.map(function(s){
      var rs = S.rsvp(s.id);
      var left = Math.max(0, s.cap - s.taken - (rs === "in" ? 1 : 0));
      var full = left === 0 && rs !== "in";
      return '<article class="sess'+(rs==="in"?" in":"")+(rs==="out"?" out":"")+'">'+
        '<div class="sess-when"><b>'+fmtDay(s.date)+'</b><span>'+fmtTime(s.date)+'</span></div>'+
        '<div class="sess-body">'+
          '<h4>'+esc(s.kind)+'</h4>'+
          '<div class="sess-meta">'+esc(s.court)+' &middot; '+esc(s.coach)+'</div>'+
          '<p>'+esc(s.note)+'</p>'+
          '<div class="chips"><span class="chip ochre">+'+s.pts+' '+t("c.pts")+'</span>'+
          '<span class="chip'+(full?"":" sea")+'">'+(full ? t("s.full") : left + " " + t("s.spots"))+'</span></div>'+
        '</div>'+
        '<div class="sess-act">'+
          '<button class="btn '+(rs==="in"?"btn-primary":"btn-ghost")+' btn-sm" data-rsvp="in" data-sid="'+s.id+'"'+(full?" disabled":"")+'>'+t("s.going")+'</button>'+
          '<button class="btn '+(rs==="out"?"btn-primary":"btn-ghost")+' btn-sm" data-rsvp="out" data-sid="'+s.id+'">'+t("s.notGoing")+'</button>'+
          '<button class="link-btn" data-ics="'+s.id+'">'+t("s.cal")+'</button>'+
        '</div></article>';
    }).join("");
  }

  document.addEventListener("click", function(e){
    var r = e.target.closest("[data-rsvp]");
    if(r && !r.disabled){
      var sid = r.dataset.sid, val = r.dataset.rsvp, was = S.rsvp(sid);
      S.setRsvp(sid, was === val ? null : val);
      if(REAL) sync(was === val ? PVB.act.clearRsvp(sid) : PVB.act.rsvp(sid, val));
      renderSchedule(); renderDash();
      var sess = D.SCHEDULE.filter(function(s){ return s.id === sid; })[0];
      if(val === "in" && was !== "in")
        window.r2toast(t("s.going") + " · " + fmtDay(sess.date) + " " + fmtTime(sess.date));
      if(val === "out" && was !== "out")
        window.r2toast(sess.coach + " · " + t("s.notGoing"));
      return;
    }
    var c = e.target.closest("[data-ics]");
    if(c){
      var s2 = D.SCHEDULE.filter(function(x){ return x.id === c.dataset.ics; })[0];
      if(s2) ics(s2);
    }
  });

  /* ---------------------------------------------------------------- development */

  function renderSkills(){
    var edits = S.club.skillEdits;
    $("#skills").innerHTML = D.SKILLS.map(function(s){
      var v = edits[s.n] != null ? edits[s.n] : s.v;
      var moved = edits[s.n] != null ? (v - s.v) : s.d;
      var delta = moved > 0 ? '<span class="up">&uarr; '+moved.toFixed(1)+'</span>'
                : moved < 0 ? '<span class="down">&darr; '+Math.abs(moved).toFixed(1)+'</span>'
                : t("v.noChange");
      /* Tapping a skill should show that shot being played, which is the whole point
         of having drawn the poses. Cards with no pose stay plain rather than lying. */
      var hist = (D.HISTORY && D.HISTORY[s.n]) || [];
      var hasClip = hist.length && hist[hist.length-1].video;
      return '<button class="skill tap" data-hist="'+esc(s.n)+'">'+
        '<div class="skill-top"><div><div class="skill-name">'+s.n+(hasClip ? ' <span class="clip-dot" title="Video">&#9654;</span>' : '')+'</div><div class="skill-es">'+s.es+'</div></div>'+
        '<div class="skill-score">'+(s.unrated ? "–" : v.toFixed(1))+'<small>/10</small></div></div>'+
        '<div class="track"><i style="width:'+(v*10)+'%"></i></div>'+
        '<div class="skill-foot"><span>'+delta+'</span><span>'+[s.by, s.on].filter(Boolean).join(' · ')+'</span></div>'+
        '<span class="skill-cue">'+t("v.progress")+
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>'+
        '</button>';
    }).join("");
  }

  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-shot-key]");
    if(!b || !window.r2figure) return;
    if(window.r2figure.showShot(b.dataset.shotKey)){
      haptic();
      var card = $("#pslides");
      if(card && card.scrollIntoView) card.scrollIntoView({block:"center", behavior: calm ? "auto" : "smooth"});
    }
  });

  function applyEdits(){
    var edits = S.club.skillEdits;
    D.BODY.forEach(function(b){ if(edits[b.k] != null) b.v = edits[b.k]; });
    D.SKILLS.forEach(function(s){
      if(edits[s.n] == null) return;
      D.RADAR.forEach(function(r){
        if(s.n.toLowerCase().indexOf(r.k.toLowerCase().slice(0,4)) === 0 ||
           s.es.toLowerCase().indexOf(r.k.toLowerCase().slice(0,4)) !== -1) r.me = edits[s.n];
      });
    });
  }

  /* ---------------------------------------------------------------- kantine */

  function newCode(){
    var s = "", abc = "ACDEFGHJKLMNPQRTUVWXY3479";
    for(var i=0;i<5;i++) s += abc[Math.floor(Math.random()*abc.length)];
    return s;
  }

  var codeTimer;

  function codeUrl(code){
    return location.origin + location.pathname + "#verify-" + code;
  }

  /* Pending codes that have not expired: what the player can still spend and what
     the bar is still waiting on. Same source of truth for both screens. */
  function liveCodes(){
    var now = Date.now();
    return S.club.redemptions.filter(function(r){
      return r.status !== "confirmed" && r.at + CODE_LIFE > now;
    });
  }

  function openCode(rec){
    var url = codeUrl(rec.code);
    var qr = window.r2qr ? window.r2qr.svg(url, {fg:"#0B0D0F", bg:"#FFFFFF"}) : "";
    modal(
      '<div class="code-wrap">'+
        '<div class="eyebrow">'+t("p.show")+'</div>'+
        '<h3>'+esc(rec.item)+'</h3>'+
        '<div class="qr">'+qr+'</div>'+
        '<div class="code-big">'+rec.code+'</div>'+
        '<div class="code-exp"><span id="codeLeft"></span></div>'+
        '<p class="code-note">'+fmt(rec.cost)+' '+t("c.points")+'</p>'+
        (navigator.share ? '<button class="btn btn-ghost btn-sm" data-share-code="'+rec.code+'">'+t("c.share")+'</button>' : '')+
      '</div>');
    clearInterval(codeTimer);
    function tick(){
      var el = $("#codeLeft");
      if(!el){ clearInterval(codeTimer); return; }
      var left = rec.at + CODE_LIFE - Date.now();
      if(left <= 0){
        el.textContent = t("p.expired");
        el.parentElement.classList.add("dead");
        clearInterval(codeTimer);
        renderLive(); renderQueue(); renderHistory();
        return;
      }
      var m = Math.floor(left/60000), s = Math.floor(left%60000/1000);
      el.textContent = t("p.expires") + " " + m + ":" + (s<10?"0":"") + s;
    }
    tick();
    codeTimer = setInterval(tick, 1000);
  }

  function renderShop(){
    $("#shop").innerHTML = D.SHOP.map(function(it,i){
      return '<div class="item"><div class="ico">'+it.ico+'</div><h4>'+it.n+'</h4>'+
        '<div class="sub">'+it.s+'</div><div class="cost">'+fmt(it.c)+' '+t("c.pts")+'</div>'+
        '<button data-cost="'+it.c+'" data-item="'+i+'">'+t("p.redeem")+'</button></div>';
    }).join("");
    paintPoints();
  }

  /* The player closes the QR, walks to the bar, and needs it again. Keep one live
     code in front of them with the clock running, instead of making them redeem twice. */
  var liveTimer;

  function renderLive(){
    var el = $("#liveCode");
    if(!el) return;
    var live = liveCodes()[0];
    clearInterval(liveTimer);
    if(!live){ el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;

    function paint(){
      var left = live.at + CODE_LIFE - Date.now();
      if(left <= 0){ clearInterval(liveTimer); renderLive(); renderHistory(); return; }
      var m = Math.floor(left/60000), sec = Math.floor(left%60000/1000);
      el.innerHTML =
        '<div class="lc-in">'+
          '<div><div class="eyebrow">'+t("p.live")+'</div>'+
          '<div class="lc-item">'+esc(live.item)+'</div>'+
          '<div class="lc-meta"><b>'+live.code+'</b> &middot; '+t("p.expires")+' '+m+':'+(sec<10?"0":"")+sec+'</div></div>'+
          '<button class="btn btn-primary btn-sm" data-open-code="'+live.code+'">'+t("p.showQr")+'</button>'+
        '</div>';
    }
    paint();
    liveTimer = setInterval(paint, 1000);
  }

  function renderHistory(){
    var df = new Intl.DateTimeFormat(locale(), {day:"numeric", month:"short"});
    var now = Date.now();
    var rows = S.club.redemptions.map(function(r){
      var pending = r.status !== "confirmed" && r.at + CODE_LIFE > now;
      var state = r.status === "confirmed" ? t("k.confirmed")
                : (pending ? t("p.tapShow") : t("p.expired"));
      return {c:"o", t:esc(r.item), tap: pending ? r.code : null,
              d:df.format(new Date(r.at)) + " · " + r.code + " · " + state,
              a:"-"+fmt(r.cost), neg:true};
    });
    $("#history").innerHTML = feedHTML(rows, t("p.empty"));
  }

  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-cost]");
    if(!b || b.disabled) return;
    var it = D.SHOP[parseInt(b.dataset.item, 10)];
    if(REAL){
      b.disabled = true;
      PVB.act.redeem(it.id).then(function(res){
        var rec = {code:res.code, item:it.n, cost:it.c, at:new Date(res.created_at).getTime(), status:"pending"};
        haptic(18);
        return reload().then(function(){ openCode(rec); });
      }).catch(function(err){ oops(err); reload(); });
      return;
    }
    S.addPoints(-it.c);
    var rec = {code:newCode(), item:it.n, cost:it.c, at:Date.now(), status:"pending"};
    S.addRedemption(rec);
    haptic(18);
    paintPoints(); renderHistory(); renderSquad(); renderLive(); renderQueue();
    openCode(rec);
  });

  /* reopening a code, and sharing one */
  document.addEventListener("click", function(e){
    var o = e.target.closest("[data-open-code]");
    if(o){
      var rec = S.findRedemption(o.dataset.openCode);
      if(rec) openCode(rec);
      return;
    }
    var sh = e.target.closest("[data-share-code]");
    if(sh){
      var c = sh.dataset.shareCode, r = S.findRedemption(c);
      share("Miami Padel Club", (r ? r.item + " · " : "") + c, codeUrl(c));
    }
  });

  /* ---------------------------------------------------------------- home training */

  var filter = "All";

  function renderDrills(){
    var list = D.DRILLS.filter(function(d){ return filter === "All" || d.lvl === filter; });
    $("#drills").innerHTML = list.map(function(d){
      var done = S.drillDone(d.id);
      return '<article class="drill'+(done?" complete":"")+'" data-drill="'+d.id+'">'+
        '<div class="thumb" style="background:'+d.g+'">'+
        '<div class="play"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l7 4.5-7 4.5z" fill="#F2F4F5"/></svg></div>'+
        '<span class="dur">'+d.dur+'</span></div>'+
        '<div class="drill-body"><h4>'+esc(d.n)+'</h4><div class="by">'+esc(d.by)+'</div>'+
        '<div class="chips"><span class="chip">'+d.lvl+'</span><span class="chip sea">'+d.kit+'</span></div>'+
        '<button class="done">'+(done ? "&#10003; " + t("h.done") : t("h.mark") + " +15")+'</button>'+
        '</div></article>';
    }).join("") ;
  }

  document.addEventListener("click", function(e){
    var f = e.target.closest("[data-f]");
    if(f){
      filter = f.dataset.f;
      $$("[data-f]").forEach(function(x){ x.classList.toggle("on", x.dataset.f === filter); });
      renderDrills();
      return;
    }
    var btn = e.target.closest(".drill .done");
    if(btn){
      var id = btn.closest(".drill").dataset.drill;
      if(S.drillDone(id)) return;
      if(REAL){
        S.toggleDrill(id); renderDrills();
        sync(PVB.act.completeDrill(id), D.DRILLS.filter(function(d){ return d.id === id; })[0].n + " · +" + (D.EARN[3] ? D.EARN[3].v : 15) + " " + t("c.points"));
        return;
      }
      S.toggleDrill(id);
      award(15, D.DRILLS.filter(function(d){ return d.id === id; })[0].n + " · +15 " + t("c.points"));
      renderDrills(); renderDash();
    }
  });

  /* ---------------------------------------------------------------- squad */

  function renderSquad(){
    var list = D.ROSTER.map(function(p){
      return Object.assign({}, p, {pts: p.me ? points() : p.pts});
    }).sort(function(a,b){ return b.pts - a.pts; });

    var el = $("#standings");
    if(el) el.innerHTML = list.map(function(p, i){
      return '<div class="rank'+(p.me?" me":"")+'">'+
        '<span class="pos">'+(i+1)+'</span>'+
        '<span class="avatar sm'+(i%2?" sea":"")+'">'+p.i+'</span>'+
        '<span class="who">'+esc(p.n)+(p.me?' <em>'+t("q.you")+'</em>':'')+
          '<small>'+p.group+' · '+p.rating.toFixed(2)+'</small></span>'+
        '<span class="fire">'+(p.streak>=10?"🔥 ":"")+p.streak+'</span>'+
        '<span class="pt">'+fmt(p.pts)+'</span></div>';
    }).join("");

    var b = $("#badges");
    if(b) b.innerHTML = D.BADGES.map(function(x){
      return '<div class="badge'+(x.got?"":" off")+'"><span class="bi">'+x.ic+'</span>'+
        '<b>'+esc(x.n)+'</b><small>'+esc(x.d)+'</small></div>';
    }).join("");
  }

  /* ---------------------------------------------------------------- coaches */

  function renderCoaches(){
    $("#coachList").innerHTML = D.COACHES.map(function(c,i){
      return '<div class="cprof"><div class="avatar lg'+(i%2?" sea":"")+'">'+c.i+'</div>'+
        '<div class="body"><div><h3>'+c.n+'</h3><div class="coach-role">'+c.r+'</div></div>'+
        '<p class="cbio">'+c.b+'</p>'+
        '<div class="chips">'+c.t.map(function(x){return '<span class="chip">'+x+'</span>';}).join("")+
        '<span class="chip sea">'+c.l+'</span></div>'+
        '<div class="row-btns">'+
        '<button class="btn btn-primary btn-sm" data-toast="'+esc(c.n)+' · '+esc(t("c.confirm"))+'">'+t("nav.coach")+'</button>'+
        '<button class="btn btn-ghost btn-sm" data-go="home">'+t("nav.home")+'</button></div></div></div>';
    }).join("");
  }

  /* ---------------------------------------------------------------- coach tools */

  var checkSession = D.SCHEDULE[0] ? D.SCHEDULE[0].id : "s0";
  var rosterQuery = "";
  var lastChecks = null;   /* one level of undo, because fat fingers on a wet phone */

  function sessionLabel(sess){
    return fmtDay(sess.date) + " · " + fmtTime(sess.date) + " · " + sess.kind;
  }

  function renderStaff(){
    var sel = $("#checkSession");
    if(sel && REAL){ sel.innerHTML = ""; if(!D.SCHEDULE.some(function(x){ return x.id === checkSession; })) checkSession = D.SCHEDULE[0] ? D.SCHEDULE[0].id : ""; }
    if(sel && !sel.options.length){
      sel.innerHTML = D.SCHEDULE.map(function(x){
        return '<option value="'+x.id+'">'+esc(sessionLabel(x))+'</option>';
      }).join("");
      sel.value = checkSession;
    }

    var checks = S.checks(checkSession);
    var q = rosterQuery.trim().toLowerCase();
    var list = D.ROSTER.filter(function(p){
      return !q || p.n.toLowerCase().indexOf(q) !== -1 || String(p.group).toLowerCase().indexOf(q) !== -1;
    });

    var total = D.ROSTER.length, on = Object.keys(checks).length;
    var cc = $("#checkCount");
    if(cc) cc.textContent = on + "/" + total + " " + t("t.checkedOf");

    $("#roster").innerHTML = list.length ? list.map(function(p){
      var isOn = !!checks[p.id];
      return '<button class="rrow'+(isOn?" on":"")+'" data-check="'+p.id+'">'+
        '<span class="avatar sm'+(isOn?"":" sea")+'">'+p.i+'</span>'+
        '<span class="who">'+esc(p.n)+'<small>'+p.group+'</small></span>'+
        '<span class="state">'+(isOn ? "&#10003; " + t("t.present") : t("t.in"))+'</span></button>';
    }).join("") : '<p class="empty">'+t("t.noPlayer")+'</p>';

    var sel2 = $("#assessPlayer");
    if(sel2 && REAL){ var keepP = sel2.value; sel2.innerHTML = ""; }
    if(sel2 && !sel2.options.length)
      sel2.innerHTML = D.ROSTER.map(function(p){ return '<option value="'+p.id+'">'+esc(p.n)+'</option>'; }).join("");
    if(sel2 && REAL && keepP) sel2.value = keepP;
    var sk = $("#assessSkill");
    if(sk && !sk.options.length)
      sk.innerHTML = D.SKILLS.map(function(s){ return '<option value="'+esc(s.n)+'">'+s.n+'</option>'; }).join("");
  }

  document.addEventListener("click", function(e){
    var c = e.target.closest("[data-check]");
    if(c){
      lastChecks = Object.assign({}, S.checks(checkSession));
      var on = S.checkIn(checkSession, c.dataset.check);
      var p = D.ROSTER.filter(function(x){ return x.id === c.dataset.check; })[0];
      if(REAL){
        haptic(); renderStaff();
        var mid = c.dataset.check;
        PVB.act[on ? "checkIn" : "undoCheckIn"](checkSession, mid).then(function(){
          window.r2toast(p.n.split(" ")[0] + " · " + (on ? t("t.present") : t("t.in")));
          return PVB.loadChecks();
        }).then(function(){ renderStaff(); }).catch(function(err){ oops(err); reload(); });
        return;
      }
      haptic();
      renderStaff();
      if(on && p.me) award(60, p.n.split(" ")[0] + " · +60 " + t("c.points"));
      else window.r2toast(p.n.split(" ")[0] + " · " + (on ? t("t.present") : t("t.in")));
      return;
    }
    if(e.target.closest("#checkAll")){
      lastChecks = Object.assign({}, S.checks(checkSession));
      var all = {};
      D.ROSTER.forEach(function(p){ all[p.id] = true; });
      if(REAL){
        var before = S.checks(checkSession);
        var todo = D.ROSTER.filter(function(p){ return !before[p.id]; });
        S.setChecks(checkSession, all); renderStaff();
        Promise.all(todo.map(function(p){ return PVB.act.checkIn(checkSession, p.id); }))
          .then(function(){ window.r2toast(D.ROSTER.length + " " + t("t.present").toLowerCase()); return PVB.loadChecks(); })
          .then(renderStaff).catch(function(err){ oops(err); reload(); });
        return;
      }
      S.setChecks(checkSession, all);
      haptic(18); renderStaff();
      window.r2toast(D.ROSTER.length + " " + t("t.present").toLowerCase(), t("c.undo"), undoChecks);
      return;
    }
    if(e.target.closest("#checkNone")){
      lastChecks = Object.assign({}, S.checks(checkSession));
      if(REAL){
        var were = Object.keys(S.checks(checkSession));
        S.setChecks(checkSession, {}); renderStaff();
        Promise.all(were.map(function(id){ return PVB.act.undoCheckIn(checkSession, id); }))
          .then(function(){ window.r2toast(t("t.clear")); return PVB.loadChecks(); })
          .then(renderStaff).catch(function(err){ oops(err); reload(); });
        return;
      }
      S.setChecks(checkSession, {});
      haptic(18); renderStaff();
      window.r2toast(t("t.clear"), t("c.undo"), undoChecks);
      return;
    }
    if(e.target.closest("#saveAssess")){
      var name = $("#assessSkill").value, val = parseFloat($("#assessVal").value);
      var who  = $("#assessPlayer").options[$("#assessPlayer").selectedIndex].text;
      if(REAL){
        var pid = $("#assessPlayer").value, note = ($("#assessNote").value || "").trim();
        if(!pid){ oops({message:t("t.noPlayer")}); return; }
        var jobs = [PVB.act.rate(pid, name, Math.round(val*10)/10)];
        if(note) jobs.push(PVB.act.note(pid, note));
        $("#assessNote").value = "";
        sync(Promise.all(jobs), who + " · " + name + " " + val.toFixed(1));
        return;
      }
      S.setSkill(name, val);
      applyEdits(); renderSkills();
      if(window.r2figure) window.r2figure.mount();
      window.r2toast(who + " · " + name + " " + val.toFixed(1));
      return;
    }
    if(e.target.closest("#publishDrill")){
      var nm = $("#drillName").value.trim();
      if(!nm){ $("#drillName").focus(); return; }
      if(REAL){
        var dr = {title:nm, level:$("#drillLvl").value, duration:$("#drillDur").value || "", kit:$("#drillKit").value || "",
                  video:($("#drillVideo") && $("#drillVideo").value.trim()) || ""};
        $("#drillName").value = ""; if($("#drillVideo")) $("#drillVideo").value = "";
        sync(PVB.act.drill(dr), nm + " · " + t("t.publish"));
        return;
      }
      D.DRILLS.unshift({
        id:"d" + Date.now(), n:nm, by:"Coach Diego",
        dur:$("#drillDur").value || "5:00",
        lvl:$("#drillLvl").value, kit:$("#drillKit").value || "Racket only",
        g:"linear-gradient(140deg,#262B31,#171A1E)"
      });
      $("#drillName").value = "";
      renderDrills(); renderCDrills();
      window.r2toast(nm + " · " + t("t.publish"));
    }
  });

  document.addEventListener("click", function(e){
    if(!e.target.closest("#addPlayer")) return;
    var em = ($("#newEmail").value || "").trim().toLowerCase(), nm2 = ($("#newName").value || "").trim();
    if(!/^\S+@\S+\.\S+$/.test(em)){ $("#newEmail").focus(); return; }
    var nmShow = nm2 || em.split("@")[0];
    if(!REAL){
      D.ROSTER.push({id:"p"+Date.now(), i:nmShow.split(" ").map(function(w){ return w.charAt(0); }).join("").slice(0,2).toUpperCase(),
                     n:nmShow, pts:0, streak:0, rating:1.5, group:$("#newGroup").value || "", status:"invited", email:em});
      window.r2toast(nmShow + " · " + t("t.added")); $("#newEmail").value = ""; $("#newName").value = "";
      $("#addPlayerCard").hidden = true; renderPlayers(); renderStaff(); return;
    }
    $("#newEmail").value = ""; $("#newName").value = ""; $("#addPlayerCard").hidden = true;
    sync(PVB.act.invite(em, nm2, "player", $("#newGroup").value || null), nmShow + " · " + t("t.added"));
  });

  function undoChecks(){
    if(!lastChecks) return;
    S.setChecks(checkSession, lastChecks);
    lastChecks = null;
    renderStaff();
  }

  document.addEventListener("input", function(e){
    if(e.target.id === "assessVal") $("#assessOut").textContent = parseFloat(e.target.value).toFixed(1);
    if(e.target.id === "barCode" && e.target.value.length >= 5) checkCode();
    if(e.target.id === "rosterFind"){ rosterQuery = e.target.value; renderStaff(); }
  });

  document.addEventListener("change", function(e){
    if(e.target.id === "checkSession"){ checkSession = e.target.value; rosterQuery = ""; 
      var f = $("#rosterFind"); if(f) f.value = "";
      renderStaff();
    }
  });

  document.addEventListener("keydown", function(e){
    if(e.key === "Enter" && e.target.id === "barCode"){ e.preventDefault(); checkCode(); }
  });

  /* ---------------------------------------------------------------- coach: players */

  var plQuery = "", plGroup = "", openPid = null, sheetSkill = null;
  var demoRatings = {};   /* demo only: what the coach scored this visit */
  var demoGoals = {};

  function seeded(str){ var h = 0; for(var i = 0; i < str.length; i++) h = (h*31 + str.charCodeAt(i)) | 0; return Math.abs(h); }

  /* demo players need believable numbers without a database */
  function demoDetail(p){
    var base = D.SKILLS;
    var skills = base.map(function(s){
      var own = demoRatings[p.id] && demoRatings[p.id][s.n];
      if(own) return own;
      if(p.me) return {n:s.n, v:s.v, d:s.d, on:s.on, unrated:false};
      var r = seeded(p.id + s.n);
      var v = Math.max(2, Math.min(9.5, p.rating * 1.75 + ((r % 21) - 10) / 10));
      return {n:s.n, v:Math.round(v*10)/10, d:((r % 9) - 3) / 10, on:"29 Sep", unrated:false};
    });
    demoExtras();
    if(!demoGoals[p.id]) demoGoals[p.id] = p.me ? D.GOALS : [];
    var hist = {};
    skills.forEach(function(sk){ hist[sk.n] = p.me && D.HISTORY[sk.n] ? D.HISTORY[sk.n] : [{v:sk.v, on:sk.on, video:null}]; });
    return {skills:skills, sessions:p.streak || 0, history:hist,
            goals: demoGoals[p.id].map(function(g){
              var cur = skills.filter(function(x){ return x.n === g.skill; })[0];
              return Object.assign({}, g, {now: cur ? cur.v : g.now, done: g.done || (cur && cur.v >= g.target)});
            }),
            notes: p.me ? [{body:"Bandeja is coming along. Keep the elbow high and finish the swing toward the side glass.", on:"29 Sep", by:"Diego Morales"}] : []};
  }

  function renderPlayers(){
    var list = $("#plList");
    if(!list) return;
    var groups = [];
    D.ROSTER.forEach(function(p){ if(p.group && groups.indexOf(p.group) === -1) groups.push(p.group); });
    $("#plGroups").innerHTML = groups.length > 1 ? ['',].concat(groups).map(function(g){
      return '<button class="'+(g === plGroup ? "on" : "")+'" data-plg="'+esc(g)+'">'+(g ? esc(g) : t("c.all"))+'</button>';
    }).join("") : "";
    $("#plGroups").hidden = groups.length < 2;
    var q = plQuery.trim().toLowerCase();
    var rows = D.ROSTER.filter(function(p){
      return (!plGroup || p.group === plGroup) && (!q || p.n.toLowerCase().indexOf(q) !== -1);
    }).slice().sort(function(a,b){ return a.n.localeCompare(b.n); });
    list.innerHTML = rows.length ? rows.map(function(p, i){
      return '<button class="pl-row" data-player="'+p.id+'">'+
        '<span class="avatar sm'+(i%2?" sea":"")+'">'+esc(p.i)+'</span>'+
        '<span class="who">'+esc(p.n)+'<small>'+esc(p.group || t("t.noGroup"))+(p.status === "invited" ? ' · '+t("t.invited") : '')+'</small></span>'+
        '<span class="pl-lv"><b>'+(Number(p.rating) || 0).toFixed(2)+'</b><small>'+t("t.level")+'</small></span>'+
        '<span class="pl-go" aria-hidden="true">&rsaquo;</span></button>';
    }).join("") : '<p class="empty">'+(D.ROSTER.length ? t("t.noPlayer") : t("t.noPlayersYet"))+'</p>';
    var ng = $("#newGroup");
    if(ng && REAL) ng.innerHTML = '<option value="">'+t("t.noGroup")+'</option>' + (D.GROUPS || []).map(function(g){ return '<option value="'+g.id+'">'+esc(g.name)+'</option>'; }).join("");
    else if(ng && !ng.options.length) ng.innerHTML = groups.map(function(g){ return '<option>'+esc(g)+'</option>'; }).join("");
  }

  function sheetHtml(p, det){
    var skills = det ? det.skills : [];
    if(!sheetSkill) sheetSkill = (skills.filter(function(s){ return s.unrated; })[0] || skills[0] || {n:D.SKILLS[0].n}).n;
    var cur = skills.filter(function(s){ return s.n === sheetSkill; })[0];
    var start = cur && !cur.unrated ? cur.v : 5;
    return '<div class="psheet">'+
      '<div class="ps-head"><span class="avatar lg">'+esc(p.i)+'</span><div><h3>'+esc(p.n)+'</h3>'+
        '<div class="muted small">'+esc(p.group || t("t.noGroup"))+(p.email ? ' · '+esc(p.email) : '')+'</div></div></div>'+
      '<div class="ps-stats">'+
        '<div class="ps-stat"><small>'+t("t.level")+'</small><div class="ps-level">'+
          '<button class="ps-step" data-lv="-0.25" aria-label="-">&minus;</button><b id="psLevel">'+(Number(p.rating)||0).toFixed(2)+'</b>'+
          '<button class="ps-step" data-lv="0.25" aria-label="+">+</button></div></div>'+
        '<div class="ps-stat"><small>'+t("t.sessions12")+'</small><b>'+(det ? det.sessions : "…")+'</b></div>'+
        '<div class="ps-stat"><small>'+t("c.points")+'</small><b>'+fmt(p.pts || 0)+'</b></div>'+
      '</div>'+
      (det ? '<div class="eyebrow ps-eb">'+t("t.tapSkill")+'</div><div class="ps-skills">'+skills.map(function(s){
        return '<button class="ps-skill'+(s.n === sheetSkill ? " on" : "")+'" data-pskill="'+esc(s.n)+'">'+
          '<span>'+esc(s.n)+((det.history && det.history[s.n] && det.history[s.n].length && det.history[s.n][det.history[s.n].length-1].video) ? ' <span class="clip-dot">&#9654;</span>' : '')+'</span>'+
          '<span class="track"><i style="width:'+(s.unrated ? 0 : s.v*10)+'%"></i></span>'+
          '<b>'+(s.unrated ? "–" : s.v.toFixed(1))+'</b>'+
          (s.d ? '<em class="'+(s.d > 0 ? "up" : "down")+'">'+(s.d > 0 ? "+" : "")+s.d.toFixed(1)+'</em>' : '<em></em>')+
        '</button>';
      }).join("")+'</div>'+
      '<div class="ps-rate">'+
        '<div class="ps-rate-hd"><b>'+esc(sheetSkill)+'</b><span class="ps-score" id="psOut">'+start.toFixed(1)+'</span></div>'+
        '<input type="range" id="psVal" min="0" max="10" step="0.1" value="'+start+'">'+
        '<textarea id="psNote" rows="2" placeholder="'+esc(t("t.notePh"))+'"></textarea>'+
        '<label class="clip-btn"><input type="file" accept="video/*" capture="environment" id="psClip">'+
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>'+
          '<span id="psClipName">'+t("t.addVideo")+'</span></label>'+
        '<button class="btn btn-primary" id="psSave">'+t("t.saveRating")+'</button>'+
      '</div>'+
      '<div class="eyebrow ps-eb">'+t("g.title")+'</div>'+
      '<div class="ps-goals">'+(det.goals.length ? det.goals.map(function(g){ return goalBar(Object.assign({coachCanDelete:true}, g)); }).join("") : '<p class="muted small">'+t("g.noneCoach")+'</p>')+'</div>'+
      '<div class="ps-goalform" id="psGoalForm" hidden>'+
        '<div class="field-row"><label class="field"><span>'+t("g.target")+' · '+esc(sheetSkill)+'</span><input type="number" id="psGoalT" min="0" max="10" step="0.1" value="'+Math.min(10, (start + 1)).toFixed(1)+'"></label>'+
        '<label class="field"><span>'+t("g.dueLabel")+'</span><input type="date" id="psGoalD"></label></div>'+
        '<button class="btn btn-primary btn-sm" id="psGoalSave">'+t("g.save")+'</button></div>'+
      '<button class="btn btn-ghost btn-sm" id="psGoalNew">'+t("g.new", {skill:sheetSkill})+'</button>'+
      '<div class="eyebrow ps-eb">'+t("v.notes")+'</div>'+
      (det.notes.length ? det.notes.map(function(n){
        return '<div class="ps-note"><p>'+esc(n.body)+'</p><small>'+esc(n.on)+(n.by ? ' · '+esc(n.by) : '')+'</small></div>';
      }).join("") : '<p class="muted small">'+t("t.noNotesYet")+'</p>')
      : '<p class="muted small ps-load">…</p>')+
      '<a class="btn btn-ghost btn-sm ps-report" href="'+reportUrl(p.id)+'" target="_blank" rel="noopener">'+t("r.open")+'</a>'+
    '</div>';
  }

  function openPlayer(pid, keepSkill){
    var p = D.ROSTER.filter(function(x){ return x.id === pid; })[0];
    if(!p) return;
    if(openPid !== pid || !keepSkill) sheetSkill = null;
    openPid = pid;
    if(!REAL){ modal(sheetHtml(p, demoDetail(p))); return; }
    if(!keepSkill) modal(sheetHtml(p, null));
    PVB.playerDetail(pid).then(function(det){
      if(openPid !== pid || $("#modal").hidden) return;
      $("#modalBody").innerHTML = sheetHtml(p, det);
    }).catch(oops);
  }

  document.addEventListener("click", function(e){
    var r = e.target.closest("[data-player]");
    if(r){ openPlayer(r.dataset.player); return; }
    var g = e.target.closest("[data-plg]");
    if(g){ plGroup = g.dataset.plg; renderPlayers(); return; }
    if(e.target.closest("#addToggle")){
      var c = $("#addPlayerCard"); c.hidden = !c.hidden;
      if(!c.hidden) setTimeout(function(){ $("#newName").focus(); }, 30);
      return;
    }
    var sk = e.target.closest("[data-pskill]");
    if(sk){
      sheetSkill = sk.dataset.pskill;
      $$(".ps-skill").forEach(function(b){ b.classList.toggle("on", b === sk); });
      var val = sk.querySelector("b").textContent;
      var v = val === "–" ? 5 : parseFloat(val);
      $(".ps-rate-hd b").textContent = sheetSkill;
      $("#psVal").value = v; $("#psOut").textContent = v.toFixed(1);
      return;
    }
    var lv = e.target.closest("[data-lv]");
    if(lv && openPid){
      var p = D.ROSTER.filter(function(x){ return x.id === openPid; })[0];
      var next = Math.max(0, Math.min(7, Math.round(((Number(p.rating)||0) + parseFloat(lv.dataset.lv))*100)/100));
      p.rating = next; $("#psLevel").textContent = next.toFixed(2);
      haptic();
      if(REAL){
        clearTimeout(lv._t);
        window.clearTimeout(window.__pvLv);
        var pid = openPid;
        window.__pvLv = setTimeout(function(){
          PVB.act.setLevel(pid, next).then(function(){ window.r2toast(p.n.split(" ")[0] + " · " + t("t.level") + " " + next.toFixed(2)); renderPlayers(); }).catch(oops);
        }, 700);
      } else renderPlayers();
      return;
    }
    if(e.target.closest("#psSave") && openPid){
      var pl = D.ROSTER.filter(function(x){ return x.id === openPid; })[0];
      var score = Math.round(parseFloat($("#psVal").value)*10)/10, note = ($("#psNote").value || "").trim();
      var skill = sheetSkill, msg = pl.n.split(" ")[0] + " · " + skill + " " + score.toFixed(1);
      haptic(18);
      if(!REAL){
        demoRatings[pl.id] = demoRatings[pl.id] || {};
        var was = demoDetail(pl).skills.filter(function(s){ return s.n === skill; })[0];
        demoRatings[pl.id][skill] = {n:skill, v:score, d: was ? Math.round((score - was.v)*10)/10 : 0, on:t("t.today"), unrated:false};
        if(pl.me){ S.setSkill(skill, score); applyEdits(); renderSkills(); }
        window.r2toast(msg);
        openPlayer(pl.id, true);
        return;
      }
      var clip = $("#psClip") && $("#psClip").files[0];
      $("#psSave").disabled = true;
      if(clip){ $("#psClipName").textContent = t("t.uploading"); }
      var up = clip ? PVB.act.uploadClip(pl.id, clip) : Promise.resolve(null);
      up.then(function(path){
        var jobs = [PVB.act.rateWithClip(pl.id, skill, score, path)];
        if(note) jobs.push(PVB.act.note(pl.id, note));
        return Promise.all(jobs);
      }).then(function(){ window.r2toast(msg + (clip ? " · ▶" : "")); openPlayer(pl.id, true); })
        .catch(function(err){ oops(err); $("#psSave").disabled = false; if(clip) $("#psClipName").textContent = clip.name; });
    }
  });

  document.addEventListener("input", function(e){
    if(e.target.id === "psVal") $("#psOut").textContent = parseFloat(e.target.value).toFixed(1);
    if(e.target.id === "plFind"){ plQuery = e.target.value; renderPlayers(); }
  });

  document.addEventListener("change", function(e){
    if(e.target.id !== "psClip") return;
    var f = e.target.files[0];
    if(!f) return;
    if(!REAL){ e.target.value = ""; window.r2toast(t("t.videoDemo")); return; }
    if(f.size > 50 * 1024 * 1024){ e.target.value = ""; window.r2toast(t("t.videoBig")); return; }
    $("#psClipName").textContent = f.name;
    e.target.closest(".clip-btn").classList.add("on");
  });

  document.addEventListener("click", function(e){
    if(e.target.closest("#psGoalNew")){ var f = $("#psGoalForm"); f.hidden = !f.hidden; return; }
    var del = e.target.closest("[data-delgoal]");
    if(del && openPid){
      if(!window.confirm(t("g.delete"))) return;
      if(!REAL){ demoGoals[openPid] = (demoGoals[openPid] || []).filter(function(g){ return g.id !== del.dataset.delgoal; }); openPlayer(openPid, true); return; }
      PVB.act.deleteGoal(del.dataset.delgoal).then(function(){ openPlayer(openPid, true); }).catch(oops);
      return;
    }
    if(e.target.closest("#psGoalSave") && openPid){
      var target = Math.round(parseFloat($("#psGoalT").value) * 10) / 10, due = $("#psGoalD").value || null;
      if(isNaN(target) || target < 0 || target > 10){ $("#psGoalT").focus(); return; }
      var cur = parseFloat(($(".ps-skill.on b") || {}).textContent) || 0;
      var pid = openPid, skill = sheetSkill;
      if(!REAL){
        demoGoals[pid] = demoGoals[pid] || [];
        demoGoals[pid].unshift({id:"g" + Date.now(), skill:skill, target:target, start:cur, now:cur, due:due, done:false});
        window.r2toast(t("g.set")); openPlayer(pid, true); return;
      }
      PVB.act.setGoal(pid, skill, target, cur, due).then(function(){ window.r2toast(t("g.set")); openPlayer(pid, true); }).catch(oops);
    }
  });

  /* ---------------------------------------------------------------- coach: schedule */

  var goingOpen = {};

  function renderCSchedule(){
    var el = $("#cschedList");
    if(!el) return;
    el.innerHTML = D.SCHEDULE.length ? D.SCHEDULE.map(function(s){
      var taken = s.taken || 0, open = goingOpen[s.id];
      return '<article class="sess csess">'+
        '<div class="sess-when"><b>'+fmtDay(s.date)+'</b><span>'+fmtTime(s.date)+'</span></div>'+
        '<div class="sess-body">'+
          '<h4>'+esc(s.kind)+'</h4>'+
          '<div class="sess-meta">'+[s.court, s.coach].filter(Boolean).map(esc).join(' &middot; ')+'</div>'+
          '<div class="cs-fill"><span class="track"><i style="width:'+Math.min(100, s.cap ? taken/s.cap*100 : 0)+'%"></i></span>'+
          '<b>'+taken+'/'+(s.cap || "–")+'</b> <small>'+t("t.coming")+'</small></div>'+
          (open ? '<div class="cs-names">'+(open === "…" ? "…" : (open.length ? open.map(esc).join(", ") : t("t.nobody")))+'</div>' : '')+
        '</div>'+
        '<div class="sess-act">'+
          '<button class="btn btn-primary btn-sm" data-checkfor="'+s.id+'">'+t("t.checkTitle")+'</button>'+
          '<button class="btn btn-ghost btn-sm" data-who="'+s.id+'">'+(open ? t("t.hide") : t("t.whoComing"))+'</button>'+
        '</div></article>';
    }).join("") : '<p class="empty">'+t("t.noSessions")+'</p>';
  }

  document.addEventListener("click", function(e){
    var w = e.target.closest("[data-who]");
    if(w){
      var sid = w.dataset.who;
      if(goingOpen[sid]){ delete goingOpen[sid]; renderCSchedule(); return; }
      if(!REAL){
        var s = D.SCHEDULE.filter(function(x){ return x.id === sid; })[0];
        var pool = D.ROSTER.slice().sort(function(a,b){ return seeded(sid+a.id) - seeded(sid+b.id); });
        goingOpen[sid] = pool.slice(0, Math.min(pool.length, s.taken || 0)).map(function(p){ return p.n; }).sort();
        renderCSchedule(); return;
      }
      goingOpen[sid] = "…"; renderCSchedule();
      PVB.going(sid).then(function(names){ goingOpen[sid] = names; renderCSchedule(); }).catch(function(err){ delete goingOpen[sid]; oops(err); renderCSchedule(); });
      return;
    }
    var c = e.target.closest("[data-checkfor]");
    if(c){
      checkSession = c.dataset.checkfor;
      var sel = $("#checkSession"); if(sel) sel.value = checkSession;
      rosterQuery = ""; var f = $("#rosterFind"); if(f) f.value = "";
      renderStaff(); show("staff", true);
    }
  });

  /* ---------------------------------------------------------------- coach: drills */

  var drillDoneCounts = {};

  function renderCDrills(){
    var el = $("#cdrillList");
    if(!el) return;
    el.innerHTML = D.DRILLS.length ? D.DRILLS.map(function(d){
      var n = REAL ? (drillDoneCounts[d.id] || 0) : seeded(d.id) % Math.max(1, D.ROSTER.length);
      return '<div class="cd-row"><div><b>'+esc(d.n)+'</b><small>'+[d.lvl, d.dur, d.kit].filter(Boolean).map(esc).join(' · ')+'</small></div>'+
        '<span class="chip sea">'+n+' '+t("t.done")+'</span></div>';
    }).join("") : '<p class="muted small">'+t("t.noDrills")+'</p>';
  }
  function refreshDrillCounts(){
    if(!REAL || role !== "coach") return;
    PVB.drillCounts().then(function(c){ drillDoneCounts = c; renderCDrills(); }).catch(function(){});
  }

  /* ================================================================ demo extras
     The sample club needs history, goals and notifications too, or the demo lies. */
  function demoExtras(){
    if(REAL || D.__extras) return;
    D.__extras = true;
    var days = [168, 126, 84, 42, 14];
    D.HISTORY = {};
    D.SKILLS.forEach(function(sk){
      var r = seeded(sk.n), end = sk.v, startV = Math.max(1.5, end - 1.2 - (r % 10) / 10);
      D.HISTORY[sk.n] = days.map(function(d, i){
        var v = i === days.length - 1 ? end : Math.round((startV + (end - startV) * (i / (days.length - 1)) + ((r >> i) % 5 - 2) / 10) * 10) / 10;
        var at = new Date(Date.now() - d * 864e5);
        return {v:Math.max(0, Math.min(10, v)), at:at.toISOString(), on:at.toLocaleDateString(locale(), {day:"numeric", month:"short"}), video:null};
      });
    });
    D.GOALS = [
      {id:"g1", skill:"Víbora", target:6.5, start:4.2, now:4.9, due:"2026-12-15", done:false},
      {id:"g2", skill:"Bandeja", target:6.0, start:5.1, now:6.4, due:"2026-10-31", done:true}
    ];
    var ago = function(h){ return new Date(Date.now() - h * 36e5).toISOString(); };
    D.NOTIFS = [
      {id:"n1", kind:"rating", data:{by:"Diego Morales", shots:[{skill:"Bandeja", score:6.4}, {skill:"Wall exit", score:7.1}]}, read_at:null, created_at:ago(3)},
      {id:"n2", kind:"drill", data:{title:"Wall control, 50 touches"}, read_at:null, created_at:ago(20)},
      {id:"n3", kind:"goaldone", data:{skill:"Bandeja", target:6.0}, read_at:ago(30), created_at:ago(50)},
      {id:"n4", kind:"levelup", data:{level:3.25, from:3.0}, read_at:ago(200), created_at:ago(240)}
    ];
  }

  /* ================================================================ progress per shot */

  function lineChart(points, goal){
    if(!points.length) return '<p class="muted small">'+t("v.noRatings")+'</p>';
    var W = 320, H = 150, px = 18, py = 16;
    var xs = points.length === 1 ? [W/2] : points.map(function(_, i){ return px + i * (W - 2*px) / (points.length - 1); });
    var y = function(v){ return H - py - (v / 10) * (H - 2*py); };
    var path = points.map(function(p, i){ return (i ? "L" : "M") + xs[i].toFixed(1) + " " + y(p.v).toFixed(1); }).join(" ");
    var area = path + " L" + xs[xs.length-1].toFixed(1) + " " + (H-py) + " L" + xs[0].toFixed(1) + " " + (H-py) + " Z";
    var grid = [2,4,6,8].map(function(g){ return '<line x1="0" x2="'+W+'" y1="'+y(g)+'" y2="'+y(g)+'" class="lc-grid"/><text x="2" y="'+(y(g)-3)+'" class="lc-ax">'+g+'</text>'; }).join("");
    var gl = goal ? '<line x1="0" x2="'+W+'" y1="'+y(goal)+'" y2="'+y(goal)+'" class="lc-goal"/><text x="'+(W-4)+'" y="'+(y(goal)-4)+'" class="lc-goal-t" text-anchor="end">'+t("g.target")+' '+goal.toFixed(1)+'</text>' : '';
    var dots = points.map(function(p, i){
      return '<circle cx="'+xs[i].toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="'+(i === points.length-1 ? 5 : 3.5)+'" class="lc-dot'+(p.video ? ' vid' : '')+'"/>';
    }).join("");
    return '<svg class="lchart" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(t("v.progress"))+'">'+
      '<defs><linearGradient id="lcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#C8F542" stop-opacity=".28"/><stop offset="1" stop-color="#C8F542" stop-opacity="0"/></linearGradient></defs>'+
      grid + gl + '<path d="'+area+'" fill="url(#lcg)"/><path d="'+path+'" class="lc-line"/>' + dots +
      '</svg><div class="lc-dates"><span>'+esc(points[0].on)+'</span><span>'+esc(points[points.length-1].on)+'</span></div>';
  }

  function goalBar(g){
    var span = Math.max(0.1, g.target - g.start), pct = Math.max(0, Math.min(100, (g.now - g.start) / span * 100));
    if(g.done) pct = 100;
    var due = g.due ? new Date(g.due + "T12:00:00").toLocaleDateString(locale(), {day:"numeric", month:"short"}) : "";
    return '<div class="fgoal'+(g.done ? " done" : "")+'">'+
      '<div class="fgoal-hd"><b>'+esc(g.skill)+'</b><span>'+(g.done ? '&#10003; '+t("g.reached") : g.now.toFixed(1)+' &rarr; <b>'+g.target.toFixed(1)+'</b>')+'</span></div>'+
      '<div class="track"><i style="width:'+pct+'%"></i></div>'+
      (due && !g.done ? '<small>'+t("g.by")+' '+esc(due)+'</small>' : '')+
      (g.coachCanDelete ? '<button class="fgoal-x" data-delgoal="'+g.id+'" aria-label="Remove">&times;</button>' : '')+
    '</div>';
  }

  function renderGoals(){
    demoExtras();
    var list = (D.GOALS || []);
    var html = list.length ? list.map(goalBar).join("") : '<p class="muted small">'+t("g.none")+'</p>';
    ["#goalsDash", "#goalsDev"].forEach(function(sel){ var el = $(sel); if(el) el.innerHTML = html; });
    $$(".goals-card").forEach(function(c){ c.hidden = role !== "player"; });
  }

  function openHistory(skill){
    demoExtras();
    var pts = (D.HISTORY && D.HISTORY[skill]) || [];
    var goal = (D.GOALS || []).filter(function(g){ return g.skill === skill && !g.done; })[0];
    var last = pts[pts.length-1], first = pts[0];
    var gain = last && first && pts.length > 1 ? last.v - first.v : 0;
    var hasShot = window.r2figure && window.r2figure.shotIndex(skill) >= 0;
    modal('<div class="hist">'+
      '<div class="eyebrow">'+t("v.progress")+'</div>'+
      '<div class="hist-hd"><h3>'+esc(skill)+'</h3><span class="hist-now">'+(last ? last.v.toFixed(1) : "–")+'<small>/10</small></span></div>'+
      (pts.length > 1 ? '<p class="muted small">'+(gain >= 0 ? '+' : '')+gain.toFixed(1)+' '+t("v.since")+' '+esc(first.on)+'</p>' : '')+
      lineChart(pts, goal ? goal.target : 0)+
      (goal ? goalBar(goal) : '')+
      (last && last.video ? '<div class="hist-vid" id="histVid"><div class="eyebrow">'+t("v.coachVideo")+'</div><p class="muted small">…</p></div>' : '')+
      '<div class="hist-list">'+pts.slice().reverse().map(function(p){
        return '<div class="hl-row"><span>'+esc(p.on)+'</span>'+(p.video ? '<button class="link-btn" data-clip="'+esc(p.video)+'">&#9654; '+t("v.video")+'</button>' : '<span></span>')+'<b>'+p.v.toFixed(1)+'</b></div>';
      }).join("")+'</div>'+
      (hasShot ? '<button class="btn btn-ghost btn-sm" data-close data-showshot="'+esc(skill)+'">'+t("v.seeShot")+'</button>' : '')+
    '</div>');
    if(last && last.video) playClip(last.video, "#histVid");
  }

  function playClip(path, into){
    if(!REAL) return;
    PVB.act.clipUrl(path).then(function(url){
      var box = $(into);
      if(box) box.innerHTML = '<div class="eyebrow">'+t("v.coachVideo")+'</div><video src="'+esc(url)+'" controls playsinline preload="metadata"></video>';
    }).catch(oops);
  }

  document.addEventListener("click", function(e){
    var h = e.target.closest("[data-hist]");
    if(h){ openHistory(h.dataset.hist); return; }
    var c = e.target.closest("[data-clip]");
    if(c){
      var host = c.closest(".hist, .psheet");
      var box = host && host.querySelector(".clipbox");
      if(!box && host){ box = document.createElement("div"); box.className = "clipbox"; box.id = "clipbox" + Date.now(); c.closest(".hl-row, .ps-skill, div").after(box); }
      if(box){ if(!box.id) box.id = "clipbox" + Date.now(); playClip(c.dataset.clip, "#" + box.id); }
      return;
    }
    var sh = e.target.closest("[data-showshot]");
    if(sh && window.r2figure){
      setTimeout(function(){
        if(window.r2figure.showShot(sh.dataset.showshot)){
          var card = $("#pslides"); if(card) card.scrollIntoView({block:"center", behavior: calm ? "auto" : "smooth"});
        }
      }, 60);
    }
  });

  /* ================================================================ notifications */

  function notifText(n){
    var d = n.data || {};
    switch(n.kind){
      case "rating":
        var shots = (d.shots || []).map(function(x){ return x.skill + " " + Number(x.score).toFixed(1); }).join(", ");
        return {ic:"&#9733;", t: t("n.rating", {by: (d.by || t("c.coach")).split(" ")[0]}), s: shots + (d.video ? " · &#9654;" : ""), go:"dev"};
      case "note":     return {ic:"&#9998;", t: t("n.note", {by: (d.by || t("c.coach")).split(" ")[0]}), s: d.body || "", go:"dev"};
      case "drill":    return {ic:"&#9654;", t: t("n.drill"), s: d.title || "", go:"home"};
      case "goal":     return {ic:"&#9678;", t: t("n.goal"), s: d.skill + " → " + Number(d.target).toFixed(1), go:"dev"};
      case "goaldone": return {ic:"&#10003;", t: t("n.goaldone"), s: d.skill + " " + Number(d.target).toFixed(1), go:"dev"};
      case "levelup":  return {ic:"&#9650;", t: t("n.levelup", {level: Number(d.level).toFixed(2)}), s: t("n.share"), go:"share"};
      default:         return {ic:"&#8226;", t: n.kind, s:"", go:""};
    }
  }

  function unread(){ return (D.NOTIFS || []).filter(function(n){ return !n.read_at; }).length; }

  function paintBell(){
    var b = $("#bellBtn");
    if(!b) return;
    b.hidden = role !== "player";
    var u = unread(), badge = $("#bellCount");
    badge.hidden = !u; badge.textContent = u > 9 ? "9+" : u;
  }

  function ago(iso){
    var m = Math.round((Date.now() - new Date(iso)) / 60000);
    if(m < 60) return Math.max(1, m) + " min";
    if(m < 1440) return Math.round(m/60) + " h";
    return new Date(iso).toLocaleDateString(locale(), {day:"numeric", month:"short"});
  }

  function openBell(){
    demoExtras();
    var list = D.NOTIFS || [];
    modal('<div class="bell-sheet"><h3>'+t("n.title")+'</h3>'+
      (list.length ? list.map(function(n){
        var x = notifText(n);
        return '<button class="nrow'+(n.read_at ? "" : " new")+'" data-ngo="'+x.go+'" data-close>'+
          '<span class="nic">'+x.ic+'</span><span class="nbody"><b>'+esc(x.t)+'</b><small>'+x.s+'</small></span>'+
          '<span class="nago">'+ago(n.created_at)+'</span></button>';
      }).join("") : '<p class="muted small">'+t("n.empty")+'</p>')+
      pushOffer()+
    '</div>');
    var had = unread();
    list.forEach(function(n){ if(!n.read_at) n.read_at = new Date().toISOString(); });
    paintBell();
    if(REAL && had) PVB.act.markRead().catch(function(){});
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#bellBtn")){ openBell(); return; }
    var g = e.target.closest("[data-ngo]");
    if(g){
      var go = g.dataset.ngo;
      if(go === "share") setTimeout(shareCard, 80);
      else if(go) show(go, true);
    }
  });

  /* phone notifications: only offered where the browser can do it */
  var VAPID = "";   /* public key, set once phone push is switched on for the platform */
  function pushOffer(){
    if(!REAL || !VAPID || !("serviceWorker" in navigator) || !("PushManager" in window)) return "";
    if(typeof Notification !== "undefined" && Notification.permission === "granted") return "";
    return '<button class="btn btn-primary btn-sm push-on" id="pushOn">'+t("n.phone")+'</button>';
  }
  function b64u(s){ var p = "=".repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, function(c){ return c.charCodeAt(0); }); }
  document.addEventListener("click", function(e){
    if(!e.target.closest("#pushOn")) return;
    Notification.requestPermission().then(function(p){
      if(p !== "granted") return;
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64u(VAPID)});
      }).then(function(sub){ return PVB.act.savePush(sub); }).then(function(){ window.r2toast(t("n.phoneOn")); closeModal(); });
    }).catch(oops);
  });

  /* ================================================================ share card */

  function roundRect(x, c, y, w, h, r){ x.beginPath(); x.moveTo(c+r, y); x.arcTo(c+w, y, c+w, y+h, r); x.arcTo(c+w, y+h, c, y+h, r); x.arcTo(c, y+h, c, y, r); x.arcTo(c, y, c+w, y, r); x.closePath(); }

  function drawCard(){
    var W = 1080, H = 1350, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    var volt = "#C8F542", ink = "#0B0D0F";
    x.fillStyle = ink; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W*0.8, H*0.15, 50, W*0.8, H*0.15, 900);
    g.addColorStop(0, "rgba(200,245,66,.22)"); g.addColorStop(1, "rgba(200,245,66,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    /* pulse line */
    x.strokeStyle = volt; x.lineWidth = 10; x.lineJoin = "round"; x.lineCap = "round";
    x.beginPath(); [[0,250],[300,250],[360,170],[430,360],[510,90],[580,310],[640,250],[W,250]].forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.stroke();

    var club = (REAL && D.ME && D.ME.club && D.ME.club.name) || $("#acadName").textContent || "Padel Vitals";
    var name = (account && account.name) || D.PLAYER.name;
    var lvl = (REAL && D.ME) ? D.ME.level : (D.ROSTER.filter(function(p){ return p.me; })[0] || {rating:3.25}).rating;
    x.fillStyle = "#9AA3AB"; x.font = "600 34px 'IBM Plex Mono', monospace";
    x.fillText(club.toUpperCase(), 80, 470);
    x.fillStyle = "#F2F4F5"; x.font = "700 78px 'Instrument Sans', sans-serif";
    x.fillText(name, 80, 560);
    x.fillStyle = volt; x.font = "400 300px Anton, Impact, sans-serif";
    x.fillText(Number(lvl).toFixed(2), 70, 880);
    x.fillStyle = "#F2F4F5"; x.font = "600 40px 'IBM Plex Mono', monospace";
    x.fillText(t("share.level").toUpperCase(), 84, 940);

    var top = D.SKILLS.filter(function(s){ return !s.unrated; }).slice().sort(function(a,b){ return b.v - a.v; }).slice(0, 3);
    top.forEach(function(s, i){
      var y = 1010 + i * 82;
      x.fillStyle = "#F2F4F5"; x.font = "600 36px 'Instrument Sans', sans-serif"; x.fillText(s.n, 84, y + 28);
      x.fillStyle = "rgba(255,255,255,.12)"; roundRect(x, 420, y + 6, 470, 22, 11); x.fill();
      x.fillStyle = volt; roundRect(x, 420, y + 6, Math.max(22, 470 * s.v / 10), 22, 11); x.fill();
      x.fillStyle = "#F2F4F5"; x.font = "400 44px Anton, Impact, sans-serif"; x.fillText(s.v.toFixed(1), 920, y + 32);
    });
    x.fillStyle = "#9AA3AB"; x.font = "600 30px 'IBM Plex Mono', monospace";
    x.fillText("PADELVITALS.COM", 84, H - 70);
    x.fillStyle = volt; x.font = "400 44px Anton, Impact, sans-serif"; x.textAlign = "right";
    x.fillText("PADEL VITALS", W - 80, H - 66); x.textAlign = "left";
    return cv;
  }

  function shareCard(){
    var f = document.fonts ? Promise.all(["300px Anton", "700 78px 'Instrument Sans'", "600 34px 'IBM Plex Mono'"].map(function(x){
      return document.fonts.load(x).catch(function(){}); })) : Promise.resolve();
    f.then(shareCardNow);
  }
  function shareCardNow(){
    var cv = drawCard();
    cv.toBlob(function(blob){
      var file = new File([blob], "padel-vitals-level.png", {type:"image/png"});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        navigator.share({files:[file], text: t("share.text")}).catch(function(){});
        return;
      }
      var url = URL.createObjectURL(blob);
      modal('<div class="share-prev"><img src="'+url+'" alt=""><a class="btn btn-primary" href="'+url+'" download="padel-vitals-level.png">'+t("share.save")+'</a></div>');
    }, "image/png");
  }
  document.addEventListener("click", function(e){ if(e.target.closest("[data-sharecard]")) shareCard(); });

  /* a level up the player has not celebrated yet gets offered once */
  function levelUpCheck(){
    if(!REAL || role !== "player" || !D.ME) return;
    var key = "pv.seenLevel." + D.ME.id, seen = null;
    try{ seen = parseFloat(localStorage.getItem(key)); }catch(e){}
    var now = Number(D.ME.level) || 0;
    try{ localStorage.setItem(key, String(now)); }catch(e){}
    if(seen != null && !isNaN(seen) && now > seen){
      modal('<div class="lvup"><div class="eyebrow">'+t("n.levelupT")+'</div><div class="lvup-n">'+now.toFixed(2)+'</div>'+
        '<p class="muted">'+t("share.text")+'</p><button class="btn btn-primary" data-sharecard>'+t("n.share")+'</button></div>');
    }
  }

  /* ================================================================ coach: rate the whole group */

  var grSkill = null, grVals = {};

  function groupList(){
    var checks = S.checks(checkSession), ids = Object.keys(checks);
    var list = ids.length ? D.ROSTER.filter(function(p){ return checks[p.id]; }) : D.ROSTER.slice();
    return list.sort(function(a,b){ return a.n.localeCompare(b.n); });
  }

  function groupRateHtml(){
    if(!grSkill) grSkill = D.SKILLS[0].n;
    var list = groupList(), any = Object.keys(S.checks(checkSession)).length;
    var sess = D.SCHEDULE.filter(function(x){ return x.id === checkSession; })[0];
    var done = Object.keys(grVals).length;
    return '<div class="grate">'+
      '<div class="eyebrow">'+(sess ? esc(sessionLabel(sess)) : "")+'</div>'+
      '<h3>'+t("gr.title")+'</h3>'+
      '<p class="muted small">'+(any ? t("gr.checked", {n:list.length}) : t("gr.all"))+'</p>'+
      '<div class="gr-skills">'+D.SKILLS.map(function(s){
        return '<button class="'+(s.n === grSkill ? "on" : "")+'" data-grskill="'+esc(s.n)+'">'+esc(s.n)+'</button>';
      }).join("")+'</div>'+
      '<div class="gr-list">'+list.map(function(p){
        var v = grVals[p.id];
        return '<div class="gr-row'+(v != null ? " set" : "")+'"><span class="who">'+esc(p.n)+'</span>'+
          '<input type="range" min="0" max="10" step="0.1" value="'+(v != null ? v : 5)+'" data-grp="'+p.id+'" aria-label="'+esc(p.n)+'">'+
          '<b data-grout="'+p.id+'">'+(v != null ? v.toFixed(1) : "–")+'</b>'+
          (v != null ? '<button class="gr-skip" data-grskip="'+p.id+'" aria-label="Skip">&times;</button>' : '<span></span>')+'</div>';
      }).join("")+'</div>'+
      '<button class="btn btn-primary gr-save" id="grSave"'+(done ? '' : ' disabled')+'>'+t("gr.save", {n:done, skill:grSkill})+'</button>'+
      '<p class="muted small gr-hint">'+t("gr.hint")+'</p>'+
    '</div>';
  }

  function openGroupRate(){ grVals = {}; modal(groupRateHtml()); }
  function repaintGroup(){ var y = $(".sheet") ? $(".sheet").scrollTop : 0; $("#modalBody").innerHTML = groupRateHtml(); if($(".sheet")) $(".sheet").scrollTop = y; }

  document.addEventListener("click", function(e){
    if(e.target.closest("#groupRate")){ openGroupRate(); return; }
    var sk = e.target.closest("[data-grskill]");
    if(sk){
      if(Object.keys(grVals).length && grSkill !== sk.dataset.grskill && !window.confirm(t("gr.switch"))) return;
      grSkill = sk.dataset.grskill; grVals = {}; repaintGroup(); return;
    }
    var sp = e.target.closest("[data-grskip]");
    if(sp){ delete grVals[sp.dataset.grskip]; repaintGroup(); return; }
    if(e.target.closest("#grSave")){
      var ids = Object.keys(grVals), skill = grSkill;
      if(!ids.length) return;
      var rows = ids.map(function(id){ return {player:id, skill:skill, score:Math.round(grVals[id]*10)/10}; });
      haptic(24);
      if(!REAL){
        rows.forEach(function(r){
          demoRatings[r.player] = demoRatings[r.player] || {};
          demoRatings[r.player][skill] = {n:skill, v:r.score, d:0, on:t("t.today"), unrated:false};
          var p = D.ROSTER.filter(function(x){ return x.id === r.player; })[0];
          if(p && p.me){ S.setSkill(skill, r.score); applyEdits(); renderSkills(); }
        });
        closeModal(); window.r2toast(t("gr.saved", {n:rows.length, skill:skill})); return;
      }
      $("#grSave").disabled = true;
      PVB.act.rateMany(rows).then(function(){ closeModal(); window.r2toast(t("gr.saved", {n:rows.length, skill:skill})); })
        .catch(function(err){ oops(err); var b = $("#grSave"); if(b) b.disabled = false; });
    }
  });
  document.addEventListener("input", function(e){
    var r = e.target.closest("[data-grp]");
    if(!r) return;
    var id = r.dataset.grp, v = parseFloat(r.value), first = grVals[id] == null;
    grVals[id] = v;
    var out = document.querySelector('[data-grout="'+id+'"]'); if(out) out.textContent = v.toFixed(1);
    r.closest(".gr-row").classList.add("set");
    var b = $("#grSave");
    if(b){ b.disabled = false; b.textContent = t("gr.save", {n:Object.keys(grVals).length, skill:grSkill}); }
    if(first){ /* add the skip button without redrawing under the thumb */
      var row = r.closest(".gr-row"), last = row.lastElementChild;
      if(last && last.tagName === "SPAN"){ var x = document.createElement("button"); x.className = "gr-skip"; x.dataset.grskip = id; x.innerHTML = "&times;"; row.replaceChild(x, last); }
    }
  });

  /* ================================================================ install as an app */

  var installEvt = null;
  window.addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); installEvt = e; paintInstall(); });
  function standalone(){ return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true; }
  function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function paintInstall(){
    var bar = $("#installBar");
    if(!bar) return;
    var dismissed = false; try{ dismissed = localStorage.getItem("pv.installNo") === "1"; }catch(e){}
    bar.hidden = !account || standalone() || dismissed || !(installEvt || isIOS());
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("#installGo")){
      if(installEvt){ installEvt.prompt(); installEvt.userChoice.then(function(){ installEvt = null; paintInstall(); }); return; }
      modal('<div class="ios-help"><h3>'+t("i.title")+'</h3><ol><li>'+t("i.s1")+' <span class="ios-share" aria-hidden="true">'+
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v13M7 8l5-5 5 5M5 13v7h14v-7"/></svg></span></li>'+
        '<li>'+t("i.s2")+'</li><li>'+t("i.s3")+'</li></ol></div>');
      return;
    }
    if(e.target.closest("#installNo")){ try{ localStorage.setItem("pv.installNo", "1"); }catch(err){} paintInstall(); }
  });

  /* ================================================================ monthly report link */
  function reportUrl(memberId){
    return "report.html" + (REAL ? "?player=" + encodeURIComponent(memberId) : "?demo=1");
  }

  /* ---------------------------------------------------------------- kantine staff */

  function checkCode(){
    var code = ($("#barCode").value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    var out = $("#barResult");
    if(code.length < 4){ out.innerHTML = ""; return; }
    if(REAL){
      /* on the server, checking and confirming are one step: the player is standing there */
      out.innerHTML = '<div class="verdict"><b>…</b></div>';
      PVB.act.confirmCode(code).then(function(r){
        r = r || {};
        if(r.status === "confirmed"){
          haptic(24);
          out.innerHTML = '<div class="verdict good"><b>'+t("k.confirmed")+'</b><span class="big">'+esc(r.item)+'</span><span>'+esc(r.player || "")+'</span></div>';
          $("#barCode").value = "";
          renderQueue();
        } else if(r.status === "used"){
          out.innerHTML = '<div class="verdict warn"><b>'+t("k.used")+'</b><span>'+esc(r.item)+' · '+esc(r.player || "")+'</span></div>';
        } else if(r.status === "expired"){
          out.innerHTML = '<div class="verdict warn"><b>'+t("p.expired")+'</b><span>'+esc(r.item)+'</span></div>';
        } else {
          out.innerHTML = '<div class="verdict bad"><b>'+t("k.unknown")+'</b></div>';
        }
      }).catch(function(err){ out.innerHTML = ""; oops(err); });
      return;
    }
    var rec = S.findRedemption(code);
    if(!rec){
      out.innerHTML = '<div class="verdict bad"><b>'+t("k.unknown")+'</b></div>';
      return;
    }
    if(rec.status === "confirmed"){
      var tf = new Intl.DateTimeFormat(locale(), {hour:"2-digit", minute:"2-digit"});
      out.innerHTML = '<div class="verdict warn"><b>'+t("k.used")+'</b>'+
        '<span>'+esc(rec.item)+' · '+tf.format(new Date(rec.confirmedAt))+'</span></div>';
      return;
    }
    if(rec.at + CODE_LIFE < Date.now()){
      out.innerHTML = '<div class="verdict warn"><b>'+t("p.expired")+'</b><span>'+esc(rec.item)+'</span></div>';
      return;
    }
    out.innerHTML = '<div class="verdict good"><b>'+t("k.valid")+'</b>'+
      '<span class="big">'+esc(rec.item)+'</span>'+
      '<span>'+fmt(rec.cost)+' '+t("c.points")+' · '+esc(D.PLAYER.name)+'</span>'+
      '<button class="btn btn-primary" data-confirm="'+rec.code+'">'+t("k.hand")+'</button></div>';
  }

  /* What the bar is still waiting on. Staff can confirm straight from here when the
     player is standing in front of them and the camera is being difficult. */
  var queueTimer;

  function renderQueue(){
    var card = $("#queueCard"), box = $("#queue");
    if(!card || !box) return;
    if(REAL){
      clearInterval(queueTimer);
      if(role === "player"){ card.hidden = true; return; }
      card.hidden = false;
      PVB.act.pendingCodes().then(function(rows){
        rows = rows || [];
        $("#queueCount").textContent = rows.length;
        box.innerHTML = rows.length ? rows.map(function(r){
          var left = new Date(r.created_at).getTime() + CODE_LIFE - Date.now();
          var m = Math.max(0, Math.floor(left/60000)), sec = Math.max(0, Math.floor(left%60000/1000));
          return '<button class="qrow" data-confirm="'+esc(r.code)+'"><span class="qcode">'+esc(r.code)+'</span>'+
            '<span class="who">'+esc(r.item)+'<small>'+esc(r.player || "")+'</small></span>'+
            '<span class="qleft">'+m+':'+(sec<10?"0":"")+sec+'</span></button>';
        }).join("") : '<p class="empty">'+t("k.queueEmpty")+'</p>';
      }).catch(function(){});
      queueTimer = setInterval(renderQueue, 15000);
      return;
    }
    var live = liveCodes();
    clearInterval(queueTimer);
    card.hidden = false;
    $("#queueCount").textContent = live.length;
    if(!live.length){
      box.innerHTML = '<p class="empty">'+t("k.queueEmpty")+'</p>';
      return;
    }
    function paint(){
      var now = Date.now(), rows = liveCodes();
      if(rows.length !== live.length){ renderQueue(); return; }
      box.innerHTML = rows.map(function(r){
        var left = r.at + CODE_LIFE - now;
        var m = Math.floor(left/60000), sec = Math.floor(left%60000/1000);
        return '<button class="qrow" data-confirm="'+r.code+'">'+
          '<span class="qcode">'+r.code+'</span>'+
          '<span class="who">'+esc(r.item)+'<small>'+esc(D.PLAYER.name)+'</small></span>'+
          '<span class="qleft">'+m+':'+(sec<10?"0":"")+sec+'</span></button>';
      }).join("");
    }
    paint();
    queueTimer = setInterval(paint, 1000);
  }

  /* ---------------------------------------------------------------- scanning */

  var scanning = false;

  function scanNote(){
    var el = $("#scanNote");
    if(!el) return;
    if(!window.r2scan || !window.r2scan.hasCamera()) el.textContent = t("k.nocam");
    else if(!window.r2scan.isSupported()) el.textContent = t("k.noScan");
    else el.textContent = "";
  }

  function stopScan(){
    scanning = false;
    if(window.r2scan) window.r2scan.stop();
    var w = $("#scanWrap");
    if(w) w.hidden = true;
    var b = $("#scanStart");
    if(b) b.hidden = false;
  }

  function startScan(){
    if(!window.r2scan) return;
    if(!window.r2scan.isSupported()){
      window.r2toast(window.r2scan.hasCamera() ? t("k.noScan") : t("k.nocam"));
      var f = $("#barCode"); if(f) f.focus();
      return;
    }
    var wrap = $("#scanWrap"), vid = $("#scanVideo");
    wrap.hidden = false;
    $("#scanStart").hidden = true;
    scanning = true;

    window.r2scan.start(vid, function(code){
      haptic(24);
      var input = $("#barCode");
      if(input) input.value = code;
      stopScan();
      checkCode();
      window.r2toast(t("k.scanned") + " · " + code);
      var res = $("#barResult");
      if(res) res.scrollIntoView({block:"nearest", behavior: calm ? "auto" : "smooth"});
    }, function(reason){
      stopScan();
      window.r2toast(reason === "denied" ? t("k.denied")
                   : reason === "nocamera" ? t("k.nocam") : t("k.noScan"));
    }).then(function(){
      var tb = $("#scanTorch");
      if(tb) tb.hidden = !window.r2scan.canTorch();
    }).catch(function(){});
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#scanStart")){ startScan(); return; }
    if(e.target.closest("#scanStop")){ stopScan(); return; }
    var tb = e.target.closest("#scanTorch");
    if(tb){
      var on = tb.classList.toggle("on");
      window.r2scan.setTorch(on).then(function(ok){ if(!ok) tb.classList.remove("on"); });
      return;
    }
  });

  document.addEventListener("click", function(e){
    if(e.target.closest("#barCheck")){ checkCode(); return; }
    var cf = e.target.closest("[data-confirm]");
    if(cf && REAL){
      $("#barCode").value = cf.dataset.confirm;
      checkCode();
      return;
    }
    if(cf){
      S.markRedeemed(cf.dataset.confirm);
      haptic(24);
      renderHistory(); renderLive(); renderQueue(); checkCode();
      window.r2toast(t("k.confirmed"));
    }
  });

  /* ---------------------------------------------------------------- modal */

  var lastFocus = null, scrollY = 0;

  function focusables(){
    return $$("button, [href], input, select, textarea, [tabindex]:not([tabindex=\"-1\"])", $("#modal"))
      .filter(function(el){ return !el.disabled && el.offsetParent !== null; });
  }

  function modal(html){
    lastFocus = document.activeElement;
    $("#modalBody").innerHTML = html;
    $("#modal").hidden = false;
    /* position:fixed on the body instead of overflow:hidden, because iOS Safari
       happily scrolls the page behind an overflow-hidden body. */
    scrollY = window.scrollY;
    document.body.classList.add("locked");
    document.body.style.top = (-scrollY) + "px";
    $("#modalClose").focus();
  }

  function closeModal(){
    if($("#modal").hidden) return;
    $("#modal").hidden = true;
    document.body.classList.remove("locked");
    document.body.style.top = "";
    window.scrollTo(0, scrollY);
    clearInterval(codeTimer);
    if(lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#modalClose") || e.target.id === "modal") closeModal();
  });

  document.addEventListener("keydown", function(e){
    if($("#modal").hidden) return;
    if(e.key === "Escape"){ closeModal(); return; }
    /* keep tab inside the dialog while it is open */
    if(e.key !== "Tab") return;
    var f = focusables();
    if(!f.length) return;
    var first = f[0], last = f[f.length-1];
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  });

  /* ---------------------------------------------------------------- academy switch */

  (function switcher(){
    var sb = $("#switchBtn"), sm = $("#switchMenu");
    sb.addEventListener("click", function(e){
      e.stopPropagation();
      sm.hidden = !sm.hidden;
      sb.setAttribute("aria-expanded", String(!sm.hidden));
    });
    document.addEventListener("click", function(e){
      if(!sm.hidden && !sm.contains(e.target) && !sb.contains(e.target)) sm.hidden = true;
      var b = e.target.closest("[data-acad]");
      if(!b) return;
      sm.hidden = true;
      if(b.dataset.acad !== "Miami Padel Club")
        window.r2toast(b.dataset.acad + " · " + t("q.locked"));
      else $("#acadName").textContent = b.dataset.acad;
    });
  })();

  /* ---------------------------------------------------------------- boot */

  function renderAll(){
    buildNav();
    $("#filters").innerHTML = ["All","All levels","Beginner","Intermediate","Advanced"].map(function(l){
      return '<button class="fbtn'+(l===filter?" on":"")+'" data-f="'+l+'">'+(l==="All"?t("c.all"):l)+'</button>';
    }).join("");
    renderDash();
    renderSchedule();
    renderSkills();
    renderShop();
    renderHistory();
    renderDrills();
    renderSquad();
    renderCoaches();
    renderStaff();
    renderPlayers();
    renderCSchedule();
    renderCDrills();
    renderGoals();
    paintBell();
    paintInstall();
    renderLive();
    renderQueue();
    scanNote();
    I.apply(document);

    var P = D.PLAYER;
    $("#navAvatar").textContent = account ? account.initials : P.initials;
    $("#sideEmail").textContent = account ? account.email : P.email;
    $("#greeting").textContent = t("d.greeting") + ", " + (account ? account.name.split(" ")[0] : P.first);
    var tag = $("#roleTag");
    tag.hidden = role === "player";
    tag.textContent = role === "coach" ? t("c.coach") : t("c.barStaff");
    var chip = document.querySelector(".pts-chip");
    if(chip) chip.hidden = role !== "player";
    $("#squadLine").textContent = [P.squad, P.days, P.coach].filter(Boolean).join(" · ");
    var mr = $("#myReport");
    if(mr) mr.href = reportUrl(REAL && D.ME ? D.ME.id : "");
    if(REAL){ paintReal(); refreshDrillCounts(); }
  }

  /* real accounts: the numbers and texts that are written into app.html for the demo */
  function paintReal(){
    var me = D.ME || {}, sk = D.SKILLS || [];
    var rated = sk.filter(function(x){ return !x.unrated; });
    var lv = me.level || 0;
    $("#tLevel").textContent = lv.toFixed(2);
    $("#tLevelD").textContent = rated.length ? rated.length + "/9" : "—";
    $("#tSess").textContent = me.attendedSeason || 0;
    $("#tSessD").textContent = "";
    var streak = 0; for(var i=D.ATT.length-1;i>=0 && D.ATT[i];i--) streak++;
    $("#tStreak").textContent = streak;
    $("#tStreakD").textContent = "";
    $("#tPtsD").textContent = "";
    var last = rated.length ? rated.map(function(x){ return x.on; })[0] : "";
    $("#devSub").textContent = rated.length ? t("v.lastAssess", {on:last}) : t("v.noRatings");
    var nl = $("#notesList");
    if(nl) nl.innerHTML = (D.NOTES || []).length ? D.NOTES.map(function(n){
      return '<div class="note"><p>'+esc(n.body)+'</p><div class="by">'+esc(n.by)+', '+esc(n.on)+'</div></div>';
    }).join("") : '<p class="muted small">'+t("v.noNotes")+'</p>';
    var next = Math.floor(lv*4 + 1)/4;
    $("#lvNext").textContent = next.toFixed(2);
    $("#lvNow").textContent = lv.toFixed(2) + " / " + next.toFixed(2);
    $("#lvText").textContent = t("v.lvSet");
    $("#lvBar").style.width = Math.round((lv % 1) * 100) + "%";
    var ac = $("#assignCard"); if(ac) ac.hidden = true;
    var ec = $("#earnChips");
    if(ec) ec.innerHTML = (D.EARN || []).map(function(r){ return '<span class="chip ochre">'+esc(r.k)+' +'+r.v+'</span>'; }).join("");
    var cs = $("#coachSub"); if(cs) cs.textContent = (D.ME.club ? D.ME.club.name : "");
    var an = $("#acadName"); if(an && D.ME.club) an.textContent = D.ME.club.name;
    var apc = $("#addPlayerCard"); if(apc) apc.hidden = role === "player";
  }

  document.addEventListener("r2:lang", function(){
    renderAll();
    if(window.r2figure) window.r2figure.mount();
  });

  /* ---------------------------------------------------------------- sign in / out */
  var gsiDone = false;
  function mountGoogle(){
    if(gsiDone || !PVB || !PVB.ready || !PVB.googleButton) return;
    gsiDone = true;
    PVB.googleButton($("#gsiBtn"), function(){
      bootReal().catch(function(err){ console.warn(err); oops(err); });
    }, function(err){ oops(err); }).then(function(){
      $("#gateGoogle").hidden = true;
    }).catch(function(){ gsiDone = false; /* the redirect button stays */ });
  }
  function openGate(){
    $("#gate").hidden = false;
    document.body.classList.add("gated");
    setTimeout(mountGoogle, 0);
    setTimeout(function(){ var f = $("#gateEmail"); if(f) f.focus(); }, 60);
  }
  function closeGate(){
    $("#gate").hidden = true;
    document.body.classList.remove("gated");
  }
  function signIn(acc){
    if(!acc) return false;
    account = acc;
    S.patch({account:acc, role:acc.role});
    closeGate();
    var hash = location.hash.slice(1);
    setRole(acc.role);
    renderAll();
    if(window.r2figure) window.r2figure.mount();
    if(hash) route(hash);
    return true;
  }
  function signOut(){
    if(REAL){
      PVB.signOut().then(function(){ S.patch({academy:"demo-miami", account:null}); location.hash = ""; location.reload(); });
      return;
    }
    account = null;
    S.patch({account:null});
    closeModal();
    openGate();
  }
  function openAccount(){
    if(!account) return;
    modal('<div class="acc">'+
      '<div class="avatar lg">'+esc(account.initials)+'</div>'+
      '<h3>'+esc(account.name)+'</h3>'+
      (REAL && D.ME && D.ME.club ? '<div class="acc-mail">'+esc(D.ME.club.name)+'</div>' : '')+
      '<div class="acc-mail">'+esc(account.email)+'</div>'+
      (role !== "player" ? '<span class="roletag">'+(role === "coach" ? t("c.coach") : t("c.barStaff"))+'</span>' : '')+
      '<div class="langpick more-lang">'+I.langs.map(function(l){
        return '<button data-lang="'+l.id+'" class="'+(l.id===I.current?"on":"")+'" title="'+l.label+'">'+l.short+'</button>';
      }).join("")+'</div>'+
      (REAL && (account.clubRole === "owner" || (PVB.state && PVB.state.isAdmin)) ? '<button class="btn btn-primary btn-sm" id="accAdmin">'+t("g.clubAdmin")+'</button> ' : '')+
      '<button class="btn btn-ghost btn-sm" id="accOut">'+t("c.signOut")+'</button>'+
    '</div>');
  }
  /* ---------------------------------------------------------------- real accounts */
  var gateMode = "in";   /* "in" or "up" */
  function gateMsg(txt, ok){
    var m = $("#gateMsg");
    m.hidden = !txt; m.textContent = txt || "";
    m.className = "gate-msg" + (ok ? " ok" : "");
  }
  function setGateMode(mode){
    gateMode = mode;
    $("#gateNameWrap").hidden = mode !== "up";
    $("#gateGo").textContent = mode === "up" ? t("g.signUp") : t("g.signIn");
    $("#gateMode").textContent = mode === "up" ? t("g.toSignIn") : t("g.toSignUp");
    $("#gatePass").setAttribute("autocomplete", mode === "up" ? "new-password" : "current-password");
    gateMsg("");
  }

  function mapRole(r){ return r === "player" ? "player" : (r === "staff" ? "bar" : "coach"); }

  async function bootReal(){
    if(!PVB || !PVB.ready) return false;
    var sess = await PVB.session();
    if(!sess) return false;
    REAL = true;
    document.body.classList.add("real");
    var st = await PVB.whoami();
    if(!st.member){ showNoClub(st); return true; }
    if(!st.member.full_name && st.googleName){ try{ await PVB.act.setMyName(st.googleName); st.member.full_name = st.googleName; }catch(e){} }
    S.patch({academy: "club-" + st.member.club_id, account:null});
    await PVB.load();
    var m = st.member;
    account = {email: st.user.email, name: m.full_name || st.user.email, initials: D.PLAYER.initials,
               role: mapRole(m.role), clubRole: m.role, real: true};
    closeGate();
    setRole(account.role);
    renderAll(); drawAttendance();
    if(window.r2figure) window.r2figure.mount();
    var h = location.hash.slice(1);
    if(h && h.indexOf("access_token") === -1) route(h);
    levelUpCheck();
    return true;
  }

  function showNoClub(st){
    openGate();
    ["gsiBtn","gateGoogle","gateEmailToggle","gateForm","gateLinks"].forEach(function(id){ var el = $("#"+id); if(el) el.hidden = true; });
    $$(".gate-card .or, .gate-demo, .gate-note").forEach(function(el){ el.hidden = true; });
    var box = $("#gateNoClub");
    box.hidden = false;
    box.innerHTML = '<p>'+t("g.noClub", {email: esc(st.user.email)})+'</p>'+
      (st.isAdmin ? '<a class="btn btn-primary gate-go" href="platform.html">'+t("g.platform")+'</a>' : '')+
      '<button class="btn btn-ghost btn-sm" id="gateOut">'+t("c.signOut")+'</button>';
  }

  document.addEventListener("submit", function(e){
    if(e.target.id !== "gateForm") return;
    e.preventDefault();
    var em = $("#gateEmail").value.trim(), pw = $("#gatePass").value;
    if(!/^\S+@\S+\.\S+$/.test(em)){ $("#gateEmail").focus(); return; }
    if(pw.length < 8){ gateMsg(t("g.pwShort")); $("#gatePass").focus(); return; }
    $("#gateGo").disabled = true;
    var job = gateMode === "up" ? PVB.signUp(em, pw) : PVB.signIn(em, pw);
    job.then(function(res){
      if(gateMode === "up" && !(res && res.session)){ gateMsg(t("g.checkMail"), true); return; }
      return bootReal();
    }).catch(function(err){ gateMsg((err && err.message) || "Error"); })
      .then(function(){ $("#gateGo").disabled = false; });
  });
  document.addEventListener("click", function(e){
    var d = e.target.closest("[data-demo]");
    if(d){ signIn((D.ACCOUNTS || []).filter(function(a){ return a.role === d.dataset.demo; })[0]); return; }
    if(e.target.closest("#navAvatar")){ openAccount(); return; }
    if(e.target.closest("#accOut") || e.target.closest("#signOut") || e.target.closest("#gateOut")){ signOut(); return; }
    if(e.target.closest("#gateGoogle")){
      if(!PVB || !PVB.ready){ gateMsg("Offline"); return; }
      PVB.signInWithGoogle().catch(function(err){ gateMsg(err.message); });
      return;
    }
    if(e.target.closest("#gateEmailToggle")){
      var f = $("#gateForm"); f.hidden = !f.hidden; $("#gateLinks").hidden = f.hidden;
      if(!f.hidden) setTimeout(function(){ $("#gateEmail").focus(); }, 30);
      return;
    }
    if(e.target.closest("#gateMode")){ setGateMode(gateMode === "up" ? "in" : "up"); return; }
    if(e.target.closest("#gateForgot")){
      var em = $("#gateEmail").value.trim();
      if(!/^\S+@\S+\.\S+$/.test(em)){ gateMsg(t("g.needEmail")); $("#gateEmail").focus(); return; }
      PVB.resetPassword(em).then(function(){ gateMsg(t("g.resetSent"), true); }).catch(function(err){ gateMsg(err.message); });
      return;
    }
    if(e.target.closest("#accAdmin")){ location.href = "admin.html"; return; }
  });

  I.set(I.initial(S.all.lang), true);
  document.body.dataset.role = role;

  applyEdits();
  renderAll();
  if(window.r2figure) window.r2figure.mount();
  if(account && account.real){ account = null; }
  route(location.hash.slice(1) || "dash");
  if(!account) openGate();
  bootReal().catch(function(err){ console.warn(err); oops(err); });
  if(PVB && PVB.client){
    PVB.client.auth.onAuthStateChange(function(ev){
      if(ev === "PASSWORD_RECOVERY"){
        var pw = window.prompt(t("g.newPw"));
        if(pw && pw.length >= 8) PVB.updatePassword(pw).then(function(){ window.r2toast(t("g.pwSaved")); }).catch(oops);
      }
    });
  }

  /* coming back to the app: pull what changed while it was in the background */
  var lastPull = Date.now();
  document.addEventListener("visibilitychange", function(){
    if(document.hidden || !REAL || Date.now() - lastPull < 60000) return;
    lastPull = Date.now();
    reload().then(levelUpCheck).catch(function(){});
  });

  /* court wifi is never reliable */
  function net(){
    var el = $("#netbar");
    el.hidden = navigator.onLine;
    el.textContent = t("c.offline");
  }
  window.addEventListener("online", net);
  window.addEventListener("offline", net);
  net();
})();
