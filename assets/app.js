/* The app. Player, coach and bar views over the same local state.
   Sample data in data.js, state in store.js, language in i18n.js, drawing in figure.js. */
(function(){
  "use strict";

  var D = window.R2, S = window.r2store, I = window.r2i18n;
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
    return {en:"en-GB", es:"es-419", nl:"nl-NL", pap:"nl-CW"}[I.current] || "en-GB";
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
    {id:"dash",     roles:"player coach", icon:'<path d="M3 10.5L11 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H8v5H4a1 1 0 0 1-1-1z"/>'},
    {id:"schedule", roles:"player coach", icon:'<rect x="3" y="4.5" width="16" height="15" rx="2"/><path d="M3 9h16M7.5 2.5v4M14.5 2.5v4"/>'},
    {id:"dev",      roles:"player coach", icon:'<path d="M4 18V9M9.5 18V4M15 18v-6M20.5 18v-9"/>'},
    {id:"pts",      roles:"player coach", icon:'<circle cx="11" cy="11" r="8"/><path d="M11 7v8M8 11h6"/>'},
    {id:"home",     roles:"player coach", icon:'<path d="M4 5h16v11H4z"/><path d="M10 8.5l4.5 3-4.5 3z"/>'},
    {id:"squad",    roles:"player coach", icon:'<path d="M3 19v-1.5C3 15 5 13.5 7.5 13.5S12 15 12 17.5V19M19 19v-1.5c0-2-1.3-3.3-3.2-3.8"/><circle cx="7.5" cy="8" r="3"/><path d="M15 5.2a3 3 0 0 1 0 5.6"/>'},
    {id:"coach",    roles:"player coach", icon:'<circle cx="8" cy="8" r="3.2"/><path d="M3 19c0-3 2.4-5 5-5s5 2 5 5M16 6.5a3 3 0 0 1 0 6M17 19c0-2.2-.9-3.9-2.3-4.6"/>'},
    {id:"staff",    roles:"coach",        icon:'<path d="M11 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L6.5 16.8l.9-5L3.8 8.3l5-.7z"/>'},
    {id:"bar",      roles:"bar",          icon:'<path d="M4 4h14l-6 7v7h3M4 4l6 7M8 18h4"/>'}
  ];

  var role = S.all.role || "player";

  function navFor(r){
    var list = NAV.filter(function(n){ return n.roles.indexOf(r) !== -1; });
    /* A coach opens the app to check a squad in, not to read their own stats.
       Put the tool they came for where the thumb already is. */
    if(r === "coach"){
      var i = list.findIndex(function(n){ return n.id === "staff"; });
      if(i > 1) list.splice(1, 0, list.splice(i, 1)[0]);
    }
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
      setRole("bar");
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
    $$(".roles [data-role]").forEach(function(b){ b.classList.toggle("on", b.dataset.role === r); });
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

  (function attendance(){
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
  })();

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
      var hasShot = window.r2figure && window.r2figure.shotIndex(s.n) >= 0;
      var tag = hasShot ? "button" : "div";
      return '<'+tag+' class="skill'+(hasShot?" tap":"")+'"'+(hasShot?' data-shot-key="'+esc(s.n)+'"':'')+'>'+
        '<div class="skill-top"><div><div class="skill-name">'+s.n+'</div><div class="skill-es">'+s.es+'</div></div>'+
        '<div class="skill-score">'+v.toFixed(1)+'<small>/10</small></div></div>'+
        '<div class="track"><i style="width:'+(v*10)+'%"></i></div>'+
        '<div class="skill-foot"><span>'+delta+'</span><span>'+s.by+' · '+s.on+'</span></div>'+
        (hasShot ? '<span class="skill-cue">'+t("v.seeShot")+
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></span>' : '')+
        '</'+tag+'>';
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
    }).join("") +
    '<button class="upload" data-go="staff">'+
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 16V4M7 9l5-5 5 5M4 18v2h16v-2"/></svg>'+
    '<span class="ul-t">'+t("h.upload")+'</span>'+
    '<span class="ul-s">'+t("t.sub")+'</span></button>';
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
    if(sel2 && !sel2.options.length)
      sel2.innerHTML = D.ROSTER.map(function(p){ return '<option value="'+p.id+'">'+esc(p.n)+'</option>'; }).join("");
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
      S.setChecks(checkSession, all);
      haptic(18); renderStaff();
      window.r2toast(D.ROSTER.length + " " + t("t.present").toLowerCase(), t("c.undo"), undoChecks);
      return;
    }
    if(e.target.closest("#checkNone")){
      lastChecks = Object.assign({}, S.checks(checkSession));
      S.setChecks(checkSession, {});
      haptic(18); renderStaff();
      window.r2toast(t("t.clear"), t("c.undo"), undoChecks);
      return;
    }
    if(e.target.closest("#saveAssess")){
      var name = $("#assessSkill").value, val = parseFloat($("#assessVal").value);
      var who  = $("#assessPlayer").options[$("#assessPlayer").selectedIndex].text;
      S.setSkill(name, val);
      applyEdits(); renderSkills();
      if(window.r2figure) window.r2figure.mount();
      window.r2toast(who + " · " + name + " " + val.toFixed(1));
      return;
    }
    if(e.target.closest("#publishDrill")){
      var nm = $("#drillName").value.trim();
      if(!nm){ $("#drillName").focus(); return; }
      D.DRILLS.unshift({
        id:"d" + Date.now(), n:nm, by:"Coach Diego",
        dur:$("#drillDur").value || "5:00",
        lvl:$("#drillLvl").value, kit:$("#drillKit").value || "Racket only",
        g:"linear-gradient(140deg,#262B31,#171A1E)"
      });
      $("#drillName").value = "";
      renderDrills();
      window.r2toast(nm + " · " + t("t.publish"));
    }
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

  /* ---------------------------------------------------------------- kantine staff */

  function checkCode(){
    var code = ($("#barCode").value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    var out = $("#barResult");
    if(code.length < 4){ out.innerHTML = ""; return; }
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
    renderLive();
    renderQueue();
    scanNote();
    I.apply(document);

    var P = D.PLAYER;
    $("#navAvatar").textContent = P.initials;
    $("#sideEmail").textContent = P.email;
    $("#greeting").textContent = t("d.greeting") + ", " + P.first;
    $("#squadLine").textContent = P.squad + " · " + P.days + " · " + P.coach;
  }

  document.addEventListener("r2:lang", function(){
    renderAll();
    if(window.r2figure) window.r2figure.mount();
  });

  document.addEventListener("click", function(e){
    var r = e.target.closest(".roles [data-role]");
    if(r) setRole(r.dataset.role);
  });

  I.set(I.initial(S.all.lang), true);
  document.body.dataset.role = role;
  $$(".roles [data-role]").forEach(function(b){ b.classList.toggle("on", b.dataset.role === role); });

  applyEdits();
  renderAll();
  if(window.r2figure) window.r2figure.mount();
  route(location.hash.slice(1) || "dash");

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
