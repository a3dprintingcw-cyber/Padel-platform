/* Padel Vitals backend: sign in, load the signed-in person's club data from Supabase
   into the same shapes the screens already use (window.R2), and write every action back.
   The publishable key is meant to be public: row level security in the database decides
   what each person can read or change. */
window.PV = (function(){
  "use strict";

  var URL_ = "https://kvdruhadevpixomatwsb.supabase.co";
  var KEY  = "sb_publishable_HitT5azoipqgS8IoNTUPVw_ZiS-BX1U";

  var sb = window.supabase ? window.supabase.createClient(URL_, KEY, {
    auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}
  }) : null;

  /* the nine skills a coach rates, in display order; key = what is stored in ratings.skill */
  var SKILLS = [
    {k:"Bandeja",        es:"defensive smash",       body:"Bandeja",     radar:"Bandeja"},
    {k:"Víbora",         es:"attacking slice smash", body:"Víbora",      radar:"Víbora"},
    {k:"Wall exit",      es:"salida de pared",       body:"Wall exit",   radar:"Pared"},
    {k:"Volley",         es:"volea",                 body:"Volley",      radar:"Volea"},
    {k:"Chiquita",       es:"low ball to the feet",  body:"Chiquita"},
    {k:"Positioning",    es:"posicionamiento",       body:"Positioning", radar:"Posición"},
    {k:"Serve & return", es:"saque y resto",         body:"Serve",       radar:"Saque"},
    {k:"Agility",        es:"footwork & speed",      body:"Agility"},
    {k:"Match head",     es:"decision making",       body:"Match head"}
  ];
  var RADAR_ORDER = ["Bandeja","Víbora","Pared","Volea","Saque","Posición"];

  var state = {user:null, member:null, club:null, clubs:[], members:[], ready:false};

  function initials(name){
    return String(name || "?").trim().split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0,3).toUpperCase() || "?";
  }
  function dayMonth(d){ return new Date(d).toLocaleDateString("en-GB", {day:"numeric", month:"short"}); }
  function fail(r){ if(r && r.error) throw r.error; return r ? r.data : null; }

  /* ------------------------------------------------------------------ auth */

  async function session(){
    if(!sb) return null;
    var r = await sb.auth.getSession();
    return r.data && r.data.session ? r.data.session : null;
  }

  async function signIn(email, password){
    var r = await sb.auth.signInWithPassword({email:email, password:password});
    if(r.error) throw r.error;
    return r.data.session;
  }

  async function signInWithGoogle(){
    var r = await sb.auth.signInWithOAuth({provider:"google", options:{
      redirectTo: location.origin + location.pathname,
      queryParams: {prompt: "select_account"}
    }});
    if(r.error) throw r.error;
  }

  /* Google's own button: the sign in happens on padelvitals.com, so Google shows our
     name instead of the database address. Falls back to the redirect flow if it can't load. */
  var GOOGLE_CLIENT = "322214738887-us8n7ng30vdd75p20np46ut333tblifj.apps.googleusercontent.com";
  var gsiLoading = null;
  function loadGsi(){
    if(window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
    if(gsiLoading) return gsiLoading;
    gsiLoading = new Promise(function(ok, no){
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true; s.defer = true;
      s.onload = function(){ ok(); }; s.onerror = function(){ gsiLoading = null; no(new Error("gsi")); };
      document.head.appendChild(s);
      setTimeout(function(){ no(new Error("gsi timeout")); }, 8000);
    });
    return gsiLoading;
  }
  async function sha256hex(str){
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
  }
  async function googleButton(el, done, failed){
    if(!sb || !el) throw new Error("offline");
    await loadGsi();
    var raw = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(function(b){ return b.toString(16).padStart(2, "0"); }).join("");
    var hashed = await sha256hex(raw);
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT,
      nonce: hashed,
      ux_mode: "popup",
      itp_support: true,
      use_fedcm_for_button: true,
      callback: function(resp){
        sb.auth.signInWithIdToken({provider:"google", token:resp.credential, nonce:raw}).then(function(r){
          if(r.error) throw r.error;
          if(done) done(r.data);
        }).catch(function(err){ if(failed) failed(err); });
      }
    });
    el.innerHTML = "";
    var w = Math.max(200, Math.min(400, Math.round(el.getBoundingClientRect().width) || 320));
    var lang = (function(){ try{ return localStorage.getItem("pv.lang") || ""; }catch(e){ return ""; } })();
    window.google.accounts.id.renderButton(el, {type:"standard", theme:"outline", size:"large", shape:"pill",
      text:"continue_with", logo_alignment:"center", width:w, locale: lang || undefined});
    return true;
  }

  async function signUp(email, password){
    var r = await sb.auth.signUp({email:email, password:password, options:{
      emailRedirectTo: location.origin + location.pathname
    }});
    if(r.error) throw r.error;
    return r.data;
  }

  async function resetPassword(email){
    var r = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
    if(r.error) throw r.error;
  }

  async function updatePassword(pw){
    var r = await sb.auth.updateUser({password:pw});
    if(r.error) throw r.error;
  }

  async function signOut(){ if(sb) await sb.auth.signOut(); state = {user:null, member:null, club:null, clubs:[], members:[], ready:false}; }

  /* ------------------------------------------------------------------ who am I */

  async function whoami(){
    var s = await session();
    if(!s) return null;
    state.user = s.user;
    await sb.rpc("claim_memberships");
    var meta = s.user.user_metadata || {};
    state.googleName = meta.full_name || meta.name || "";
    var mine = fail(await sb.from("members")
      .select("id, club_id, role, full_name, email, level, group_id, status, clubs(id, name, country, region, city, color, logo_url, plan, status, points_rules)")
      .or("user_id.eq." + s.user.id + ",email.eq." + s.user.email.toLowerCase())
      .eq("status", "active"));
    state.clubs = (mine || []).map(function(m){ return m; });
    var admin = fail(await sb.from("platform_admins").select("email"));
    state.isAdmin = !!(admin && admin.length);
    var saved = null;
    try{ saved = localStorage.getItem("pv.club"); }catch(e){}
    state.member = state.clubs.filter(function(m){ return m.club_id === saved; })[0] || state.clubs[0] || null;
    state.club = state.member ? state.member.clubs : null;
    return state;
  }

  function useClub(clubId){
    var m = state.clubs.filter(function(x){ return x.club_id === clubId; })[0];
    if(!m) return false;
    state.member = m; state.club = m.clubs;
    try{ localStorage.setItem("pv.club", clubId); }catch(e){}
    return true;
  }

  /* ------------------------------------------------------------------ load everything the screens show */

  async function load(){
    var me = state.member, c = state.club;
    if(!me || !c) return null;
    var cid = c.id, now = new Date();
    var since = new Date(now.getTime() - 84*864e5).toISOString();      /* 12 weeks */
    var until = new Date(now.getTime() + 21*864e5).toISOString();      /* 3 weeks ahead */
    var staff = me.role !== "player";

    var q = await Promise.all([
      sb.from("members").select("id, full_name, email, role, group_id, level, status, passport_code, passport_public, equipped").eq("club_id", cid).neq("status","removed").order("full_name"),
      sb.from("groups").select("id, name, days").eq("club_id", cid).order("name"),
      sb.from("sessions").select("id, kind, starts_at, duration_min, court, note, capacity, points, coach_id, group_id").eq("club_id", cid)
        .gte("starts_at", new Date(now.getTime() - 12*36e5).toISOString()).lte("starts_at", until).order("starts_at"),
      sb.rpc("session_counts", {p_club: cid}),
      sb.from("rsvps").select("session_id, status").eq("member_id", me.id),
      sb.from("ratings").select("skill, score, created_at, coach_id, video_path").eq("player_id", me.id).order("created_at", {ascending:false}),
      sb.rpc("club_skill_averages", {p_club: cid}),
      sb.from("notes").select("body, created_at, coach_id").eq("player_id", me.id).order("created_at", {ascending:false}).limit(6),
      sb.from("drills").select("id, title, level, duration, kit, video_url, created_by, created_at").eq("club_id", cid).order("created_at", {ascending:false}),
      sb.from("drill_done").select("drill_id").eq("member_id", me.id),
      sb.from("points").select("amount, reason, created_at").eq("member_id", me.id).order("created_at", {ascending:false}),
      sb.from("rewards").select("id, name, detail, icon, cost").eq("club_id", cid).eq("active", true).order("cost"),
      sb.from("redemptions").select("code, item, cost, status, created_at").eq("member_id", me.id).order("created_at", {ascending:false}).limit(30),
      sb.from("attendance").select("session_id, created_at").eq("member_id", me.id).gte("created_at", since),
      sb.rpc("club_standings", {p_club: cid}),
      sb.from("goals").select("id, skill, target, start_score, due, done_at, created_at").eq("player_id", me.id).order("created_at", {ascending:false}),
      sb.from("notifications").select("id, kind, data, read_at, created_at").eq("member_id", me.id).order("created_at", {ascending:false}).limit(30),
      sb.from("cosmetics_owned").select("item").eq("member_id", me.id),
      sb.from("friendships").select("member_id, friend_id, status").or("member_id.eq." + me.id + ",friend_id.eq." + me.id)
    ]);
    q.forEach(function(r){ if(r.error) console.warn("load:", r.error.message); });
    var members = q[0].data || [], groups = q[1].data || [], sessions = q[2].data || [], counts = q[3].data || [],
        rsvps = q[4].data || [], ratings = q[5].data || [], avgs = q[6].data || [], notes = q[7].data || [],
        drills = q[8].data || [], done = q[9].data || [], ledger = q[10].data || [], rewards = q[11].data || [],
        reds = q[12].data || [], att = q[13].data || [], standings = q[14].data || [],
        goals = q[15].data || [], notifs = q[16].data || [], owned = q[17].data || [], friends = q[18].data || [];
    state.members = members;

    var byId = {}; members.forEach(function(m){ byId[m.id] = m; });
    var grp = {}; groups.forEach(function(g){ grp[g.id] = g; });
    var myGroup = grp[me.group_id] || null;
    var going = {}; counts.forEach(function(x){ going[x.session_id] = x.going; });
    function nm(id){ return byId[id] ? byId[id].full_name : ""; }

    /* latest and previous score per skill */
    var latest = {}, prev = {};
    ratings.forEach(function(r){
      if(!latest[r.skill]) latest[r.skill] = r;
      else if(!prev[r.skill]) prev[r.skill] = r;
    });
    var avg = {}; avgs.forEach(function(a){ avg[a.skill] = Number(a.avg_score); });

    var R2 = window.R2;
    var first = (me.full_name || state.user.email).split(/[\s@]/)[0];
    R2.PLAYER = {name: me.full_name || state.user.email, initials: initials(me.full_name || state.user.email),
                 email: state.user.email, squad: myGroup ? myGroup.name : (staff ? roleName(me.role) : "No group yet"),
                 days: myGroup && myGroup.days ? myGroup.days : "", coach: c.name, first: first};

    R2.SKILLS = SKILLS.map(function(s){
      var l = latest[s.k], p = prev[s.k];
      return {n:s.k, es:s.es, v: l ? Number(l.score) : 0, d: l && p ? Math.round((l.score - p.score)*10)/10 : 0,
              by: l ? initials(nm(l.coach_id)) : "", on: l ? dayMonth(l.created_at) : "", unrated: !l};
    });
    R2.RADAR = RADAR_ORDER.map(function(k){
      var s = SKILLS.filter(function(x){ return x.radar === k; })[0];
      var l = latest[s.k];
      return {k:k, me: l ? Number(l.score) : 0, sq: avg[s.k] || 0};
    });
    if(R2.BODY) R2.BODY.forEach(function(b){
      var s = SKILLS.filter(function(x){ return x.body === b.k; })[0];
      if(s){ var l = latest[s.k]; b.v = l ? Number(l.score) : 0; }
    });

    R2.SCHEDULE = sessions.map(function(s){
      var d = new Date(s.starts_at);
      return {id:s.id, date:d, end:new Date(d.getTime() + (s.duration_min||90)*60000), kind:s.kind, court:s.court || "",
              coach: nm(s.coach_id), cap:s.capacity, taken: going[s.id] || 0, pts:s.points, note:s.note || "", group:s.group_id};
    }).filter(function(s){ return s.end > now; });

    var std = {}; standings.forEach(function(x){ std[x.member_id] = x; });
    R2.ROSTER = members.filter(function(m){ return m.role === "player"; }).map(function(m){
      var x = std[m.id] || {};
      return {id:m.id, i:initials(m.full_name || m.email), n:m.full_name || m.email, me: m.id === me.id,
              pts:x.points || 0, streak:x.sessions || 0, rating:Number(m.level), group: grp[m.group_id] ? grp[m.group_id].name : "",
              email:m.email, status:m.status};
    }).sort(function(a,b){ return b.pts - a.pts; });

    R2.COACHES = members.filter(function(m){ return m.role === "coach" || m.role === "owner"; }).map(function(m){
      return {i:initials(m.full_name || m.email), n:m.full_name || m.email, r: roleName(m.role), b:"", t:[], l:""};
    });

    R2.DRILLS = drills.map(function(d, i){
      return {id:d.id, n:d.title, by: nm(d.created_by) ? "Coach " + nm(d.created_by).split(" ")[0] : "", ago: dayMonth(d.created_at),
              dur:d.duration || "", lvl:d.level, kit:d.kit || "", video:d.video_url,
              g:["linear-gradient(140deg,#262B31,#171A1E)","linear-gradient(140deg,#2A3036,#15181C)","linear-gradient(140deg,#25302A,#171A1E)"][i % 3]};
    });

    R2.SHOP = rewards.map(function(r){ return {id:r.id, ico:r.icon || "🎾", n:r.name, s:r.detail || "", c:r.cost}; });

    R2.FEED = ledger.slice(0, 8).map(function(p){
      var neg = p.amount < 0;
      return {c: neg ? "o" : (p.reason === "Training attended" ? "g" : ""), t: p.reason, d: dayMonth(p.created_at),
              a: (neg ? "" : "+") + p.amount, neg: neg};
    });

    /* attendance per week, oldest first, 12 weeks */
    var weeks = [0,0,0,0,0,0,0,0,0,0,0,0];
    att.forEach(function(a){
      var w = Math.floor((now - new Date(a.created_at)) / (7*864e5));
      if(w >= 0 && w < 12) weeks[11 - w] = 1;
    });
    R2.ATT = weeks;

    var rules = c.points_rules || {};
    R2.EARN = [
      {k:"Training attended", v:rules.attended || 50}, {k:"On time", v:rules.on_time || 10},
      {k:"Camp day", v:rules.camp || 100}, {k:"Home drill", v:rules.drill || 15},
      {k:"Bring a friend", v:rules.friend || 150}, {k:"Club tournament", v:rules.tournament || 200}
    ];

    /* every rating, oldest first, per shot: the progress charts */
    R2.HISTORY = {};
    ratings.slice().reverse().forEach(function(r){
      (R2.HISTORY[r.skill] = R2.HISTORY[r.skill] || []).push({v:Number(r.score), at:r.created_at, on:dayMonth(r.created_at), video:r.video_path || null});
    });
    R2.GOALS = goals.map(function(g){
      var l = latest[g.skill];
      return {id:g.id, skill:g.skill, target:Number(g.target), start:Number(g.start_score), now: l ? Number(l.score) : Number(g.start_score),
              due:g.due, done:!!g.done_at};
    });
    R2.NOTIFS = notifs;
    R2.OWNED = owned.map(function(o){ return o.item; });
    R2.FRIENDS = friends.map(function(f){
      var other = f.member_id === me.id ? f.friend_id : f.member_id;
      return {id:other, n:nm(other), status:f.status, incoming: f.friend_id === me.id && f.status === "pending"};
    });
    var yr = new Date(now.getFullYear(), 0, 1);
    R2.SEASON = {points: ledger.filter(function(p){ return p.amount > 0 && new Date(p.created_at) >= yr; }).reduce(function(t, p){ return t + p.amount; }, 0),
                 drills: done.length};
    R2.NOTES = notes.map(function(n){ return {body:n.body, by:nm(n.coach_id), on:dayMonth(n.created_at)}; });
    R2.GROUPS = groups;
    var meRow = byId[me.id] || me;
    R2.ME = {id:me.id, role:me.role, level:Number(me.level), club:c, equipped:meRow.equipped || {}, passport:{code:meRow.passport_code || null, on:!!meRow.passport_public}, attendedSeason: (std[me.id] || {}).sessions || att.length};

    /* the local store becomes a cache of the server's answer */
    var balance = ledger.reduce(function(t, p){ return t + p.amount; }, 0);
    var club = window.r2store.club;
    club.points = balance;
    club.drillsDone = done.map(function(d){ return d.drill_id; });
    club.rsvp = {}; rsvps.forEach(function(r){ club.rsvp[r.session_id] = r.status; });
    club.redemptions = reds.map(function(r){
      return {code:r.code, item:r.item, cost:r.cost, at:new Date(r.created_at).getTime(), status:r.status === "pending" ? "pending" : r.status};
    });
    club.skillEdits = {};
    window.r2store.clubPatch({});

    if(staff) await loadChecks();
    state.ready = true;
    return R2;
  }

  /* signed in, but no club has added this email yet: an empty player account at zero.
     The screens all work, there is just nothing in them until a club adds the email. */
  function loadEmpty(){
    var R2 = window.R2, u = state.user || {};
    var name = state.googleName || (u.email || "Player");
    R2.PLAYER = {name:name, initials:initials(name), email:u.email || "", squad:"", days:"", coach:"", first:name.split(/[\s@]/)[0]};
    R2.SKILLS = SKILLS.map(function(s){ return {n:s.k, es:s.es, v:0, d:0, by:"", on:"", unrated:true}; });
    R2.RADAR = RADAR_ORDER.map(function(k){ return {k:k, me:0, sq:0}; });
    if(R2.BODY) R2.BODY.forEach(function(b){ b.v = 0; });
    R2.SCHEDULE = []; R2.ROSTER = []; R2.COACHES = []; R2.DRILLS = []; R2.SHOP = []; R2.FEED = [];
    R2.ATT = [0,0,0,0,0,0,0,0,0,0,0,0];
    R2.EARN = []; R2.HISTORY = {}; R2.GOALS = []; R2.NOTIFS = []; R2.OWNED = []; R2.FRIENDS = [];
    R2.SEASON = {points:0, drills:0}; R2.NOTES = []; R2.GROUPS = [];
    R2.ME = {id:null, role:"player", level:0, club:null, equipped:{}, passport:{code:null, on:false}, attendedSeason:0, pending:true};
    var club = window.r2store.club;
    club.points = 0; club.drillsDone = []; club.rsvp = {}; club.redemptions = []; club.skillEdits = {};
    window.r2store.clubPatch({});
    return R2;
  }

  /* a place name to map coordinates (OpenStreetMap), remembered on the device */
  async function geocode(city, region, country){
    var q = [city, region === "Whole country" ? "" : region, country].filter(Boolean).join(", ");
    if(!q) return null;
    var key = "pv.geo." + q.toLowerCase();
    try{ var c = localStorage.getItem(key); if(c) return JSON.parse(c); }catch(e){}
    try{
      var r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q), {headers:{"Accept-Language":"en"}});
      var j = await r.json();
      if(!j || !j[0]) return null;
      var out = {lat:parseFloat(j[0].lat), lng:parseFloat(j[0].lon)};
      try{ localStorage.setItem(key, JSON.stringify(out)); }catch(e){}
      return out;
    }catch(e){ return null; }
  }
  function kmBetween(a, b){
    var R = 6371, d2r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * d2r, dLng = (b.lng - a.lng) * d2r;
    var h = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(a.lat*d2r)*Math.cos(b.lat*d2r)*Math.sin(dLng/2)*Math.sin(dLng/2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* coach view: who is checked in to each listed session */
  async function loadChecks(){
    var ids = (window.R2.SCHEDULE || []).map(function(s){ return s.id; });
    var club = window.r2store.club;
    club.checkins = {};
    if(!ids.length) return;
    var r = await sb.from("attendance").select("session_id, member_id").in("session_id", ids);
    (r.data || []).forEach(function(a){
      if(!club.checkins[a.session_id]) club.checkins[a.session_id] = {};
      club.checkins[a.session_id][a.member_id] = true;
    });
    window.r2store.clubPatch({});
  }

  /* ------------------------------------------------------------------ coach reads */

  function nameOf(id){
    var m = (state.members || []).filter(function(x){ return x.id === id; })[0];
    return m ? (m.full_name || m.email) : "";
  }

  /* one player's full picture for the coach: latest and previous score per skill, notes, sessions */
  async function playerDetail(memberId){
    var since = new Date(Date.now() - 84*864e5).toISOString();
    var q = await Promise.all([
      sb.from("ratings").select("skill, score, created_at, coach_id, video_path").eq("player_id", memberId).order("created_at", {ascending:false}),
      sb.from("notes").select("body, created_at, coach_id").eq("player_id", memberId).order("created_at", {ascending:false}).limit(5),
      sb.from("attendance").select("session_id", {count:"exact", head:true}).eq("member_id", memberId).gte("created_at", since),
      sb.from("goals").select("id, skill, target, start_score, due, done_at").eq("player_id", memberId).order("created_at", {ascending:false})
    ]);
    var latest = {}, prev = {};
    (q[0].data || []).forEach(function(r){
      if(!latest[r.skill]) latest[r.skill] = r; else if(!prev[r.skill]) prev[r.skill] = r;
    });
    return {
      skills: SKILLS.map(function(s){
        var l = latest[s.k], p = prev[s.k];
        return {n:s.k, v: l ? Number(l.score) : 0, d: l && p ? Math.round((l.score - p.score)*10)/10 : 0,
                on: l ? dayMonth(l.created_at) : "", unrated: !l};
      }),
      notes: (q[1].data || []).map(function(n){ return {body:n.body, on:dayMonth(n.created_at), by:nameOf(n.coach_id)}; }),
      sessions: q[2].count || 0,
      goals: (q[3].data || []).map(function(g){
        var l = latest[g.skill];
        return {id:g.id, skill:g.skill, target:Number(g.target), start:Number(g.start_score), now: l ? Number(l.score) : Number(g.start_score), due:g.due, done:!!g.done_at};
      }),
      history: (function(){ var h = {}; (q[0].data || []).slice().reverse().forEach(function(r){
        (h[r.skill] = h[r.skill] || []).push({v:Number(r.score), on:dayMonth(r.created_at), video:r.video_path || null}); }); return h; })()
    };
  }

  /* who said yes to a session */
  async function going(sessionId){
    var r = await sb.from("rsvps").select("member_id").eq("session_id", sessionId).eq("status", "in");
    return (r.data || []).map(function(x){ return nameOf(x.member_id); }).filter(Boolean).sort();
  }

  /* how many players finished each drill */
  async function drillCounts(){
    var ids = (window.R2.DRILLS || []).map(function(d){ return d.id; });
    if(!ids.length) return {};
    var r = await sb.from("drill_done").select("drill_id").in("drill_id", ids);
    var out = {};
    (r.data || []).forEach(function(x){ out[x.drill_id] = (out[x.drill_id] || 0) + 1; });
    return out;
  }

  function roleName(r){ return {owner:"Club owner", coach:"Coach", staff:"Bar staff", player:"Player"}[r] || r; }

  /* ------------------------------------------------------------------ actions */

  var act = {
    rsvp: function(sessionId, status){
      return sb.from("rsvps").upsert({session_id:sessionId, member_id:state.member.id, status:status, updated_at:new Date().toISOString()}).then(fail);
    },
    clearRsvp: function(sessionId){
      return sb.from("rsvps").delete().eq("session_id", sessionId).eq("member_id", state.member.id).then(fail);
    },
    checkIn: function(sessionId, memberId){ return sb.rpc("check_in", {p_session:sessionId, p_member:memberId, p_on_time:true}).then(fail); },
    undoCheckIn: function(sessionId, memberId){ return sb.rpc("undo_check_in", {p_session:sessionId, p_member:memberId}).then(fail); },
    rate: function(playerId, skill, score){
      return sb.from("ratings").insert({club_id:state.club.id, player_id:playerId, coach_id:state.member.id, skill:skill, score:score}).then(fail);
    },
    note: function(playerId, body){
      return sb.from("notes").insert({club_id:state.club.id, player_id:playerId, coach_id:state.member.id, body:body}).then(fail);
    },
    setLevel: function(playerId, level){ return sb.rpc("set_level", {p_member:playerId, p_level:level}).then(fail); },
    drill: function(d){
      return sb.from("drills").insert({club_id:state.club.id, title:d.title, level:d.level, duration:d.duration, kit:d.kit,
                                       video_url:d.video || null, created_by:state.member.id}).select().single().then(fail);
    },
    completeDrill: function(id){ return sb.rpc("complete_drill", {p_drill:id}).then(fail); },
    redeem: function(rewardId){
      return sb.rpc("redeem", {p_reward:rewardId}).then(function(r){ var d = fail(r); return d && d[0]; });
    },
    confirmCode: function(code){ return sb.rpc("confirm_code", {p_club:state.club.id, p_code:code}).then(fail); },
    pendingCodes: function(){ return sb.rpc("pending_codes", {p_club:state.club.id}).then(fail); },
    invite: function(email, name, role, groupId){
      return sb.from("members").insert({club_id:state.club.id, email:email.trim().toLowerCase(), full_name:name || "",
                                        role:role || "player", group_id:groupId || null, status:"invited"}).select().single().then(fail);
    },
    setMyName: function(name){ return sb.rpc("set_my_name", {p_name:name}).then(fail); },
    rateMany: function(list){
      if(!list.length) return Promise.resolve();
      return sb.from("ratings").insert(list.map(function(x){
        return {club_id:state.club.id, player_id:x.player, coach_id:state.member.id, skill:x.skill, score:x.score, video_path:x.video || null};
      })).then(fail);
    },
    rateWithClip: function(playerId, skill, score, path){
      return sb.from("ratings").insert({club_id:state.club.id, player_id:playerId, coach_id:state.member.id, skill:skill, score:score, video_path:path || null}).then(fail);
    },
    uploadClip: async function(playerId, file){
      var ext = ((file.name || "").split(".").pop() || "mp4").toLowerCase().replace(/[^a-z0-9]/g, "") || "mp4";
      var path = state.club.id + "/" + playerId + "/" + Date.now() + "." + ext;
      var r = await sb.storage.from("clips").upload(path, file, {contentType: file.type || "video/mp4", upsert:false});
      fail(r);
      return path;
    },
    clipUrl: async function(path){
      var r = await sb.storage.from("clips").createSignedUrl(path, 3600);
      return fail(r).signedUrl;
    },
    setGoal: function(playerId, skill, target, start, due){
      return sb.from("goals").insert({club_id:state.club.id, player_id:playerId, coach_id:state.member.id, skill:skill,
                                      target:target, start_score:start || 0, due:due || null}).then(fail);
    },
    deleteGoal: function(id){ return sb.from("goals").delete().eq("id", id).then(fail); },
    markRead: function(){
      return sb.from("notifications").update({read_at:new Date().toISOString()}).eq("member_id", state.member.id).is("read_at", null).then(fail);
    },
    report: function(memberId, from, to){
      return sb.rpc("player_report", {p_member:memberId, p_from:from, p_to:to}).then(fail);
    },
    setPassport: function(on){ return sb.rpc("set_passport", {p_public:!!on}).then(fail); },
    passport: function(code){ return sb.rpc("passport", {p_code:code}).then(fail); },
    matches: async function(){
      var since = new Date(Date.now() - 14*864e5).toISOString();
      var r = await sb.from("matches").select("id, created_by, starts_at, level_min, level_max, note, status, score, winner, match_players(member_id, team)")
        .eq("club_id", state.club.id).neq("status", "cancelled").gte("starts_at", since).order("starts_at");
      return (fail(r) || []).map(function(m){
        return {id:m.id, by:m.created_by, at:m.starts_at, min:Number(m.level_min), max:Number(m.level_max), note:m.note || "",
                status:m.status, score:m.score || "", winner:m.winner,
                players:(m.match_players || []).map(function(p){ return {id:p.member_id, n:nameOf(p.member_id), team:p.team}; })};
      });
    },
    createMatch: function(at, min, max, note){
      return sb.from("matches").insert({club_id:state.club.id, created_by:state.member.id, starts_at:at, level_min:min, level_max:max, note:note || null}).then(fail);
    },
    joinMatch: function(id){ return sb.rpc("join_match", {p_match:id}).then(fail); },
    leaveMatch: function(id){ return sb.rpc("leave_match", {p_match:id}).then(fail); },
    recordResult: function(id, t1, t2, score, winner){
      return sb.rpc("record_result", {p_match:id, p_team1:t1, p_team2:t2, p_score:score, p_winner:winner}).then(fail);
    },
    ladder: function(){ return sb.rpc("club_ladder", {p_club:state.club.id}).then(fail); },
    rankings: function(){ return sb.rpc("club_rankings").then(fail); },
    openClubs: function(){ return sb.rpc("open_clubs").then(fail); },
    requestTraining: function(club, name, phone, note){ return sb.rpc("request_training", {p_club:club, p_name:name || "", p_phone:phone || "", p_note:note || ""}).then(fail); },
    clubByCode: function(code){ return sb.rpc("club_by_code", {p_code:code}).then(fail); },
    requestJoin: function(code, name){ return sb.rpc("request_join", {p_code:code, p_name:name || ""}).then(fail); },
    myRequests: function(){ return sb.from("join_requests").select("status, created_at, club_id, clubs(name)").eq("status", "pending").then(fail); },
    challenges: function(){ return sb.rpc("my_challenges", {p_club:state.club.id}).then(fail); },
    claimChallenge: function(key){ return sb.rpc("claim_challenge", {p_club:state.club.id, p_key:key}).then(fail); },
    feed: async function(){
      var r = await sb.from("club_feed").select("id, member_id, kind, data, created_at, cheers(member_id, emoji)")
        .eq("club_id", state.club.id).order("created_at", {ascending:false}).limit(30);
      return (fail(r) || []).map(function(f){ return {id:f.id, who:f.member_id, n:nameOf(f.member_id), kind:f.kind, data:f.data || {}, at:f.created_at, cheers:f.cheers || []}; });
    },
    cheer: function(feedId, emoji){ return sb.rpc("cheer", {p_feed:feedId, p_emoji:emoji}).then(fail); },
    lessons: async function(){
      var r = await sb.from("lesson_slots").select("id, coach_id, starts_at, minutes, price, note, booked_by, status")
        .eq("club_id", state.club.id).neq("status", "cancelled").gte("starts_at", new Date(Date.now() - 36e5).toISOString())
        .lte("starts_at", new Date(Date.now() + 28*864e5).toISOString()).order("starts_at");
      return (fail(r) || []).map(function(x){ return {id:x.id, coach:x.coach_id, coachName:nameOf(x.coach_id), at:x.starts_at, min:x.minutes,
        price:x.price || "", note:x.note || "", by:x.booked_by, byName:nameOf(x.booked_by), status:x.status}; });
    },
    addSlot: function(at, minutes, price, note){
      return sb.from("lesson_slots").insert({club_id:state.club.id, coach_id:state.member.id, starts_at:at, minutes:minutes, price:price || null, note:note || null}).then(fail);
    },
    deleteSlot: function(id){ return sb.from("lesson_slots").delete().eq("id", id).then(fail); },
    bookLesson: function(id){ return sb.rpc("book_lesson", {p_slot:id}).then(fail); },
    cancelLesson: function(id){ return sb.rpc("cancel_lesson", {p_slot:id}).then(fail); },
    buyCosmetic: function(item){ return sb.rpc("buy_cosmetic", {p_club:state.club.id, p_item:item}).then(fail); },
    equip: function(slot, item){ return sb.rpc("equip_cosmetic", {p_club:state.club.id, p_slot:slot, p_item:item}).then(fail); },
    addFriend: function(id){ return sb.rpc("add_friend", {p_friend:id}).then(fail); },
    removeFriend: function(id){ return sb.rpc("remove_friend", {p_friend:id}).then(fail); },
    friendProfile: function(id){ return sb.rpc("friend_profile", {p_friend:id}).then(fail); },
    headToHead: function(){ return sb.rpc("head_to_head", {p_club:state.club.id}).then(fail); },
    savePush: function(sub){
      var j = sub.toJSON();
      return sb.from("push_subs").upsert({endpoint:j.endpoint, member_id:state.member.id, club_id:state.club.id,
                                          p256dh:j.keys.p256dh, auth:j.keys.auth}).then(fail);
    }
  };

  return {
    get ready(){ return !!sb; },
    get state(){ return state; },
    client: sb,
    SKILLS: SKILLS,
    session: session, signIn: signIn, signInWithGoogle: signInWithGoogle, googleButton: googleButton, signUp: signUp, signOut: signOut,
    resetPassword: resetPassword, updatePassword: updatePassword,
    geocode: geocode, kmBetween: kmBetween,
    whoami: whoami, useClub: useClub, load: load, loadEmpty: loadEmpty, loadChecks: loadChecks, playerDetail: playerDetail, going: going, drillCounts: drillCounts, roleName: roleName,
    act: act
  };
})();
