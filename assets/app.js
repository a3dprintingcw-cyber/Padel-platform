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
    {id:"matches",  roles:"player", icon:'<ellipse cx="9" cy="8" rx="5.5" ry="6"/><path d="M12.5 12.5l6 6M17 17l2.5 2.5"/><circle cx="18" cy="6" r="1.8"/>'},
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
    if(id === "matches") loadMatches();
    if(id === "squad"){ renderRanks(); loadFeed(); loadH2H(); if(!REAL && !LADDER.length) LADDER = demoLadder(); renderAchievements(); }
    if(id === "dash") loadChallenges();
    if(id === "schedule" || id === "cschedule") loadLessons();
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
        '<div class="thumb" style="background:'+d.g+'"'+(d.video ? ' data-drillvid="'+esc(d.video)+'" role="button"' : '')+'>'+
        '<div class="play"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5l7 4.5-7 4.5z" fill="#F2F4F5"/></svg></div>'+
        '<span class="dur">'+d.dur+'</span></div>'+
        '<div class="drill-body"><h4>'+esc(d.n)+'</h4><div class="by">'+esc(d.by)+'</div>'+
        '<div class="chips"><span class="chip">'+d.lvl+'</span><span class="chip sea">'+d.kit+'</span></div>'+
        '<div class="drill-btns"><button class="done">'+(done ? "&#10003; " + t("h.done") : t("h.mark") + " +15")+'</button>'+
        '<button class="dtbtn" data-timer="'+d.id+'">&#9201; '+t("dt.timer")+'</button></div>'+
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
      (g.coachCanDelete ? '<button class="fgoal-x" data-delgoal="'+g.id+'" aria-label="Remove">&times;</button>' :
        (g.done && role === "player" ? '<button class="link-btn fgoal-share" data-sharegoal="'+esc(g.skill)+'" data-target="'+g.target+'">'+t("pp.share")+'</button>' : ''))+
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
      case "matchopen":   return {ic:"&#9679;", t: t("n.matchopen", {by:(d.by || "").split(" ")[0]}), s: d.at ? fmtDay(new Date(d.at)) + " · " + fmtTime(new Date(d.at)) : "", go:"matches"};
      case "matchjoin":   return {ic:"&#43;", t: t("n.matchjoin", {by:(d.by || "").split(" ")[0]}), s: (d.n || 2) + "/4", go:"matches"};
      case "matchfull":   return {ic:"&#10003;", t: t("n.matchfull"), s: (d.at ? fmtDay(new Date(d.at)) + " · " + fmtTime(new Date(d.at)) + " · " : "") + t("m.book"), go:"matches"};
      case "matchresult": return {ic:"&#9733;", t: d.won ? t("n.matchwon") : t("n.matchlost"), s: d.score || "", go:"matches"};
      case "announce":     return {ic:"&#128227;", t: d.title || t("n.announce"), s: d.body || "", go:""};
      case "cheer":        return {ic:(CHEERS[d.emoji] || "&#128079;"), t: t("n.cheer", {by:(d.by || "").split(" ")[0]}), s:"", go:"squad"};
      case "joinreq":      return {ic:"&#43;", t: t("n.joinreq", {by:d.name || ""}), s: t("n.joinreqS"), go:""};
      case "lessonbooked": return {ic:"&#128197;", t: t("n.lessonbooked", {by:(d.by || "").split(" ")[0]}), s: d.at ? fmtDay(new Date(d.at)) + " · " + fmtTime(new Date(d.at)) : "", go:"cschedule"};
      case "lessoncancel": return {ic:"&#10005;", t: t("n.lessoncancel", {by:(d.by || "").split(" ")[0]}), s: d.at ? fmtDay(new Date(d.at)) + " · " + fmtTime(new Date(d.at)) : "", go:role === "coach" ? "cschedule" : "schedule"};
      case "friendreq":    return {ic:"&#129309;", t: t("n.friendreq", {by:(d.by || "").split(" ")[0]}), s: t("n.friendreqS"), go:"squad"};
      case "friendok":     return {ic:"&#129309;", t: t("n.friendok", {by:(d.by || "").split(" ")[0]}), s:"", go:"squad"};
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

  /* ---------------------------------------------------------------- share cards
     Every card carries the club's logo next to ours: free advertising for both. */

  var logoCache = {};
  function clubLogoUrl(){ return REAL && D.ME && D.ME.club ? (D.ME.club.logo_url || "") : ""; }
  function clubName(){ return (REAL && D.ME && D.ME.club && D.ME.club.name) || $("#acadName").textContent || "Padel Vitals"; }
  function clubColor(){ return (REAL && D.ME && D.ME.club && D.ME.club.color) || "#C8F542"; }
  function loadLogo(){
    var url = clubLogoUrl();
    if(!url) return Promise.resolve(null);
    if(logoCache[url]) return logoCache[url];
    logoCache[url] = new Promise(function(ok){
      var im = new Image(); im.crossOrigin = "anonymous";
      im.onload = function(){ ok(im); }; im.onerror = function(){ ok(null); };
      im.src = url + (url.indexOf("?") === -1 ? "?" : "&") + "cors=1";
    });
    return logoCache[url];
  }
  function cardFonts(){
    return document.fonts ? Promise.all(["120px Anton", "600 30px 'Instrument Sans'", "600 30px 'IBM Plex Mono'"].map(function(s){ return document.fonts.load(s).catch(function(){}); })) : Promise.resolve();
  }

  /* our mark, drawn from the same shapes as the logo: racket, handle, pulse */
  function drawGlyph(x, left, top, h){
    var s = h / 120;
    x.save(); x.translate(left, top); x.scale(s, s);
    x.strokeStyle = "#F2F4F5"; x.lineWidth = 8; x.lineCap = "round"; x.lineJoin = "round";
    x.beginPath(); x.ellipse(40, 42, 29, 35, 0, 0, Math.PI * 2); x.stroke();
    x.beginPath(); x.moveTo(24, 71); x.lineTo(35, 90); x.moveTo(56, 71); x.lineTo(45, 90); x.stroke();
    x.fillStyle = "#F2F4F5"; roundRect(x, 32, 89, 16, 27, 3); x.fill();
    x.strokeStyle = "#C8F542"; x.lineWidth = 10;
    x.beginPath(); [[2,44],[21,44],[26,33],[33,60],[40,20],[46,52],[50,44],[78,44]].forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.stroke();
    x.restore();
  }

  /* club logo in a white tile, or the club's initials when there is no logo yet */
  function drawClubMark(x, left, top, size, logo){
    x.fillStyle = "#FFFFFF"; roundRect(x, left, top, size, size, size * 0.22); x.fill();
    if(logo){
      var pad = size * 0.12, box = size - pad * 2, r = Math.min(box / logo.width, box / logo.height);
      var w = logo.width * r, h = logo.height * r;
      x.drawImage(logo, left + (size - w) / 2, top + (size - h) / 2, w, h);
    } else {
      var ini = clubName().split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0, 3).toUpperCase();
      x.fillStyle = "#0B0D0F"; x.font = "400 " + Math.round(size * 0.42) + "px Anton, Impact, sans-serif"; x.textAlign = "center";
      x.fillText(ini, left + size / 2, top + size * 0.64); x.textAlign = "left";
    }
  }

  /* the footer every card shares: [club logo] × [Padel Vitals] */
  function drawBrandRow(x, W, y, logo){
    var size = 132;
    drawClubMark(x, 80, y, size, logo);
    x.fillStyle = "#9AA3AB"; x.font = "400 44px 'Instrument Sans', sans-serif"; x.fillText("×", 80 + size + 34, y + size / 2 + 15);
    var gx = 80 + size + 92;
    drawGlyph(x, gx, y + 10, size - 20);
    x.fillStyle = "#C8F542"; x.font = "400 58px Anton, Impact, sans-serif"; x.fillText("PADEL", gx + 92, y + 64);
    x.fillStyle = "#F2F4F5"; x.fillText("VITALS", gx + 92, y + 124);
    x.fillStyle = "#9AA3AB"; x.font = "600 26px 'IBM Plex Mono', monospace"; x.textAlign = "right";
    x.fillText(clubName().toUpperCase().slice(0, 28), W - 80, y + 64);
    x.fillText("PADELVITALS.COM", W - 80, y + 112); x.textAlign = "left";
  }

  function cardBase(W, H){
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    x.fillStyle = "#0B0D0F"; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * 0.85, H * 0.12, 40, W * 0.85, H * 0.12, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(200,245,66,.24)"); g.addColorStop(1, "rgba(200,245,66,0)");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    /* the club's own color as a thin band on top */
    x.fillStyle = clubColor(); x.fillRect(0, 0, W, 14);
    x.strokeStyle = "#C8F542"; x.lineWidth = 10; x.lineJoin = "round"; x.lineCap = "round";
    var py = 210;
    x.beginPath(); [[0,py],[300,py],[360,py-80],[430,py+100],[510,py-150],[580,py+60],[640,py],[W,py]].forEach(function(p, i){ i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]); }); x.stroke();
    return {cv:cv, x:x};
  }

  /* spec: {eyebrow, name, big, bigLabel, bars:[[label, 0-10]], tiles:[[value, label, highlight]]} */
  function makeCard(spec, story, logo){
    var W = 1080, H = story ? 1920 : 1350, c = cardBase(W, H), x = c.x;
    var y = story ? 560 : 380;
    x.fillStyle = "#9AA3AB"; x.font = "600 34px 'IBM Plex Mono', monospace"; x.fillText(String(spec.eyebrow || "").toUpperCase(), 80, y);
    x.fillStyle = "#F2F4F5"; x.font = "700 76px 'Instrument Sans', sans-serif"; x.fillText(String(spec.name || "").slice(0, 24), 80, y + 90);
    y += 110;
    if(spec.big != null){
      x.fillStyle = "#C8F542"; x.font = "400 " + (story ? 300 : 260) + "px Anton, Impact, sans-serif"; x.fillText(String(spec.big), 70, y + (story ? 290 : 250));
      x.fillStyle = "#F2F4F5"; x.font = "600 40px 'IBM Plex Mono', monospace"; x.fillText(String(spec.bigLabel || "").toUpperCase(), 84, y + (story ? 360 : 315));
      y += story ? 420 : 370;
    }
    (spec.bars || []).slice(0, 3).forEach(function(b, i){
      var by = y + i * 82;
      x.fillStyle = "#F2F4F5"; x.font = "600 36px 'Instrument Sans', sans-serif"; x.fillText(b[0], 84, by + 28);
      x.fillStyle = "rgba(255,255,255,.12)"; roundRect(x, 420, by + 6, 470, 22, 11); x.fill();
      x.fillStyle = "#C8F542"; roundRect(x, 420, by + 6, Math.max(22, 470 * b[1] / 10), 22, 11); x.fill();
      x.fillStyle = "#F2F4F5"; x.font = "400 44px Anton, Impact, sans-serif"; x.fillText(Number(b[1]).toFixed(1), 920, by + 32);
    });
    if(spec.bars && spec.bars.length) y += Math.min(3, spec.bars.length) * 82 + 30;
    var th = story ? 290 : 220, step = story ? 320 : 250;
    if(story) y += 40;
    (spec.tiles || []).slice(0, 6).forEach(function(tl, i){
      var col = i % 2, row = Math.floor(i / 2), tx = 80 + col * 470, ty = y + row * step;
      x.fillStyle = "rgba(255,255,255,.06)"; roundRect(x, tx, ty, 440, th, 28); x.fill();
      /* big numbers shrink to fit their tile */
      var fs = 116, txt = String(tl[0]);
      x.font = "400 " + fs + "px Anton, Impact, sans-serif";
      while(x.measureText(txt).width > 372 && fs > 40){ fs -= 6; x.font = "400 " + fs + "px Anton, Impact, sans-serif"; }
      x.fillStyle = tl[2] ? "#C8F542" : "#F2F4F5"; x.fillText(txt, tx + 34, ty + th * 0.58);
      x.fillStyle = "#9AA3AB"; x.font = "600 30px 'Instrument Sans', sans-serif"; x.fillText(String(tl[1]).slice(0, 26), tx + 36, ty + th - 45);
    });
    drawBrandRow(x, W, H - 230, logo);
    return c.cv;
  }

  function shareCanvas(cv, file, text){
    cv.toBlob(function(blob){
      var f = new File([blob], file, {type:"image/png"});
      if(navigator.canShare && navigator.canShare({files:[f]})){ navigator.share({files:[f], text:text}).catch(function(){}); return; }
      var url = URL.createObjectURL(blob);
      modal('<div class="share-prev"><img src="'+url+'" alt=""><a class="btn btn-primary" href="'+url+'" download="'+file+'">'+t("share.save")+'</a></div>');
    }, "image/png");
  }
  function buildAndShare(spec, story, file, text){
    Promise.all([cardFonts(), loadLogo()]).then(function(r){ shareCanvas(makeCard(spec, story, r[1]), file, text); });
  }

  function myName(){ return (account && account.name) || D.PLAYER.name; }
  function myLevelNow(){ return REAL ? Number(D.ME && D.ME.level) || 0 : (D.ROSTER.filter(function(p){ return p.me; })[0] || {rating:3.25}).rating; }
  function topBars(){ return D.SKILLS.filter(function(s){ return !s.unrated; }).slice().sort(function(a,b){ return b.v - a.v; }).slice(0, 3).map(function(s){ return [s.n, s.v]; }); }

  function shareLevel(){
    buildAndShare({eyebrow:clubName(), name:myName(), big:myLevelNow().toFixed(2), bigLabel:t("share.level"), bars:topBars()},
                  false, "padel-vitals-level.png", t("share.text"));
  }
  function shareGoal(skill, target){
    buildAndShare({eyebrow:t("sc.goal"), name:myName(), big:Number(target).toFixed(1), bigLabel:skill, bars:topBars()},
                  false, "padel-vitals-goal.png", t("sc.goalText", {skill:skill}));
  }
  function shareWin(score){
    var lad = (LADDER || []).filter(function(r){ return r.member_id === myId(); })[0] || {};
    buildAndShare({eyebrow:t("sc.win"), name:myName(), big:"W", bigLabel:score || t("sc.winLabel"),
                   tiles:[[myLevelNow().toFixed(2), t("w.level")], [(lad.wins || 1) + "/" + (lad.played || 1), t("w.matches")]]},
                  false, "padel-vitals-win.png", t("sc.winText"));
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("[data-sharecard]")){ shareLevel(); return; }
    var g = e.target.closest("[data-sharegoal]");
    if(g){ shareGoal(g.dataset.sharegoal, g.dataset.target); return; }
    var w = e.target.closest("[data-sharewin]");
    if(w){ shareWin(w.dataset.sharewin); return; }
    var f = e.target.closest("[data-sharefeed]");
    if(f && FEED){
      var it = FEED.filter(function(x){ return x.id === f.dataset.sharefeed; })[0];
      if(!it) return;
      if(it.kind === "levelup") shareLevel();
      else if(it.kind === "goal") shareGoal(it.data.skill, it.data.target);
      else if(it.kind === "matchwin") shareWin(it.data.score);
    }
  });


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

  /* ================================================================ voice ratings
     The coach talks, the phone writes it down, we read names, shots and scores out of it.
     Everything happens on the phone: no recording leaves it, only the scores the coach saves. */

  function fold(s){ return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }

  var SKILL_ALIASES = {
    "Bandeja": ["bandeja", "bandejas"],
    "Víbora": ["vibora", "viboras", "vivora", "bibora", "viper"],
    "Wall exit": ["wall exit", "wall exits", "salida de pared", "salidas de pared", "salida", "back wall", "pared", "wall"],
    "Volley": ["volley", "volleys", "volea", "voleas", "volee", "volei", "voleio"],
    "Chiquita": ["chiquita", "chiquitas", "chikita"],
    "Positioning": ["positioning", "posicionamiento", "position", "posicion", "posizione", "positionnement"],
    "Serve & return": ["serve and return", "saque y resto", "serve", "serves", "service", "return", "returns", "saque", "resto", "servizio", "aufschlag"],
    "Agility": ["agility", "footwork", "movement", "speed", "agilidad", "movimiento", "piernas", "agilita", "agilite"],
    "Match head": ["match head", "decision making", "decisions", "mental", "head", "tactics", "tactica", "cabeza", "testa"]
  };
  var NUMW = {zero:0, cero:0, one:1, uno:1, una:1, um:1, un:1, une:1, eins:1, een:1, ett:1, two:2, dos:2, dois:2, due:2, deux:2, zwei:2, twee:2, tva:2,
    three:3, tres:3, tre:3, trois:3, drei:3, drie:3, four:4, cuatro:4, quatro:4, quattro:4, quatre:4, vier:4, fyra:4,
    five:5, cinco:5, cinque:5, cinq:5, funf:5, vijf:5, fem:5, six:6, seis:6, sei:6, sechs:6, zes:6, sex:6,
    seven:7, siete:7, sete:7, sette:7, sept:7, sieben:7, zeven:7, sju:7, eight:8, ocho:8, oito:8, otto:8, huit:8, acht:8, atta:8,
    nine:9, nueve:9, nove:9, neuf:9, neun:9, negen:9, nio:9, ten:10, diez:10, dez:10, dieci:10, dix:10, zehn:10, tien:10, tio:10};

  /* "seven and a half" → 7.5, "siete punto cinco" → 7.5, "7,5" → 7.5 */
  function numberize(text){
    var s = " " + fold(text).replace(/(\d),(\d)/g, "$1.$2").replace(/[^a-z0-9.\s]/g, " ").replace(/\.(?!\d)/g, " ") + " ";
    s = s.replace(/\b([a-z]+)\b/g, function(w){ return NUMW.hasOwnProperty(w) ? String(NUMW[w]) : w; });
    s = s.replace(/\b(\d+)\s+(point|punto|ponto|virgule|komma|comma|coma)\s+(\d)\b/g, "$1.$3");
    s = s.replace(/\b(\d+)\s+(and a half|y medio|y media|e meio|e mezzo|et demi|einhalb|en half|och en halv|and half)\b/g, function(_, n){ return n + ".5"; });
    return s.replace(/\s+/g, " ").trim();
  }

  function parseVoice(text, roster){
    var s = numberize(text), words = s.split(" ");
    /* name keys: full name, first name, last name when nobody else has it */
    var keys = [];
    var firstCount = {}, lastCount = {};
    roster.forEach(function(p){
      var parts = fold(p.n).split(/\s+/);
      firstCount[parts[0]] = (firstCount[parts[0]] || 0) + 1;
      if(parts.length > 1) lastCount[parts[parts.length-1]] = (lastCount[parts[parts.length-1]] || 0) + 1;
    });
    roster.forEach(function(p){
      var parts = fold(p.n).split(/\s+/);
      keys.push({w:parts, p:p});
      if(parts.length > 1 && firstCount[parts[0]] === 1) keys.push({w:[parts[0]], p:p});
      if(parts.length > 1 && lastCount[parts[parts.length-1]] === 1) keys.push({w:[parts[parts.length-1]], p:p});
    });
    keys.sort(function(a,b){ return b.w.length - a.w.length; });
    var skillKeys = [];
    Object.keys(SKILL_ALIASES).forEach(function(k){ SKILL_ALIASES[k].forEach(function(a){ skillKeys.push({w:a.split(" "), k:k}); }); });
    skillKeys.sort(function(a,b){ return b.w.length - a.w.length; });
    function at(i, list){
      for(var j = 0; j < list.length; j++){
        var w = list[j].w, ok = true;
        for(var x = 0; x < w.length; x++){ if(words[i+x] !== w[x]){ ok = false; break; } }
        if(ok) return list[j];
      }
      return null;
    }
    /* walk the words once: player switches, shots set the current shot, numbers score it */
    var out = [], cur = null, skill = null, pending = [], unmatched = [], i = 0, noteWords = {};
    while(i < words.length){
      var nk = at(i, keys);
      if(nk){ cur = nk.p; i += nk.w.length; continue; }
      var sk = at(i, skillKeys);
      if(sk){ skill = sk.k; i += sk.w.length; continue; }
      var w = words[i];
      if(/^\d+(\.\d+)?$/.test(w)){
        var v = parseFloat(w);
        if(v >= 0 && v <= 10){
          if(cur) out.push({p:cur, skill:skill, score:Math.round(v*10)/10});
          else unmatched.push(w);
        }
        i++; continue;
      }
      if(cur){ (noteWords[cur.id] = noteWords[cur.id] || []).push(w); }
      i++;
    }
    /* same player + same shot twice: the last one said wins */
    var seen = {}, rows = [];
    out.forEach(function(r){ var k = r.p.id + "|" + r.skill; if(seen[k] != null) rows[seen[k]] = r; else { seen[k] = rows.length; rows.push(r); } });
    return {rows:rows, notes:noteWords};
  }

  /* the coach's own words for a player, cut from the original text, for the note */
  function noteFor(text, p){
    var f = fold(text), first = fold(p.n).split(/\s+/)[0];
    var idx = f.indexOf(first);
    if(idx < 0) return "";
    var rest = text.slice(idx);
    var others = D.ROSTER.filter(function(x){ return x.id !== p.id; }).map(function(x){ return fold(x.n).split(/\s+/)[0]; });
    var cut = rest.length, fr = fold(rest);
    others.forEach(function(o){ var j = fr.indexOf(o, first.length); if(j > 0 && j < cut) cut = j; });
    var seg = rest.slice(0, cut);
    /* keep only the coaching words: drop the name and every clause that is just a shot and a score */
    var aliases = [];
    Object.keys(SKILL_ALIASES).forEach(function(k){ aliases = aliases.concat(SKILL_ALIASES[k]); });
    var clauses = seg.split(/[,;.!?]+|\s+(?:and|y|e|et|und|en|och)\s+(?=\S+\s+\d)/i).map(function(c){ return c.trim(); }).filter(Boolean);
    var keep = clauses.filter(function(c){
      var n = " " + numberize(c) + " ";
      if(/\s\d+(\.\d+)?\s/.test(n)) return false;
      return !aliases.some(function(a){ return n.indexOf(" " + a + " ") !== -1; }) || n.split(" ").filter(Boolean).length > 4;
    }).map(function(c){ return c.replace(new RegExp("^" + p.n.split(/\s+/)[0] + "\\b", "i"), "").trim(); }).filter(function(c){ return c.split(/\s+/).length >= 2; });
    var txt = keep.join(". ");
    return txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : "";
  }

  var voiceRows = [], voiceNotes = {}, voiceText = "", rec = null, listening = false;

  function voiceHtml(){
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var byPlayer = {};
    voiceRows.forEach(function(r, i){ (byPlayer[r.p.id] = byPlayer[r.p.id] || {p:r.p, rows:[]}).rows.push({r:r, i:i}); });
    var groups = Object.keys(byPlayer).map(function(k){ return byPlayer[k]; });
    var missing = voiceRows.some(function(r){ return !r.skill; });
    return '<div class="voice">'+
      '<div class="eyebrow">'+t("vo.eyebrow")+'</div><h3>'+t("vo.title")+'</h3>'+
      '<p class="muted small">'+t("vo.hint")+'</p>'+
      (SR ? '<button class="vo-mic'+(listening ? " on" : "")+'" id="voMic" aria-label="'+esc(t("vo.talk"))+'">'+
        '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>'+
        '<span>'+(listening ? t("vo.stop") : t("vo.talk"))+'</span></button>' : '')+
      '<textarea id="voText" rows="4" placeholder="'+esc(t("vo.ph"))+'">'+esc(voiceText)+'</textarea>'+
      '<button class="btn btn-ghost btn-sm" id="voRead">'+t("vo.read")+'</button>'+
      (groups.length ? '<div class="vo-list">'+groups.map(function(g){
        var note = voiceNotes[g.p.id];
        return '<div class="vo-p"><b>'+esc(g.p.n)+'</b>'+g.rows.map(function(x){
          return '<div class="vo-row"><select data-vosk="'+x.i+'">'+(x.r.skill ? '' : '<option value="">'+t("vo.pick")+'</option>')+
            D.SKILLS.map(function(s){ return '<option'+(s.n === x.r.skill ? " selected" : "")+'>'+esc(s.n)+'</option>'; }).join("")+'</select>'+
            '<input type="number" min="0" max="10" step="0.1" value="'+x.r.score.toFixed(1)+'" data-vosc="'+x.i+'" aria-label="Score">'+
            '<button class="gr-skip" data-vodel="'+x.i+'" aria-label="Remove">&times;</button></div>';
        }).join("")+
        (note != null ? '<label class="vo-note"><input type="checkbox" data-vonote="'+g.p.id+'"'+(note.on ? " checked" : "")+'> '+t("vo.asNote")+'<span>'+esc(note.text)+'</span></label>' : '')+
        '</div>';
      }).join("")+'</div>'+
      '<button class="btn btn-primary vo-save" id="voSave"'+(missing ? " disabled" : "")+'>'+t("vo.save", {n:voiceRows.length})+'</button>'
      : (voiceText ? '<p class="muted small">'+t("vo.none")+'</p>' : ''))+
    '</div>';
  }
  function repaintVoice(){ var y = $(".sheet") ? $(".sheet").scrollTop : 0; $("#modalBody").innerHTML = voiceHtml(); if($(".sheet")) $(".sheet").scrollTop = y; }

  function readVoice(){
    voiceText = ($("#voText").value || "").trim();
    var res = parseVoice(voiceText, D.ROSTER);
    voiceRows = res.rows;
    voiceNotes = {};
    var ids = {}; voiceRows.forEach(function(r){ ids[r.p.id] = r.p; });
    Object.keys(ids).forEach(function(id){
      var txt = noteFor(voiceText, ids[id]);
      if(txt) voiceNotes[id] = {text:txt, on:true};
    });
    repaintVoice();
  }

  function openVoice(){ voiceRows = []; voiceNotes = {}; voiceText = ""; modal(voiceHtml()); }

  function stopRec(){ listening = false; if(rec){ try{ rec.stop(); }catch(e){} } }

  document.addEventListener("click", function(e){
    if(e.target.closest("[data-voice]")){ openVoice(); return; }
    if(e.target.closest("#voMic")){
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(!SR) return;
      if(listening){ stopRec(); setTimeout(readVoice, 300); return; }
      voiceText = ($("#voText").value || "").trim();
      var base = voiceText ? voiceText + " " : "";
      rec = new SR();
      rec.lang = {en:"en-US", es:"es-ES", pt:"pt-PT", it:"it-IT", fr:"fr-FR", de:"de-DE", nl:"nl-NL", sv:"sv-SE"}[I.current] || "en-US";
      rec.continuous = true; rec.interimResults = true;
      rec.onresult = function(ev){
        var fin = "", tmp = "";
        for(var k = 0; k < ev.results.length; k++){ (ev.results[k].isFinal ? (fin += ev.results[k][0].transcript + " ") : (tmp += ev.results[k][0].transcript)); }
        var box = $("#voText"); if(box) box.value = (base + fin + tmp).trim();
      };
      rec.onerror = function(ev){ listening = false; if(ev.error === "not-allowed") window.r2toast(t("vo.micNo")); var m = $("#voMic"); if(m) repaintVoice(); };
      rec.onend = function(){ if(listening){ try{ rec.start(); }catch(err){ listening = false; } } };
      try{ rec.start(); listening = true; haptic(); }catch(err){ listening = false; }
      var mic = $("#voMic"); if(mic){ mic.classList.toggle("on", listening); mic.querySelector("span").textContent = listening ? t("vo.stop") : t("vo.talk"); }
      return;
    }
    if(e.target.closest("#voRead")){ stopRec(); readVoice(); return; }
    var d = e.target.closest("[data-vodel]");
    if(d){ voiceRows.splice(+d.dataset.vodel, 1); repaintVoice(); return; }
    if(e.target.closest("#voSave")){
      var rows = voiceRows.filter(function(r){ return r.skill; }).map(function(r){ return {player:r.p.id, skill:r.skill, score:r.score}; });
      var notes = Object.keys(voiceNotes).filter(function(id){ return voiceNotes[id].on; }).map(function(id){ return {id:id, text:voiceNotes[id].text}; });
      if(!rows.length) return;
      haptic(24);
      var msg = t("vo.saved", {n:rows.length});
      if(!REAL){
        rows.forEach(function(r){
          demoRatings[r.player] = demoRatings[r.player] || {};
          demoRatings[r.player][r.skill] = {n:r.skill, v:r.score, d:0, on:t("t.today"), unrated:false};
          var p = D.ROSTER.filter(function(x){ return x.id === r.player; })[0];
          if(p && p.me){ S.setSkill(r.skill, r.score); applyEdits(); renderSkills(); }
        });
        closeModal(); window.r2toast(msg); return;
      }
      $("#voSave").disabled = true;
      PVB.act.rateMany(rows).then(function(){
        return Promise.all(notes.map(function(n){ return PVB.act.note(n.id, n.text); }));
      }).then(function(){ closeModal(); window.r2toast(msg); }).catch(function(err){ oops(err); var b = $("#voSave"); if(b) b.disabled = false; });
    }
  });
  document.addEventListener("change", function(e){
    var a = e.target.closest("[data-vosk]");
    if(a){ voiceRows[+a.dataset.vosk].skill = a.value || null; repaintVoice(); return; }
    var n = e.target.closest("[data-vonote]");
    if(n && voiceNotes[n.dataset.vonote]) voiceNotes[n.dataset.vonote].on = n.checked;
  });
  document.addEventListener("input", function(e){
    var c = e.target.closest("[data-vosc]");
    if(c){ var v = parseFloat(c.value); if(!isNaN(v)) voiceRows[+c.dataset.vosc].score = Math.max(0, Math.min(10, Math.round(v*10)/10)); }
    if(e.target.id === "voText") voiceText = e.target.value;
  });

  /* ================================================================ level passport */

  function passportUrl(code){ return location.origin + location.pathname.replace(/[^/]*$/, "") + "passport.html?c=" + encodeURIComponent(code); }

  function renderPassport(){
    var el = $("#passportBody");
    if(!el) return;
    var pp = REAL && D.ME ? D.ME.passport : (D.__pp = D.__pp || {code:null, on:false});
    if(!pp || !pp.on){
      el.innerHTML = '<p class="muted small">'+t("pp.off")+'</p><button class="btn btn-primary btn-sm" id="ppOn">'+t("pp.turnOn")+'</button>';
      return;
    }
    var url = REAL ? passportUrl(pp.code) : passportUrl("DEMO").replace("c=DEMO", "demo=1");
    var qr = window.r2qr ? window.r2qr.svg(url, {fg:"#0B0D0F", bg:"#FFFFFF"}) : "";
    el.innerHTML = '<div class="pp-row"><div class="pp-qr">'+qr+'</div><div class="pp-info">'+
      '<div class="eyebrow">'+t("pp.code")+'</div><b class="pp-code">'+esc(pp.code || "DEMO")+'</b>'+
      '<p class="muted small">'+t("pp.on")+'</p>'+
      '<div class="lv-actions"><button class="btn btn-primary btn-sm" data-ppshare="'+esc(url)+'">'+t("pp.share")+'</button>'+
      '<a class="btn btn-ghost btn-sm" href="'+esc(url)+'" target="_blank" rel="noopener">'+t("pp.view")+'</a>'+
      '<button class="link-btn" id="ppOff">'+t("pp.turnOff")+'</button></div></div></div>';
  }

  document.addEventListener("click", function(e){
    var on = e.target.closest("#ppOn"), off = e.target.closest("#ppOff");
    if(on || off){
      var want = !!on;
      if(!REAL){ D.__pp = {code:"DEMO", on:want}; renderPassport(); return; }
      PVB.act.setPassport(want).then(function(code){
        D.ME.passport = {code:code, on:want}; renderPassport();
        window.r2toast(want ? t("pp.isOn") : t("pp.isOff"));
      }).catch(oops);
      return;
    }
    var sh = e.target.closest("[data-ppshare]");
    if(sh) share(t("pp.title"), t("pp.shareText"), sh.dataset.ppshare);
  });

  /* ================================================================ matches and ladder */

  var matchTab = "open", MATCHES = [], LADDER = [];

  function myId(){ return REAL ? (D.ME && D.ME.id) : "p1"; }
  function myLevel(){ return REAL ? Number(D.ME && D.ME.level) || 0 : 3.25; }
  function rosterName(id){ var p = D.ROSTER.filter(function(x){ return x.id === id; })[0]; return p ? p.n : ""; }

  function demoMatches(){
    if(D.__matches) return D.__matches;
    var day = function(d, h){ var x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    var P = function(id, team){ return {id:id, n:rosterName(id), team:team || null}; };
    D.__matches = [
      {id:"m1", by:"p2", at:day(1, 19), min:3.0, max:3.75, note:"Court 3, bring balls", status:"open", score:"", winner:null, players:[P("p2"), P("p3")]},
      {id:"m2", by:"p1", at:day(3, 10), min:3.0, max:3.5, note:"", status:"full", score:"", winner:null, players:[P("p1"), P("p4"), P("p5"), P("p6")]},
      {id:"m4", by:"p1", at:day(-1, 19), min:3.0, max:3.75, note:"", status:"full", score:"", winner:null, players:[P("p1"), P("p7"), P("p2"), P("p8")]},
      {id:"m3", by:"p4", at:day(-4, 18), min:3.0, max:3.75, note:"", status:"played", score:"6-4 3-6 7-5", winner:1, players:[P("p1",1), P("p4",1), P("p2",2), P("p3",2)]}
    ];
    return D.__matches;
  }
  function demoLadder(){
    return D.ROSTER.map(function(p){ var r = seeded("lad" + p.id); var pl = 3 + r % 8; return {member_id:p.id, full_name:p.n, level:p.rating, played:pl, wins:Math.min(pl, (r >> 3) % (pl + 1))}; });
  }

  function loadMatches(){
    if(role !== "player") return;
    if(!REAL){ MATCHES = demoMatches(); LADDER = demoLadder(); renderMatches(); return; }
    Promise.all([PVB.act.matches(), PVB.act.ladder()]).then(function(r){ MATCHES = r[0] || []; LADDER = r[1] || []; renderMatches(); }).catch(function(){});
  }

  function matchCard(m){
    var me = myId(), mine = m.players.some(function(p){ return p.id === me; });
    var d = new Date(m.at), past = d < new Date();
    var slots = [0,1,2,3].map(function(i){
      var p = m.players[i];
      return p ? '<span class="ms-p'+(p.id === me ? " me" : "")+(p.team ? " t" + p.team : "")+'"><i>'+esc(initialsOf(p.n))+'</i>'+esc(p.n.split(" ")[0])+'</span>'
               : '<span class="ms-p empty"><i>+</i>'+t("m.open")+'</span>';
    }).join("");
    var state = m.status === "played" ? '<span class="chip">'+esc(m.score)+'</span>' :
                m.status === "full" ? '<span class="chip sea">'+t("m.on")+'</span>' :
                '<span class="chip ochre">'+m.players.length+'/4</span>';
    var act = "";
    if(m.status === "played"){
      var w = m.players.filter(function(p){ return p.team === m.winner; }).map(function(p){ return p.n.split(" ")[0]; }).join(" & ");
      var iWon = m.players.some(function(p){ return p.id === me && p.team === m.winner; });
      act = '<p class="muted small">'+t("m.won", {who:esc(w)})+'</p>'+(iWon ? '<button class="btn btn-primary btn-sm" data-sharewin="'+esc(m.score)+'">'+t("sc.shareWin")+'</button>' : '');
    } else if(past && mine && m.players.length === 4){
      act = '<button class="btn btn-primary btn-sm" data-mresult="'+m.id+'">'+t("m.addResult")+'</button>';
    } else if(!past && mine){
      act = (m.status === "full" ? '<p class="small coral">'+t("m.book")+'</p>' : '')+'<button class="btn btn-ghost btn-sm" data-mleave="'+m.id+'">'+t("m.leave")+'</button>';
    } else if(!past && m.status === "open"){
      var lv = myLevel(), fits = lv >= m.min - 0.001 && lv <= m.max + 0.001;
      act = '<button class="btn btn-primary btn-sm" data-mjoin="'+m.id+'">'+t("m.join")+'</button>'+(fits ? '' : '<small class="muted">'+t("m.outside")+'</small>');
    }
    return '<article class="mcard'+(mine ? " mine" : "")+(m.status === "played" ? " played" : "")+'">'+
      '<div class="mc-hd"><div><b>'+fmtDay(d)+' · '+fmtTime(d)+'</b><small>'+t("t.level")+' '+m.min.toFixed(2)+'–'+m.max.toFixed(2)+(m.note ? ' · '+esc(m.note) : '')+'</small></div>'+state+'</div>'+
      '<div class="mc-slots">'+slots+'</div><div class="mc-act">'+act+'</div></article>';
  }
  function initialsOf(n){ return String(n || "?").split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0,2).toUpperCase(); }

  function renderMatches(){
    var el = $("#matchBody");
    if(!el) return;
    $$("[data-mtab]").forEach(function(b){ b.classList.toggle("on", b.dataset.mtab === matchTab); });
    $("#matchPost").hidden = matchTab !== "open";
    if(matchTab === "rivals"){
      el.innerHTML = '<div class="card"><div id="rivalsBody"></div><p class="muted small">'+t("fr.rivalsHint")+'</p></div>';
      if(H2H) renderRivals(); else loadH2H();
      return;
    }
    if(matchTab === "ladder"){
      var rows = LADDER.slice().map(function(r){ return Object.assign({}, r, {pct: r.played ? r.wins / r.played : 0}); })
        .sort(function(a,b){ return b.wins - a.wins || b.pct - a.pct || a.played - b.played; });
      el.innerHTML = rows.length ? '<div class="card"><table class="ladder"><thead><tr><th>#</th><th>'+t("c.player")+'</th><th>'+t("m.p")+'</th><th>'+t("m.w")+'</th><th>%</th></tr></thead><tbody>'+
        rows.map(function(r, i){
          return '<tr class="'+(r.member_id === myId() ? "me" : "")+'"><td>'+(i+1)+'</td><td><b>'+esc(r.full_name)+'</b><small>'+(Number(r.level)||0).toFixed(2)+'</small></td>'+
            '<td>'+r.played+'</td><td>'+r.wins+'</td><td>'+Math.round(r.pct*100)+'</td></tr>';
        }).join("")+'</tbody></table><p class="muted small">'+t("m.ladderHint")+'</p></div>'
        : '<p class="empty">'+t("m.noLadder")+'</p>';
      return;
    }
    var now = Date.now() - 3*36e5;
    var upcoming = MATCHES.filter(function(m){ return new Date(m.at) >= now && m.status !== "played"; });
    var recent = MATCHES.filter(function(m){ return !(new Date(m.at) >= now && m.status !== "played"); }).reverse();
    el.innerHTML = (upcoming.length ? upcoming.map(matchCard).join("") : '<p class="empty">'+t("m.none")+'</p>')+
      (recent.length ? '<div class="eyebrow m-eb">'+t("m.recent")+'</div>' + recent.map(matchCard).join("") : '');
  }

  function postForm(){
    var tm = new Date(); tm.setDate(tm.getDate() + 1);
    var lv = myLevel();
    modal('<div class="mpost"><h3>'+t("m.post")+'</h3>'+
      '<div class="field-row"><label class="field"><span>'+t("m.date")+'</span><input type="date" id="mpDate" value="'+tm.toISOString().slice(0,10)+'"></label>'+
      '<label class="field"><span>'+t("m.time")+'</span><input type="time" id="mpTime" value="19:00"></label></div>'+
      '<div class="field-row"><label class="field"><span>'+t("m.min")+'</span><input type="number" id="mpMin" step="0.25" min="0" max="7" value="'+Math.max(0, lv - 0.5).toFixed(2)+'"></label>'+
      '<label class="field"><span>'+t("m.max")+'</span><input type="number" id="mpMax" step="0.25" min="0" max="7" value="'+Math.min(7, lv + 0.5).toFixed(2)+'"></label></div>'+
      '<label class="field"><span>'+t("m.note")+'</span><input type="text" id="mpNote" maxlength="80"></label>'+
      '<p class="muted small">'+t("m.postHint")+'</p>'+
      '<button class="btn btn-primary" id="mpGo">'+t("m.postGo")+'</button></div>');
  }

  function resultForm(id){
    var m = MATCHES.filter(function(x){ return x.id === id; })[0];
    if(!m) return;
    var me = myId();
    modal('<div class="mres"><h3>'+t("m.addResult")+'</h3><p class="muted small">'+t("m.partner")+'</p>'+
      '<div class="mr-pick">'+m.players.filter(function(p){ return p.id !== me; }).map(function(p){
        return '<label class="mr-opt"><input type="radio" name="mrPartner" value="'+p.id+'"> '+esc(p.n)+'</label>';
      }).join("")+'</div>'+
      '<label class="field"><span>'+t("m.score")+'</span><input type="text" id="mrScore" placeholder="6-4 6-3" maxlength="40"></label>'+
      '<div class="mr-pick"><label class="mr-opt"><input type="radio" name="mrWin" value="1"> '+t("m.weWon")+'</label>'+
      '<label class="mr-opt"><input type="radio" name="mrWin" value="2"> '+t("m.theyWon")+'</label></div>'+
      '<button class="btn btn-primary" id="mrGo" data-mid="'+id+'">'+t("c.save")+'</button></div>');
  }

  document.addEventListener("click", function(e){
    var tb = e.target.closest("[data-mtab]");
    if(tb){ matchTab = tb.dataset.mtab; renderMatches(); return; }
    if(e.target.closest("#matchPost")){ postForm(); return; }
    if(e.target.closest("#mpGo")){
      var date = $("#mpDate").value, time = $("#mpTime").value || "19:00";
      var min = parseFloat($("#mpMin").value), max = parseFloat($("#mpMax").value), note = ($("#mpNote").value || "").trim();
      if(!date){ $("#mpDate").focus(); return; }
      if(isNaN(min) || isNaN(max) || min > max){ $("#mpMax").focus(); return; }
      var at = new Date(date + "T" + time);
      if(at < new Date()){ window.r2toast(t("m.future")); return; }
      if(!REAL){
        demoMatches().push({id:"m" + Date.now(), by:"p1", at:at.toISOString(), min:min, max:max, note:note, status:"open", score:"", winner:null, players:[{id:"p1", n:rosterName("p1"), team:null}]});
        D.__matches.sort(function(a,b){ return new Date(a.at) - new Date(b.at); });
        closeModal(); renderMatches(); window.r2toast(t("m.posted")); return;
      }
      $("#mpGo").disabled = true;
      PVB.act.createMatch(at.toISOString(), min, max, note).then(function(){ closeModal(); window.r2toast(t("m.posted")); loadMatches(); })
        .catch(function(err){ oops(err); var b = $("#mpGo"); if(b) b.disabled = false; });
      return;
    }
    var j = e.target.closest("[data-mjoin]");
    if(j){
      haptic();
      if(!REAL){
        var m = demoMatches().filter(function(x){ return x.id === j.dataset.mjoin; })[0];
        m.players.push({id:"p1", n:rosterName("p1"), team:null});
        if(m.players.length >= 4){ m.status = "full"; window.r2toast(t("m.fullNow")); } else window.r2toast(t("m.joined"));
        renderMatches(); return;
      }
      PVB.act.joinMatch(j.dataset.mjoin).then(function(r){ window.r2toast(r === "full" ? t("m.fullNow") : t("m.joined")); loadMatches(); }).catch(oops);
      return;
    }
    var l = e.target.closest("[data-mleave]");
    if(l){
      if(!window.confirm(t("m.leaveQ"))) return;
      if(!REAL){
        var m2 = demoMatches().filter(function(x){ return x.id === l.dataset.mleave; })[0];
        m2.players = m2.players.filter(function(p){ return p.id !== "p1"; });
        m2.status = m2.players.length ? "open" : "cancelled";
        D.__matches = D.__matches.filter(function(x){ return x.status !== "cancelled"; });
        renderMatches(); return;
      }
      PVB.act.leaveMatch(l.dataset.mleave).then(loadMatches).catch(oops);
      return;
    }
    var r = e.target.closest("[data-mresult]");
    if(r){ resultForm(r.dataset.mresult); return; }
    if(e.target.closest("#mrGo")){
      var id = e.target.closest("#mrGo").dataset.mid;
      var mt = MATCHES.filter(function(x){ return x.id === id; })[0];
      var partner = (document.querySelector('input[name="mrPartner"]:checked') || {}).value;
      var win = (document.querySelector('input[name="mrWin"]:checked') || {}).value;
      var score = ($("#mrScore").value || "").trim();
      if(!partner || !win){ window.r2toast(t("m.need")); return; }
      var me = myId();
      var t1 = [me, partner], t2 = mt.players.map(function(p){ return p.id; }).filter(function(x){ return t1.indexOf(x) === -1; });
      var winner = win === "1" ? 1 : 2;
      if(!REAL){
        mt.players.forEach(function(p){ p.team = t1.indexOf(p.id) !== -1 ? 1 : 2; });
        mt.status = "played"; mt.score = score; mt.winner = winner;
        closeModal(); renderMatches(); window.r2toast(t("m.saved")); return;
      }
      PVB.act.recordResult(id, t1, t2, score, winner).then(function(){ closeModal(); window.r2toast(t("m.saved")); loadMatches(); }).catch(oops);
    }
  });

  /* ================================================================ club vs club */

  var RANKS = null;
  function demoRanks(){
    return [
      {club_id:"me", name:"Miami Padel Club", city:"Miami", country:"US", players:46, avg_level:3.12, sessions_pp:6.4, gain_90:0.31, ratings_30:212},
      {club_id:"d2", name:"Sample club", city:"Madrid", country:"ES", players:88, avg_level:3.48, sessions_pp:5.1, gain_90:0.22, ratings_30:301},
      {club_id:"d3", name:"Sample club", city:"Lisbon", country:"PT", players:34, avg_level:2.91, sessions_pp:7.0, gain_90:0.27, ratings_30:96},
      {club_id:"d4", name:"Sample club", city:"Milan", country:"IT", players:61, avg_level:3.30, sessions_pp:4.2, gain_90:0.18, ratings_30:150}
    ];
  }
  function rankScore(c){ return (Number(c.gain_90) || 0) * 10 + (Number(c.sessions_pp) || 0); }
  function renderRanks(){
    var el = $("#ranksBody");
    if(!el) return;
    if(RANKS === null){
      RANKS = [];
      if(!REAL){ RANKS = demoRanks(); }
      else { PVB.act.rankings().then(function(r){ RANKS = r || []; renderRanks(); }).catch(function(){}); }
    }
    var mine = REAL && D.ME ? D.ME.club.id : "me";
    var list = RANKS.slice().sort(function(a,b){ return rankScore(b) - rankScore(a); });
    el.innerHTML = list.length ? list.map(function(c, i){
      return '<div class="rank'+(c.club_id === mine ? " me" : "")+'"><span class="pos">'+(i+1)+'</span>'+
        '<span class="who">'+esc(c.name)+'<small>'+esc([c.city, c.country].filter(Boolean).join(", "))+' · '+c.players+' '+t("cr.players")+'</small></span>'+
        '<span class="cr-stat"><b>'+(c.gain_90 >= 0 ? "+" : "")+Number(c.gain_90).toFixed(2)+'</b><small>'+t("cr.gain")+'</small></span>'+
        '<span class="cr-stat"><b>'+Number(c.sessions_pp).toFixed(1)+'</b><small>'+t("cr.sess")+'</small></span></div>';
    }).join("") + (REAL ? '' : '<p class="muted small">'+t("cr.demo")+'</p>') : '<p class="empty">'+t("cr.none")+'</p>';
  }

  /* ================================================================ join a club by QR code */

  var JOIN_KEY = "pv.join";
  (function(){
    var c = new URLSearchParams(location.search).get("join");
    if(c && /^[A-Za-z0-9]{4,12}$/.test(c)){ try{ localStorage.setItem(JOIN_KEY, c.toUpperCase()); }catch(e){} }
  })();
  function joinCode(){ try{ return localStorage.getItem(JOIN_KEY) || ""; }catch(e){ return ""; } }
  function clearJoin(){ try{ localStorage.removeItem(JOIN_KEY); }catch(e){} }

  function paintJoinGate(){
    var code = joinCode(), box = $("#gateJoin");
    if(!box) return;
    if(!code || !PVB || !PVB.ready){ box.hidden = true; return; }
    PVB.act.clubByCode(code).then(function(c){
      if(!c){ box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = '<div class="eyebrow">'+t("j.joining")+'</div><b>'+esc(c.name)+'</b>'+(c.city ? '<small>'+esc(c.city)+'</small>' : '');
    }).catch(function(){ box.hidden = true; });
  }

  function showWaiting(st, clubName){
    showNoClub(st);
    $("#gateNoClub").innerHTML = '<p>'+t("j.sent", {club: esc(clubName || "")})+'</p>'+
      '<button class="btn btn-ghost btn-sm" id="gateRetry">'+t("j.check")+'</button> <button class="btn btn-ghost btn-sm" id="gateOut">'+t("c.signOut")+'</button>';
  }
  document.addEventListener("click", function(e){ if(e.target.closest("#gateRetry")) location.reload(); });

  /* ================================================================ weekly challenges */

  var CHAL = null;
  function demoChal(){
    return CHAL || (CHAL = {streak:5, items:[
      {key:"train3", target:3, progress:2, points:50, claimed:false},
      {key:"drills2", target:2, progress:2, points:30, claimed:false},
      {key:"match1", target:1, progress:1, points:30, claimed:true}]});
  }
  function loadChallenges(){
    if(role !== "player") return;
    if(!REAL){ demoChal(); renderChallenges(); return; }
    PVB.act.challenges().then(function(c){ CHAL = c; renderChallenges(); }).catch(function(){});
  }
  function renderChallenges(){
    var el = $("#chalBody"), card = $("#chalCard");
    if(!el) return;
    card.hidden = role !== "player" || !CHAL;
    if(!CHAL) return;
    $("#chalStreak").textContent = CHAL.streak ? "🔥 " + t("ch.streak", {n:CHAL.streak}) : t("ch.noStreak");
    el.innerHTML = (CHAL.items || []).map(function(c){
      var done = c.progress >= c.target, pct = Math.min(100, c.progress / c.target * 100);
      return '<div class="chal'+(c.claimed ? " claimed" : done ? " ready" : "")+'">'+
        '<div class="chal-hd"><b>'+t("ch." + c.key)+'</b><span>'+Math.min(c.progress, c.target)+'/'+c.target+'</span></div>'+
        '<div class="track"><i style="width:'+pct+'%"></i></div>'+
        (c.claimed ? '<small class="good">&#10003; +'+c.points+' '+t("c.points")+'</small>' :
         done ? '<button class="btn btn-primary btn-sm" data-claim="'+c.key+'">'+t("ch.claim", {n:c.points})+'</button>' :
         '<small class="muted">+'+c.points+' '+t("c.points")+'</small>')+
      '</div>';
    }).join("");
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-claim]");
    if(!b || !CHAL) return;
    var item = CHAL.items.filter(function(x){ return x.key === b.dataset.claim; })[0];
    if(!item) return;
    haptic(24);
    if(!REAL){ item.claimed = true; award(item.points, t("ch." + item.key) + " · +" + item.points + " " + t("c.points")); renderChallenges(); return; }
    b.disabled = true;
    PVB.act.claimChallenge(item.key).then(function(n){
      item.claimed = true; renderChallenges();
      return sync(Promise.resolve(), t("ch." + item.key) + " · +" + n + " " + t("c.points"));
    }).catch(function(err){ oops(err); b.disabled = false; });
  });

  /* ================================================================ club feed with cheers */

  var FEED = null, CHEERS = {fire:"🔥", clap:"👏", muscle:"💪"};
  function demoFeed(){
    if(FEED) return FEED;
    var h = function(x){ return new Date(Date.now() - x * 36e5).toISOString(); };
    FEED = [
      {id:"f1", who:"p2", n:"Natalia Gomez", kind:"levelup", data:{level:3.75}, at:h(5), cheers:[{member_id:"p3", emoji:"fire"}, {member_id:"p4", emoji:"clap"}, {member_id:"p5", emoji:"fire"}]},
      {id:"f2", who:"p1", n:"Alex Rivera", kind:"goal", data:{skill:"Bandeja", target:6.0}, at:h(30), cheers:[{member_id:"p2", emoji:"muscle"}]},
      {id:"f3", who:"p3", n:"Jake Miller", kind:"matchwin", data:{score:"6-3 6-4"}, at:h(52), cheers:[]},
      {id:"f4", who:"p6", n:"Valentina Lopez", kind:"levelup", data:{level:3.0}, at:h(96), cheers:[{member_id:"p1", emoji:"clap"}]}
    ];
    return FEED;
  }
  function loadFeed(){
    if(role !== "player") return;
    if(!REAL){ demoFeed(); renderFeed(); return; }
    PVB.act.feed().then(function(f){ FEED = f || []; renderFeed(); }).catch(function(){});
  }
  function feedText(f){
    var first = esc((f.n || "").split(" ")[0]), d = f.data || {};
    if(f.kind === "levelup") return t("f.levelup", {who:first, level:Number(d.level).toFixed(2)});
    if(f.kind === "goal") return t("f.goal", {who:first, skill:esc(d.skill), target:Number(d.target).toFixed(1)});
    if(f.kind === "matchwin") return t("f.matchwin", {who:first, score:esc(d.score || "")});
    return first;
  }
  function renderFeed(){
    var el = $("#feedBody");
    if(!el || !FEED) return;
    var me = myId();
    el.innerHTML = FEED.length ? FEED.map(function(f){
      var mine = (f.cheers || []).filter(function(c){ return c.member_id === me; })[0];
      var count = {}; (f.cheers || []).forEach(function(c){ count[c.emoji] = (count[c.emoji] || 0) + 1; });
      return '<div class="fitem"><span class="avatar sm'+(f.who === me ? "" : " sea")+'">'+esc(initialsOf(f.n))+'</span>'+
        '<div class="fbody"><p>'+feedText(f)+'</p><small>'+ago(f.at)+'</small>'+
        '<div class="cheers">'+Object.keys(CHEERS).map(function(k){
          return '<button class="cheer'+(mine && mine.emoji === k ? " on" : "")+'" data-cheer="'+k+'" data-feed="'+f.id+'" aria-label="'+k+'">'+CHEERS[k]+(count[k] ? ' <b>'+count[k]+'</b>' : '')+'</button>';
        }).join("")+(f.who === me ? '<button class="cheer share" data-sharefeed="'+f.id+'">'+t("pp.share")+'</button>' : '')+'</div></div></div>';
    }).join("") : '<p class="muted small">'+t("f.empty")+'</p>';
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-cheer]");
    if(!b || !FEED) return;
    var f = FEED.filter(function(x){ return x.id === b.dataset.feed; })[0], me = myId(), k = b.dataset.cheer;
    if(!f) return;
    var cur = (f.cheers || []).filter(function(c){ return c.member_id === me; })[0];
    var next = cur && cur.emoji === k ? null : k;
    f.cheers = (f.cheers || []).filter(function(c){ return c.member_id !== me; });
    if(next) f.cheers.push({member_id:me, emoji:next});
    haptic(); renderFeed();
    if(REAL) PVB.act.cheer(f.id, next).catch(oops);
  });

  /* ================================================================ private lessons */

  var LESSONS = null;
  function demoLessons(){
    if(LESSONS) return LESSONS;
    var at = function(d, h){ var x = new Date(); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
    LESSONS = [
      {id:"l1", coach:"c0", coachName:"Diego Morales", at:at(1, 8), min:60, price:"$70", note:"Court 2", by:null, status:"open"},
      {id:"l2", coach:"c0", coachName:"Diego Morales", at:at(2, 17), min:60, price:"$70", note:"", by:null, status:"open"},
      {id:"l3", coach:"c1", coachName:"Sofia Castillo", at:at(3, 9), min:45, price:"$55", note:"Fitness and footwork", by:null, status:"open"},
      {id:"l4", coach:"c0", coachName:"Diego Morales", at:at(4, 18), min:60, price:"$70", note:"", by:"p1", byName:"Alex Rivera", status:"booked"}
    ];
    return LESSONS;
  }
  function loadLessons(){
    if(!REAL){ demoLessons(); renderLessons(); return; }
    PVB.act.lessons().then(function(l){ LESSONS = l || []; renderLessons(); }).catch(function(){});
  }
  function lessonRow(l, mode){
    var d = new Date(l.at), me = myId();
    var meta = [l.min + " min", l.price, l.note].filter(Boolean).map(esc).join(" · ");
    var act = "";
    if(mode === "player"){
      act = l.by === me ? '<span class="chip sea">'+t("ls.yours")+'</span><button class="link-btn" data-lcancel="'+l.id+'">'+t("ls.cancel")+'</button>'
                        : '<button class="btn btn-primary btn-sm" data-lbook="'+l.id+'">'+t("ls.book")+'</button>';
    } else {
      act = l.status === "booked" ? '<span class="chip sea">'+esc((l.byName || "").split(" ")[0] || t("ls.booked"))+'</span><button class="link-btn danger" data-lcancel="'+l.id+'">'+t("ls.cancel")+'</button>'
                                  : '<span class="chip">'+t("ls.open")+'</span><button class="link-btn danger" data-ldel="'+l.id+'">'+t("ls.remove")+'</button>';
    }
    return '<div class="lrow"><div class="lwhen"><b>'+fmtDay(d)+'</b><span>'+fmtTime(d)+'</span></div>'+
      '<div class="lbody"><b>'+esc(mode === "player" ? l.coachName : (l.status === "booked" ? (l.byName || t("ls.booked")) : t("ls.open")))+'</b><small>'+meta+'</small></div>'+
      '<div class="lact">'+act+'</div></div>';
  }
  function renderLessons(){
    if(!LESSONS) return;
    var me = myId(), pl = $("#lessonsBody"), co = $("#cLessonsBody");
    if(pl){
      var mine = LESSONS.filter(function(l){ return l.by === me; });
      var open = LESSONS.filter(function(l){ return l.status === "open" && new Date(l.at) > new Date(); });
      pl.innerHTML = (mine.length ? mine.map(function(l){ return lessonRow(l, "player"); }).join("") : '')+
        (open.length ? open.map(function(l){ return lessonRow(l, "player"); }).join("") : '<p class="muted small">'+t("ls.none")+'</p>');
    }
    if(co){
      var mySlots = LESSONS.filter(function(l){ return l.coach === (REAL ? me : "c0"); });
      co.innerHTML = mySlots.length ? mySlots.map(function(l){ return lessonRow(l, "coach"); }).join("") : '<p class="muted small">'+t("ls.noneCoach")+'</p>';
    }
  }
  function slotForm(){
    var tm = new Date(); tm.setDate(tm.getDate() + 1);
    modal('<div class="mpost"><h3>'+t("ls.add")+'</h3>'+
      '<div class="field-row"><label class="field"><span>'+t("m.date")+'</span><input type="date" id="lsDate" value="'+tm.toISOString().slice(0,10)+'"></label>'+
      '<label class="field"><span>'+t("m.time")+'</span><input type="time" id="lsTime" value="09:00"></label></div>'+
      '<div class="field-row"><label class="field"><span>'+t("ls.minutes")+'</span><input type="number" id="lsMin" value="60" min="15" max="240" step="15"></label>'+
      '<label class="field"><span>'+t("ls.price")+'</span><input type="text" id="lsPrice" maxlength="20" placeholder="$70"></label></div>'+
      '<label class="field"><span>'+t("m.note")+'</span><input type="text" id="lsNote" maxlength="80"></label>'+
      '<label class="field"><span>'+t("ls.repeat")+'</span><select id="lsRep"><option value="1">'+t("ls.once")+'</option><option value="4">4</option><option value="8">8</option></select></label>'+
      '<button class="btn btn-primary" id="lsGo">'+t("ls.add")+'</button></div>');
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("#addSlot")){ slotForm(); return; }
    if(e.target.closest("#lsGo")){
      var date = $("#lsDate").value, time = $("#lsTime").value || "09:00", mins = parseInt($("#lsMin").value, 10) || 60;
      var price = ($("#lsPrice").value || "").trim(), note = ($("#lsNote").value || "").trim(), rep = parseInt($("#lsRep").value, 10) || 1;
      if(!date){ $("#lsDate").focus(); return; }
      var first = new Date(date + "T" + time);
      if(first < new Date()){ window.r2toast(t("m.future")); return; }
      var times = []; for(var i = 0; i < rep; i++) times.push(new Date(first.getTime() + i * 7 * 864e5));
      if(!REAL){
        times.forEach(function(x, i){ demoLessons().push({id:"l" + Date.now() + i, coach:"c0", coachName:"Diego Morales", at:x.toISOString(), min:mins, price:price, note:note, by:null, status:"open"}); });
        LESSONS.sort(function(a,b){ return new Date(a.at) - new Date(b.at); });
        closeModal(); renderLessons(); window.r2toast(t("ls.added", {n:times.length})); return;
      }
      $("#lsGo").disabled = true;
      Promise.all(times.map(function(x){ return PVB.act.addSlot(x.toISOString(), mins, price, note); }))
        .then(function(){ closeModal(); window.r2toast(t("ls.added", {n:times.length})); loadLessons(); })
        .catch(function(err){ oops(err); var b = $("#lsGo"); if(b) b.disabled = false; });
      return;
    }
    var bk = e.target.closest("[data-lbook]");
    if(bk){
      var l = LESSONS.filter(function(x){ return x.id === bk.dataset.lbook; })[0];
      if(!l || !window.confirm(t("ls.confirm", {coach:l.coachName.split(" ")[0], when:fmtDay(new Date(l.at)) + " " + fmtTime(new Date(l.at))}))) return;
      haptic(24);
      if(!REAL){ l.by = myId(); l.byName = account ? account.name : ""; l.status = "booked"; renderLessons(); window.r2toast(t("ls.done")); return; }
      PVB.act.bookLesson(l.id).then(function(){ window.r2toast(t("ls.done")); loadLessons(); }).catch(function(err){ oops(err); loadLessons(); });
      return;
    }
    var cn = e.target.closest("[data-lcancel]");
    if(cn){
      if(!window.confirm(t("ls.cancelQ"))) return;
      var l2 = LESSONS.filter(function(x){ return x.id === cn.dataset.lcancel; })[0];
      if(!REAL){ if(role === "coach"){ LESSONS = LESSONS.filter(function(x){ return x !== l2; }); } else { l2.by = null; l2.status = "open"; } renderLessons(); return; }
      PVB.act.cancelLesson(cn.dataset.lcancel).then(loadLessons).catch(oops);
      return;
    }
    var dl = e.target.closest("[data-ldel]");
    if(dl){
      if(!REAL){ LESSONS = LESSONS.filter(function(x){ return x.id !== dl.dataset.ldel; }); renderLessons(); return; }
      PVB.act.deleteSlot(dl.dataset.ldel).then(loadLessons).catch(oops);
    }
  });

  /* ================================================================ season Wrapped */

  function seasonStats(){
    demoExtras();
    var yr = new Date(new Date().getFullYear(), 0, 1), H = D.HISTORY || {};
    var best = null, gain = null, rated = 0;
    Object.keys(H).forEach(function(k){
      var pts = H[k].filter(function(p){ return !p.at || new Date(p.at) >= yr; });
      rated += pts.length;
      if(!pts.length) return;
      var last = pts[pts.length-1].v, first = pts[0].v;
      if(!best || last > best.v) best = {k:k, v:last};
      if(pts.length > 1 && (!gain || last - first > gain.d)) gain = {k:k, d:Math.round((last - first)*10)/10};
    });
    var me = (D.ROSTER || []).filter(function(p){ return p.me; })[0] || {};
    var lad = (LADDER || []).filter(function(r){ return r.member_id === myId(); })[0] || {};
    return {
      name: (account && account.name) || D.PLAYER.name,
      club: (REAL && D.ME && D.ME.club && D.ME.club.name) || $("#acadName").textContent,
      sessions: REAL ? ((D.ME && D.ME.attendedSeason) || 0) : 48,
      level: REAL ? Number(D.ME && D.ME.level) || 0 : (me.rating || 3.25),
      rated: rated, best: best, gain: gain,
      played: lad.played || 0, wins: lad.wins || 0,
      points: REAL ? ((D.SEASON && D.SEASON.points) || 0) : 2140,
      drills: REAL ? ((D.SEASON && D.SEASON.drills) || 0) : (S.club.drillsDone || []).length + 9,
      year: new Date().getFullYear()
    };
  }

  function openWrapped(){
    var go = function(){
      var w = seasonStats();
      modal('<div class="wrapped"><div class="eyebrow">'+t("w.eyebrow", {year:w.year})+'</div><h3>'+esc(w.name.split(" ")[0])+', '+t("w.title")+'</h3>'+
        '<div class="w-grid">'+
          '<div class="w-big"><b>'+w.sessions+'</b><small>'+t("w.sessions")+'</small></div>'+
          '<div class="w-big"><b>'+w.level.toFixed(2)+'</b><small>'+t("w.level")+'</small></div>'+
          (w.gain ? '<div class="w-big hl"><b>+'+w.gain.d.toFixed(1)+'</b><small>'+t("w.gain", {shot:esc(w.gain.k)})+'</small></div>' : '')+
          (w.best ? '<div class="w-big"><b>'+w.best.v.toFixed(1)+'</b><small>'+t("w.best", {shot:esc(w.best.k)})+'</small></div>' : '')+
          '<div class="w-big"><b>'+w.wins+'<span>/'+w.played+'</span></b><small>'+t("w.matches")+'</small></div>'+
          '<div class="w-big"><b>'+fmt(w.points)+'</b><small>'+t("w.points")+'</small></div>'+
        '</div>'+
        '<p class="muted small">'+t("w.foot", {n:w.rated, d:w.drills})+'</p>'+
        '<button class="btn btn-primary" id="wShare">'+t("w.share")+'</button></div>');
    };
    if(REAL && role === "player" && !LADDER.length) PVB.act.ladder().then(function(l){ LADDER = l || []; go(); }).catch(go);
    else { if(!REAL && !LADDER.length) LADDER = demoLadder(); go(); }
  }

  function shareWrapped(){
    var w = seasonStats(), tiles = [[w.sessions, t("w.sessions")], [w.level.toFixed(2), t("w.level")]];
    if(w.gain) tiles.push(["+" + w.gain.d.toFixed(1), t("w.gainShort", {shot:w.gain.k}), true]);
    if(w.best) tiles.push([w.best.v.toFixed(1), t("w.bestShort", {shot:w.best.k})]);
    tiles.push([w.wins + "/" + w.played, t("w.matches")]); tiles.push([fmt(w.points), t("w.points")]);
    buildAndShare({eyebrow:t("w.story") + " " + w.year, name:w.name, tiles:tiles}, true, "padel-vitals-season.png", t("w.shareText"));
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("[data-wrapped]")){ openWrapped(); return; }
    if(e.target.closest("#wShare")) shareWrapped();
  });

  /* ================================================================ player card */

  var STAT_KEYS = [["Bandeja","BAN"],["Víbora","VIB"],["Wall exit","PAR"],["Volley","VOL"],["Serve & return","SAQ"],["Agility","AGI"]];
  function tierOf(level){ return level >= 4 ? "volt" : level >= 3 ? "gold" : level >= 2 ? "silver" : "bronze"; }
  function ovrOf(skills){
    var r = (skills || []).filter(function(s){ return !s.unrated && s.v > 0; });
    if(!r.length) return 0;
    return Math.round(r.reduce(function(t, s){ return t + s.v; }, 0) / r.length * 10);
  }
  function mySkillsNow(){
    var edits = S.club.skillEdits || {};
    return D.SKILLS.map(function(s){ return {n:s.n, v: edits[s.n] != null ? edits[s.n] : s.v, unrated:s.unrated}; });
  }

  /* cosmetics: the price list is mirrored on the server, which has the final say */
  var COSMETICS = [
    {id:"frame.ice",    slot:"frame", price:300,  sw:"linear-gradient(140deg,#BDF6FF,#35C6D6)"},
    {id:"frame.sunset", slot:"frame", price:400,  sw:"linear-gradient(140deg,#FFB86B,#FF5A7A)"},
    {id:"frame.gold",   slot:"frame", price:800,  sw:"linear-gradient(140deg,#FFE58A,#C99A2E)"},
    {id:"frame.neon",   slot:"frame", price:1200, sw:"linear-gradient(140deg,#C8F542,#35C6D6,#B48CFF)"},
    {id:"theme.ice",    slot:"theme", price:500,  color:"#5CE1E6"},
    {id:"theme.sunset", slot:"theme", price:500,  color:"#FF8A5B"},
    {id:"theme.violet", slot:"theme", price:500,  color:"#B48CFF"},
    {id:"theme.rose",   slot:"theme", price:500,  color:"#FF6FAE"},
    {id:"badge.fire",   slot:"badge", price:200,  emoji:"🔥"},
    {id:"badge.target", slot:"badge", price:300,  emoji:"🎯"},
    {id:"badge.bolt",   slot:"badge", price:300,  emoji:"⚡"},
    {id:"badge.crown",  slot:"badge", price:1000, emoji:"👑"}
  ];
  function cos(id){ return COSMETICS.filter(function(c){ return c.id === id; })[0] || null; }
  function owned(){ return REAL ? (D.OWNED || []) : (D.__owned = D.__owned || []); }
  function equipped(){ return REAL ? ((D.ME && D.ME.equipped) || {}) : (D.__eq = D.__eq || {}); }
  function badgeOf(eq){ var b = eq && eq.badge && cos(eq.badge); return b ? " " + b.emoji : ""; }

  function applyTheme(){
    var th = cos(equipped().theme), root = document.documentElement;
    if(th && role === "player"){
      root.style.setProperty("--coral", th.color);
      var h = th.color.replace("#", ""), r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
      root.style.setProperty("--coral-dim", "rgba(" + r + "," + g + "," + b + ",.14)");
    } else { root.style.removeProperty("--coral"); root.style.removeProperty("--coral-dim"); }
  }

  function cardHtml(p){
    /* p: {name, level, skills:[{n,v,unrated}], eq, club, logo} */
    var tier = tierOf(p.level), fr = p.eq && p.eq.frame ? p.eq.frame.split(".")[1] : "";
    var ovr = ovrOf(p.skills), map = {}; (p.skills || []).forEach(function(s){ map[s.n] = s; });
    var ini = String(p.club || "").split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0,3).toUpperCase();
    return '<div class="pcard t-'+tier+(fr ? " f-" + fr : "")+'"><div class="pc-in">'+
      '<div class="pc-top"><div class="pc-ovr"><b>'+(ovr || "–")+'</b><small>OVR</small></div>'+
        '<div class="pc-club">'+(p.logo ? '<img src="'+esc(p.logo)+'" alt="">' : '<span>'+esc(ini)+'</span>')+'</div></div>'+
      '<div class="pc-name">'+esc(p.name)+esc(badgeOf(p.eq))+'</div>'+
      '<div class="pc-lv">'+t("t.level")+' '+Number(p.level || 0).toFixed(2)+' · '+t("pc." + tier)+'</div>'+
      '<div class="pc-stats">'+STAT_KEYS.map(function(k){
        var s = map[k[0]], v = s && !s.unrated ? Math.round(s.v * 10) : null;
        return '<div><b>'+(v == null ? "–" : v)+'</b><small>'+k[1]+'</small></div>';
      }).join("")+'</div>'+
      '<div class="pc-foot">PADEL <span>VITALS</span></div></div></div>';
  }

  function myCardData(){
    return {name:myName(), level:myLevelNow(), skills:mySkillsNow(), eq:equipped(), club:clubName(), logo:clubLogoUrl()};
  }
  function renderPlayerCard(){
    var el = $("#pcardBody");
    if(!el) return;
    el.innerHTML = cardHtml(myCardData())+
      '<div class="pc-actions"><button class="btn btn-primary btn-sm" data-sharepc>'+t("pc.share")+'</button>'+
      '<button class="btn btn-ghost btn-sm" data-go="pts" data-shopjump>'+t("pc.style")+'</button></div>';
  }

  /* the card as an image, with both logos underneath */
  function drawPlayerCardImage(p, logo){
    var W = 1080, H = 1350, c = cardBase(W, H), x = c.x;
    var tier = tierOf(p.level), fr = p.eq && p.eq.frame ? p.eq.frame.split(".")[1] : "";
    var cols = {bronze:["#E0A06A","#7A4A26"], silver:["#E8EEF2","#8C99A3"], gold:["#FFE58A","#C99A2E"], volt:["#C8F542","#35C6D6"]}[tier];
    var frc = {ice:["#BDF6FF","#35C6D6"], sunset:["#FFB86B","#FF5A7A"], gold:["#FFE58A","#C99A2E"], neon:["#C8F542","#B48CFF"]}[fr] || cols;
    var cx = 240, cy = 250, cw = 600, ch = 800;
    var g = x.createLinearGradient(cx, cy, cx + cw, cy + ch); g.addColorStop(0, frc[0]); g.addColorStop(1, frc[1]);
    x.fillStyle = g; roundRect(x, cx, cy, cw, ch, 48); x.fill();
    var g2 = x.createLinearGradient(cx, cy, cx, cy + ch); g2.addColorStop(0, "#1C2126"); g2.addColorStop(1, "#0E1114");
    x.fillStyle = g2; roundRect(x, cx + 14, cy + 14, cw - 28, ch - 28, 38); x.fill();
    var ovr = ovrOf(p.skills);
    x.fillStyle = cols[0]; x.font = "400 150px Anton, Impact, sans-serif"; x.fillText(String(ovr || "–"), cx + 56, cy + 190);
    x.fillStyle = "#9AA3AB"; x.font = "600 30px 'IBM Plex Mono', monospace"; x.fillText("OVR", cx + 62, cy + 235);
    drawClubMark(x, cx + cw - 56 - 130, cy + 60, 130, logo);
    x.fillStyle = "#F2F4F5"; x.font = "700 60px 'Instrument Sans', sans-serif"; x.textAlign = "center";
    x.fillText((String(p.name || "").split(" ")[0] + badgeOf(p.eq)).slice(0, 18), cx + cw / 2, cy + 345);
    x.fillStyle = "#9AA3AB"; x.font = "600 28px 'IBM Plex Mono', monospace";
    x.fillText((t("t.level") + " " + Number(p.level).toFixed(2) + " · " + t("pc." + tier)).toUpperCase(), cx + cw / 2, cy + 395);
    var map = {}; (p.skills || []).forEach(function(s){ map[s.n] = s; });
    STAT_KEYS.forEach(function(k, i){
      var col = i % 2, row = Math.floor(i / 2), sx = cx + 130 + col * 250, sy = cy + 500 + row * 95;
      var s = map[k[0]], v = s && !s.unrated ? String(Math.round(s.v * 10)) : "–";
      x.textAlign = "left"; x.fillStyle = "#F2F4F5"; x.font = "400 66px Anton, Impact, sans-serif"; x.fillText(v, sx, sy);
      x.fillStyle = "#9AA3AB"; x.font = "600 30px 'IBM Plex Mono', monospace"; x.fillText(k[1], sx + 100, sy - 8);
    });
    x.textAlign = "left";
    drawBrandRow(x, W, H - 230, logo);
    return c.cv;
  }
  function sharePlayerCard(){
    var p = myCardData();
    Promise.all([cardFonts(), loadLogo()]).then(function(r){ shareCanvas(drawPlayerCardImage(p, r[1]), "padel-vitals-card.png", t("pc.shareText")); });
  }
  document.addEventListener("click", function(e){
    if(e.target.closest("[data-sharepc]")){ sharePlayerCard(); return; }
    if(e.target.closest("[data-shopjump]")) setTimeout(function(){ var s = $("#shopCard"); if(s) s.scrollIntoView({block:"start", behavior: calm ? "auto" : "smooth"}); }, 120);
  });

  /* ================================================================ cosmetics shop */

  function renderShop2(){
    var el = $("#cosShop");
    if(!el) return;
    var have = owned(), eq = equipped(), bal = points();
    el.innerHTML = ["frame","theme","badge"].map(function(slot){
      return '<div class="eyebrow cs-eb">'+t("cs." + slot)+'</div><div class="cs-grid">'+COSMETICS.filter(function(c){ return c.slot === slot; }).map(function(c){
        var mine = have.indexOf(c.id) !== -1, on = eq[slot] === c.id;
        var sw = c.sw ? '<span class="cs-sw" style="background:'+c.sw+'"></span>' : c.color ? '<span class="cs-sw" style="background:'+c.color+'"></span>' : '<span class="cs-sw cs-emoji">'+c.emoji+'</span>';
        var act = on ? '<button class="btn btn-ghost btn-sm" data-unequip="'+slot+'">'+t("cs.on")+'</button>' :
                  mine ? '<button class="btn btn-primary btn-sm" data-equip="'+c.id+'">'+t("cs.use")+'</button>' :
                  '<button class="btn btn-ghost btn-sm" data-buy="'+c.id+'"'+(bal < c.price ? " disabled" : "")+'>'+fmt(c.price)+' '+t("c.pts")+'</button>';
        return '<div class="cs-item'+(on ? " on" : "")+'">'+sw+'<b>'+t("cs." + c.id.replace(".", "_"))+'</b>'+act+'</div>';
      }).join("")+'</div>';
    }).join("");
  }
  document.addEventListener("click", function(e){
    var b = e.target.closest("[data-buy]");
    if(b){
      var c = cos(b.dataset.buy);
      if(!c || !window.confirm(t("cs.confirm", {item:t("cs." + c.id.replace(".", "_")), n:fmt(c.price)}))) return;
      haptic(24);
      if(!REAL){
        if(points() < c.price){ window.r2toast(t("p.short")); return; }
        owned().push(c.id); award(-c.price, t("cs.bought")); equipped()[c.slot] = c.id; applyTheme(); renderShop2(); renderPlayerCard(); return;
      }
      b.disabled = true;
      PVB.act.buyCosmetic(c.id).then(function(){ return PVB.act.equip(c.slot, c.id); })
        .then(function(){ return sync(Promise.resolve(), t("cs.bought")); }).then(function(){ applyTheme(); renderShop2(); renderPlayerCard(); })
        .catch(function(err){ oops(err); b.disabled = false; });
      return;
    }
    var q = e.target.closest("[data-equip]"), u = e.target.closest("[data-unequip]");
    if(q || u){
      var slot = q ? cos(q.dataset.equip).slot : u.dataset.unequip, item = q ? q.dataset.equip : null;
      if(item) equipped()[slot] = item; else delete equipped()[slot];
      applyTheme(); renderShop2(); renderPlayerCard();
      if(REAL) PVB.act.equip(slot, item).catch(oops);
    }
  });

  /* ================================================================ achievements */

  var ACH = [
    ["first",  "⭐", function(s){ return s.rated > 0; }],
    ["shot7",  "🎯", function(s){ return s.best >= 7; }],
    ["shot8",  "💥", function(s){ return s.best >= 8; }],
    ["shot9",  "🌟", function(s){ return s.best >= 9; }, true],
    ["allnine","🧩", function(s){ return s.allRated; }],
    ["lv3",    "🥉", function(s){ return s.level >= 3; }],
    ["lv4",    "🥈", function(s){ return s.level >= 4; }],
    ["lv5",    "🥇", function(s){ return s.level >= 5; }, true],
    ["s10",    "📅", function(s){ return s.sessions >= 10; }],
    ["s25",    "🗓️", function(s){ return s.sessions >= 25; }],
    ["s50",    "🏟️", function(s){ return s.sessions >= 50; }, true],
    ["st4",    "🔥", function(s){ return s.streak >= 4; }],
    ["st10",   "☄️", function(s){ return s.streak >= 10; }, true],
    ["d5",     "🏠", function(s){ return s.drills >= 5; }],
    ["d20",    "🧱", function(s){ return s.drills >= 20; }],
    ["goal",   "🏁", function(s){ return s.goals >= 1; }],
    ["goal3",  "🏆", function(s){ return s.goals >= 3; }],
    ["play1",  "🎾", function(s){ return s.played >= 1; }],
    ["win1",   "✌️", function(s){ return s.wins >= 1; }],
    ["win10",  "👑", function(s){ return s.wins >= 10; }, true],
    ["friend", "🤝", function(s){ return s.friends >= 1; }],
    ["friend5","🫂", function(s){ return s.friends >= 5; }],
    ["pass",   "🛂", function(s){ return s.passport; }],
    ["style",  "🎨", function(s){ return s.cosmetics >= 1; }]
  ];
  function achStats(){
    var sk = mySkillsNow(), rated = sk.filter(function(s){ return !s.unrated && s.v > 0; });
    var lad = (LADDER || []).filter(function(r){ return r.member_id === myId(); })[0] || {};
    var pp = REAL && D.ME ? D.ME.passport : D.__pp;
    return {rated:rated.length, best:rated.reduce(function(m, s){ return Math.max(m, s.v); }, 0), allRated:rated.length >= D.SKILLS.length,
            level:myLevelNow(), sessions: REAL ? ((D.ME && D.ME.attendedSeason) || 0) : 48, streak: CHAL ? CHAL.streak || 0 : 0,
            drills: REAL ? ((D.SEASON && D.SEASON.drills) || 0) : (S.club.drillsDone || []).length + 9,
            goals:(D.GOALS || []).filter(function(g){ return g.done; }).length, played:lad.played || 0, wins:lad.wins || 0,
            friends:friendsList().filter(function(f){ return f.status === "accepted"; }).length, passport:!!(pp && pp.on), cosmetics:owned().length};
  }
  function renderAchievements(){
    var el = $("#badges");
    if(!el || role !== "player") return;
    var st = achStats(), got = 0;
    var html = ACH.map(function(a){
      var on = !!a[2](st); if(on) got++;
      return '<div class="badge'+(on ? "" : " off")+(a[3] && on ? " rare" : "")+'" title="'+esc(t("a." + a[0] + "D"))+'"><span class="bi">'+a[1]+'</span>'+
        '<b>'+t("a." + a[0])+'</b><small>'+t("a." + a[0] + "D")+'</small></div>';
    }).join("");
    el.innerHTML = html;
    var c = $("#achCount"); if(c) c.textContent = got + "/" + ACH.length;
  }

  /* ================================================================ friends, head to head, compare */

  function friendsList(){
    if(REAL) return D.FRIENDS || [];
    return D.__friends || (D.__friends = [
      {id:"p2", n:"Natalia Gomez", status:"accepted"}, {id:"p3", n:"Jake Miller", status:"accepted"},
      {id:"p5", n:"Ryan Shah", status:"pending", incoming:true}]);
  }
  var H2H = null;
  function loadH2H(){
    if(!REAL){ H2H = [{opponent:"p2", full_name:"Natalia Gomez", played:5, won:3}, {opponent:"p3", full_name:"Jake Miller", played:4, won:1}, {opponent:"p6", full_name:"Valentina Lopez", played:2, won:2}]; renderFriends(); renderRivals(); return; }
    PVB.act.headToHead().then(function(r){ H2H = r || []; renderFriends(); renderRivals(); }).catch(function(){});
  }
  function h2hFor(id){ return (H2H || []).filter(function(r){ return r.opponent === id; })[0]; }
  function rosterById(id){ return D.ROSTER.filter(function(p){ return p.id === id; })[0] || {}; }

  function renderFriends(){
    var el = $("#friendsBody");
    if(!el || role !== "player") return;
    var list = friendsList();
    var inc = list.filter(function(f){ return f.incoming; }), acc = list.filter(function(f){ return f.status === "accepted"; });
    el.innerHTML = inc.map(function(f){
      return '<div class="frow req"><span class="avatar sm sea">'+esc(initialsOf(f.n))+'</span><span class="who">'+esc(f.n)+'<small>'+t("fr.wants")+'</small></span>'+
        '<span class="fr-act"><button class="btn btn-primary btn-sm" data-fadd="'+f.id+'">'+t("fr.accept")+'</button><button class="link-btn" data-fdel="'+f.id+'">'+t("fr.decline")+'</button></span></div>';
    }).join("") + (acc.length ? acc.map(function(f){
      var r = rosterById(f.id), h = h2hFor(f.id);
      return '<div class="frow"><span class="avatar sm sea">'+esc(initialsOf(f.n))+'</span>'+
        '<span class="who">'+esc(f.n)+'<small>'+t("t.level")+' '+(Number(r.rating) || 0).toFixed(2)+(h ? ' · '+t("fr.h2h", {w:h.won, l:h.played - h.won}) : '')+'</small></span>'+
        '<span class="fr-act"><button class="btn btn-ghost btn-sm" data-fcard="'+f.id+'">'+t("fr.card")+'</button><button class="btn btn-primary btn-sm" data-fcmp="'+f.id+'">'+t("fr.compare")+'</button></span></div>';
    }).join("") : '<p class="muted small">'+t("fr.none")+'</p>') +
    '<button class="btn btn-ghost btn-sm fr-addbtn" id="friendAdd">'+t("fr.add")+'</button>';
  }

  function openAddFriends(){
    var list = friendsList(), me = myId(), known = {};
    list.forEach(function(f){ known[f.id] = f; });
    modal('<div class="fadd"><h3>'+t("fr.add")+'</h3><input type="search" id="faFind" class="find" placeholder="'+esc(t("t.find"))+'">'+
      '<div id="faList">'+D.ROSTER.filter(function(p){ return p.id !== me && !p.me; }).map(function(p){
        var k = known[p.id];
        var act = k ? (k.status === "accepted" ? '<span class="chip sea">'+t("fr.friends")+'</span>' : k.incoming ? '<button class="btn btn-primary btn-sm" data-fadd="'+p.id+'">'+t("fr.accept")+'</button>' : '<span class="chip">'+t("fr.sent")+'</span>')
                    : '<button class="btn btn-primary btn-sm" data-fadd="'+p.id+'">'+t("fr.addOne")+'</button>';
        return '<div class="frow" data-faname="'+esc(fold(p.n))+'"><span class="avatar sm sea">'+esc(p.i)+'</span><span class="who">'+esc(p.n)+'<small>'+esc(p.group || "")+' · '+(Number(p.rating) || 0).toFixed(2)+'</small></span><span class="fr-act">'+act+'</span></div>';
      }).join("")+'</div></div>');
  }

  function profileOf(id){
    if(!REAL){
      var p = rosterById(id), det = demoDetail(p);
      return Promise.resolve({id:id, name:p.n, level:p.rating, skills:det.skills, eq:id === "p2" ? {frame:"frame.gold", badge:"badge.crown"} : {}});
    }
    return PVB.act.friendProfile(id).then(function(r){
      var map = {}; (r.skills || []).forEach(function(s){ map[s.skill] = Number(s.score); });
      return {id:id, name:r.name, level:Number(r.level), eq:r.equipped || {},
              skills:D.SKILLS.map(function(s){ return {n:s.n, v:map[s.n] || 0, unrated:map[s.n] == null}; })};
    });
  }

  function radarSvg(a, b){
    var axes = STAT_KEYS, N = axes.length, R = 110, cx = 140, cy = 135;
    function pt(i, v){ var ang = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(ang) * R * v / 10, cy + Math.sin(ang) * R * v / 10]; }
    function poly(sk){ var m = {}; sk.forEach(function(s){ m[s.n] = s.unrated ? 0 : s.v; }); return axes.map(function(k, i){ return pt(i, m[k[0]] || 0).join(","); }).join(" "); }
    var rings = [2.5, 5, 7.5, 10].map(function(r){ return '<polygon points="'+axes.map(function(k, i){ return pt(i, r).join(","); }).join(" ")+'" class="rd-ring"/>'; }).join("");
    var labels = axes.map(function(k, i){ var p = pt(i, 12); return '<text x="'+p[0]+'" y="'+(p[1] + 4)+'" class="rd-lab" text-anchor="middle">'+k[1]+'</text>'; }).join("");
    return '<svg viewBox="0 0 280 270" class="rd" role="img" aria-label="Compare">'+rings+
      '<polygon points="'+poly(b)+'" class="rd-b"/><polygon points="'+poly(a)+'" class="rd-a"/>'+labels+'</svg>';
  }

  function openCompare(id){
    modal('<p class="muted small">…</p>');
    profileOf(id).then(function(f){
      var me = mySkillsNow(), fm = {}; f.skills.forEach(function(s){ fm[s.n] = s; });
      var h = h2hFor(id);
      $("#modalBody").innerHTML = '<div class="cmp"><h3>'+t("fr.youVs", {who:esc(f.name.split(" ")[0])})+'</h3>'+
        '<div class="cmp-legend"><span class="a">'+t("q.you")+' · '+ovrOf(me)+'</span><span class="b">'+esc(f.name.split(" ")[0])+' · '+ovrOf(f.skills)+'</span></div>'+
        radarSvg(me, f.skills)+
        (h ? '<div class="cmp-h2h"><b>'+h.won+' – '+(h.played - h.won)+'</b><small>'+t("fr.h2hLong", {who:esc(f.name.split(" ")[0]), n:h.played})+'</small></div>' : '')+
        '<div class="cmp-rows">'+me.map(function(s){
          var o = fm[s.n] || {v:0, unrated:true}, a = s.unrated ? null : s.v, b = o.unrated ? null : o.v;
          var d = a != null && b != null ? Math.round((a - b) * 10) / 10 : null;
          return '<div class="cmp-row"><b class="'+(d > 0 ? "up" : "")+'">'+(a == null ? "–" : a.toFixed(1))+'</b><span>'+esc(s.n)+'</span><b class="'+(d < 0 ? "up" : "")+'">'+(b == null ? "–" : b.toFixed(1))+'</b></div>';
        }).join("")+'</div>'+
        '<p class="muted small">'+t("fr.tip")+'</p></div>';
    }).catch(function(err){ closeModal(); oops(err); });
  }
  function openFriendCard(id){
    modal('<p class="muted small">…</p>');
    profileOf(id).then(function(f){
      $("#modalBody").innerHTML = '<div class="fcard">'+cardHtml({name:f.name, level:f.level, skills:f.skills, eq:f.eq, club:clubName(), logo:clubLogoUrl()})+
        '<button class="btn btn-primary btn-sm" data-fcmp="'+id+'">'+t("fr.compare")+'</button></div>';
    }).catch(function(err){ closeModal(); oops(err); });
  }

  function renderRivals(){
    var el = $("#rivalsBody");
    if(!el || !H2H) return;
    var list = H2H.slice().sort(function(a,b){ return b.played - a.played; });
    el.innerHTML = list.length ? list.map(function(r){
      var l = r.played - r.won, pct = r.played ? r.won / r.played * 100 : 0;
      return '<div class="rival"><span class="avatar sm sea">'+esc(initialsOf(r.full_name))+'</span><span class="who">'+esc(r.full_name)+'<small>'+t("fr.played", {n:r.played})+'</small></span>'+
        '<span class="rv-bar"><i style="width:'+pct+'%"></i></span><b class="rv-sc">'+r.won+'–'+l+'</b></div>';
    }).join("") : '<p class="empty">'+t("fr.noRivals")+'</p>';
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#friendAdd")){ openAddFriends(); return; }
    var a = e.target.closest("[data-fadd]");
    if(a){
      var id = a.dataset.fadd, list = friendsList(), ex = list.filter(function(f){ return f.id === id; })[0];
      haptic();
      if(!REAL){
        if(ex){ ex.status = "accepted"; ex.incoming = false; } else list.push({id:id, n:rosterById(id).n, status:"pending"});
        window.r2toast(ex ? t("fr.nowFriends") : t("fr.sent")); renderFriends(); renderAchievements();
        if($("#faList")) openAddFriends(); return;
      }
      PVB.act.addFriend(id).then(function(r){ window.r2toast(r === "accepted" ? t("fr.nowFriends") : t("fr.sent")); return reload(); })
        .then(function(){ if($("#faList")) openAddFriends(); }).catch(oops);
      return;
    }
    var d = e.target.closest("[data-fdel]");
    if(d){
      if(!REAL){ D.__friends = friendsList().filter(function(f){ return f.id !== d.dataset.fdel; }); renderFriends(); return; }
      PVB.act.removeFriend(d.dataset.fdel).then(reload).catch(oops);
      return;
    }
    var c = e.target.closest("[data-fcmp]");
    if(c){ openCompare(c.dataset.fcmp); return; }
    var fc = e.target.closest("[data-fcard]");
    if(fc){ openFriendCard(fc.dataset.fcard); return; }
  });
  document.addEventListener("input", function(e){
    if(e.target.id !== "faFind") return;
    var q = fold(e.target.value);
    $$("#faList [data-faname]").forEach(function(r){ r.hidden = q && r.dataset.faname.indexOf(q) === -1; });
  });

  /* ================================================================ live scoreboard */

  var SB = null, wakeLock = null;
  function sbNew(){ return {p:[0,0], g:[0,0], sets:[], adv:null, golden:true, best:3, tb:false, done:false, winner:null, hist:[]}; }
  function sbSnap(){ return JSON.stringify({p:SB.p, g:SB.g, sets:SB.sets, adv:SB.adv, tb:SB.tb, done:SB.done, winner:SB.winner}); }
  function sbPointName(i){
    if(SB.tb) return String(SB.p[i]);
    var o = 1 - i;
    if(SB.p[i] >= 3 && SB.p[o] >= 3 && !SB.golden){
      if(SB.adv === i) return "AD"; if(SB.adv === o) return "40"; return "40";
    }
    return ["0","15","30","40"][Math.min(SB.p[i], 3)];
  }
  function sbWinGame(i){
    SB.g[i]++; SB.p = [0,0]; SB.adv = null;
    var o = 1 - i, gi = SB.g[i], go = SB.g[o];
    if(SB.tb || (gi >= 6 && gi - go >= 2) || gi === 7){
      SB.sets.push([SB.g[0], SB.g[1]]); SB.g = [0,0]; SB.tb = false;
      var won = SB.sets.filter(function(s){ return s[i] > s[o]; }).length;
      if(won > SB.best / 2){ SB.done = true; SB.winner = i; }
    } else if(SB.g[0] === 6 && SB.g[1] === 6){ SB.tb = true; }
  }
  function sbPoint(i){
    if(SB.done) return;
    SB.hist.push(sbSnap());
    var o = 1 - i;
    if(SB.tb){
      SB.p[i]++;
      if(SB.p[i] >= 7 && SB.p[i] - SB.p[o] >= 2) sbWinGame(i);
      return;
    }
    if(SB.p[i] >= 3 && SB.p[o] >= 3){
      if(SB.golden){ sbWinGame(i); return; }
      if(SB.adv === i){ sbWinGame(i); return; }
      if(SB.adv === o){ SB.adv = null; return; }
      SB.adv = i; return;
    }
    SB.p[i]++;
    if(SB.p[i] >= 4) sbWinGame(i);
  }
  function sbScoreText(){ return SB.sets.map(function(s){ return s[0] + "-" + s[1]; }).join(" "); }

  function sbHtml(){
    var sets = SB.sets.map(function(s){ return '<span>'+s[0]+'–'+s[1]+'</span>'; }).join("");
    var side = function(i){
      return '<button class="sb-side s'+i+(SB.winner === i ? " won" : "")+'" data-sbpt="'+i+'"'+(SB.done ? " disabled" : "")+'>'+
        '<small>'+(i === 0 ? t("sb.us") : t("sb.them"))+'</small><b>'+sbPointName(i)+'</b><em>'+SB.g[i]+' '+t("sb.games")+'</em></button>';
    };
    return '<div class="sboard">'+
      '<div class="sb-top"><span class="sb-sets">'+(sets || t("sb.set1"))+(SB.tb ? '<span class="chip ochre">'+t("sb.tb")+'</span>' : '')+'</span>'+
      '<label class="sb-gp"><input type="checkbox" id="sbGolden"'+(SB.golden ? " checked" : "")+'> '+t("sb.golden")+'</label></div>'+
      '<div class="sb-sides">'+side(0)+side(1)+'</div>'+
      (SB.done ? '<div class="sb-done"><b>'+(SB.winner === 0 ? t("sb.weWon") : t("sb.theyWon"))+'</b><span>'+sbScoreText()+'</span>'+
        '<div class="row-btns">'+(sbOpenMatch() ? '<button class="btn btn-primary btn-sm" id="sbSave">'+t("sb.save")+'</button>' : '')+
        (SB.winner === 0 ? '<button class="btn btn-ghost btn-sm" data-sharewin="'+esc(sbScoreText())+'">'+t("sc.shareWin")+'</button>' : '')+
        '<button class="btn btn-ghost btn-sm" id="sbNew">'+t("sb.new")+'</button></div></div>' :
        '<div class="sb-bottom"><button class="btn btn-ghost btn-sm" id="sbUndo"'+(SB.hist.length ? "" : " disabled")+'>'+t("sb.undo")+'</button>'+
        '<select id="sbBest"><option value="3"'+(SB.best === 3 ? " selected" : "")+'>'+t("sb.best3")+'</option><option value="1"'+(SB.best === 1 ? " selected" : "")+'>'+t("sb.best1")+'</option></select></div>')+
    '</div>';
  }
  /* a match of mine with four players and no score yet, to save the result into */
  function sbOpenMatch(){
    var me = myId(), soon = Date.now() + 6 * 36e5;
    return (MATCHES || []).filter(function(m){
      return m.status !== "played" && m.players.length === 4 && new Date(m.at).getTime() < soon && m.players.some(function(p){ return p.id === me; });
    }).sort(function(a,b){ return new Date(b.at) - new Date(a.at); })[0] || null;
  }
  function openScoreboard(){
    if(!SB || SB.done) SB = sbNew();
    modal(sbHtml());
    document.body.classList.add("sb-open");
    if(navigator.wakeLock && navigator.wakeLock.request){ navigator.wakeLock.request("screen").then(function(w){ wakeLock = w; }).catch(function(){}); }
  }
  function sbPaint(){ var b = $("#modalBody"); if(b && b.querySelector(".sboard")) b.innerHTML = sbHtml(); }
  document.addEventListener("click", function(e){
    if(e.target.closest("#openScoreboard")){ openScoreboard(); return; }
    var s = e.target.closest("[data-sbpt]");
    if(s && SB){ haptic(14); sbPoint(+s.dataset.sbpt); sbPaint(); return; }
    if(e.target.closest("#sbUndo") && SB && SB.hist.length){ var h = JSON.parse(SB.hist.pop()); Object.assign(SB, h); sbPaint(); return; }
    if(e.target.closest("#sbNew")){ var g = SB ? SB.golden : true, b2 = SB ? SB.best : 3; SB = sbNew(); SB.golden = g; SB.best = b2; sbPaint(); return; }
    if(e.target.closest("#sbSave")){
      var m = sbOpenMatch(), score = sbScoreText(), won = SB.winner === 0;
      if(!m) return;
      resultForm(m.id);
      setTimeout(function(){
        var sc = $("#mrScore"); if(sc) sc.value = score;
        var r = document.querySelector('input[name="mrWin"][value="'+(won ? "1" : "2")+'"]'); if(r) r.checked = true;
      }, 30);
    }
  });
  document.addEventListener("change", function(e){
    if(e.target.id === "sbGolden" && SB){ SB.golden = e.target.checked; sbPaint(); }
    if(e.target.id === "sbBest" && SB){ SB.best = +e.target.value; sbPaint(); }
  });
  /* release the screen when the board closes */
  new MutationObserver(function(){
    if($("#modal").hidden && document.body.classList.contains("sb-open")){
      document.body.classList.remove("sb-open");
      if(wakeLock){ try{ wakeLock.release(); }catch(err){} wakeLock = null; }
    }
  }).observe($("#modal"), {attributes:true, attributeFilter:["hidden"]});

  /* ================================================================ drill timer */

  var TM = null, audioCtx = null;
  function beep(freq, ms){
    try{
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = freq; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.18, audioCtx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + ms / 1000);
      o.start(); o.stop(audioCtx.currentTime + ms / 1000);
    }catch(e){}
  }
  function tmHtml(){
    var d = TM.drill, phase = TM.phase, total = phase === "work" ? TM.work : TM.rest;
    var pct = TM.left / total * 100;
    var mm = Math.floor(TM.left / 60), ss = TM.left % 60;
    return '<div class="dtimer ph-'+phase+'"><div class="eyebrow">'+esc(d.n)+'</div>'+
      '<div class="dt-ring" style="--p:'+pct+'"><div><b>'+(mm ? mm + ":" + String(ss).padStart(2, "0") : ss)+'</b><small>'+
        (phase === "done" ? t("dt.done") : phase === "work" ? t("dt.work") : phase === "rest" ? t("dt.rest") : t("dt.ready"))+'</small></div></div>'+
      '<div class="dt-round">'+t("dt.round", {n:Math.min(TM.round, TM.rounds), of:TM.rounds})+'</div>'+
      (TM.phase === "idle" ? '<div class="field-row dt-set">'+
        '<label class="field"><span>'+t("dt.work")+'</span><input type="number" id="dtWork" min="5" max="600" value="'+TM.work+'"></label>'+
        '<label class="field"><span>'+t("dt.rest")+'</span><input type="number" id="dtRest" min="0" max="300" value="'+TM.rest+'"></label>'+
        '<label class="field"><span>'+t("dt.rounds")+'</span><input type="number" id="dtRounds" min="1" max="30" value="'+TM.rounds+'"></label></div>' : '')+
      '<div class="row-btns dt-btns">'+
        (TM.phase === "done" ? '<button class="btn btn-ghost" id="dtReset">'+t("dt.again")+'</button>' :
         TM.running ? '<button class="btn btn-ghost" id="dtPause">'+t("dt.pause")+'</button>' :
         '<button class="btn btn-primary" id="dtStart">'+(TM.phase === "idle" ? t("dt.start") : t("dt.resume"))+'</button>')+
        (TM.phase !== "idle" && TM.phase !== "done" ? '<button class="btn btn-ghost" id="dtReset">'+t("dt.reset")+'</button>' : '')+
      '</div></div>';
  }
  function tmPaint(){ var b = $("#modalBody"); if(b && b.querySelector(".dtimer")) b.innerHTML = tmHtml(); else tmStop(); }
  function tmStop(){ if(TM && TM.iv){ clearInterval(TM.iv); TM.iv = null; } if(TM) TM.running = false; }
  function tmTick(){
    if(!TM || !TM.running) return;
    TM.left--;
    if(TM.left > 0 && TM.left <= 3) beep(660, 120);
    if(TM.left <= 0){
      if(TM.phase === "work"){
        if(TM.round >= TM.rounds){ TM.phase = "done"; TM.left = 0; tmStop(); beep(990, 500); haptic(200); tmFinish(); }
        else if(TM.rest > 0){ TM.phase = "rest"; TM.left = TM.rest; beep(440, 300); haptic(60); }
        else { TM.round++; TM.left = TM.work; beep(880, 300); haptic(60); }
      } else { TM.phase = "work"; TM.round++; TM.left = TM.work; beep(880, 300); haptic(60); }
    }
    tmPaint();
  }
  function tmFinish(){
    var d = TM.drill;
    if(S.drillDone(d.id)) return;
    var card = document.querySelector('.drill[data-drill="'+d.id+'"] .done');
    if(card) card.click();
  }
  function openTimer(id){
    var d = D.DRILLS.filter(function(x){ return x.id === id; })[0];
    if(!d) return;
    tmStop();
    TM = {drill:d, work:40, rest:20, rounds:6, round:1, phase:"idle", left:40, running:false, iv:null};
    modal(tmHtml());
  }
  document.addEventListener("click", function(e){
    var o = e.target.closest("[data-timer]");
    if(o){ openTimer(o.dataset.timer); return; }
    var v = e.target.closest("[data-drillvid]");
    if(v){ window.open(v.dataset.drillvid, "_blank", "noopener"); return; }
    if(!TM) return;
    if(e.target.closest("#dtStart")){
      if(TM.phase === "idle"){
        TM.work = Math.max(5, parseInt($("#dtWork").value, 10) || 40); TM.rest = Math.max(0, parseInt($("#dtRest").value, 10) || 0);
        TM.rounds = Math.max(1, parseInt($("#dtRounds").value, 10) || 1); TM.phase = "work"; TM.left = TM.work; TM.round = 1; beep(880, 300);
      }
      TM.running = true; TM.iv = setInterval(tmTick, 1000); tmPaint(); return;
    }
    if(e.target.closest("#dtPause")){ tmStop(); tmPaint(); return; }
    if(e.target.closest("#dtReset")){ tmStop(); TM.phase = "idle"; TM.round = 1; TM.left = TM.work; tmPaint(); }
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
    renderPassport();
    renderMatches();
    renderChallenges();
    renderFeed();
    renderLessons();
    applyTheme();
    renderPlayerCard();
    renderShop2();
    renderAchievements();
    renderFriends();
    if($("#v-squad") && $("#v-squad").classList.contains("on")) renderRanks();
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
    setTimeout(paintJoinGate, 0);
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
    if(!st.member){
      var jc = joinCode();
      if(jc){
        try{
          var r = await PVB.act.requestJoin(jc, st.googleName || "");
          if(r === "member"){ clearJoin(); location.reload(); return true; }
          var cl = await PVB.act.clubByCode(jc);
          showWaiting(st, cl && cl.name); return true;
        }catch(err){ clearJoin(); oops(err); }
      }
      try{
        var reqs = await PVB.act.myRequests();
        if(reqs && reqs.length){ showWaiting(st, reqs[0].clubs && reqs[0].clubs.name); return true; }
      }catch(err){}
      showNoClub(st); return true;
    }
    clearJoin();
    var cst = st.member.clubs && st.member.clubs.status;
    if((cst === "paused" || cst === "cancelled") && !(PVB.state && PVB.state.isAdmin)){ showPaused(st); return true; }
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

  function showPaused(st){
    showNoClub(st);
    var owner = st.member.role === "owner";
    $("#gateNoClub").innerHTML = '<p>'+(owner ? t("g.pausedOwner") : t("g.paused", {club: esc((st.member.clubs || {}).name || "")}))+'</p>'+
      (owner ? '<a class="btn btn-primary gate-go" href="admin.html">'+t("g.billing")+'</a>' : '')+
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
