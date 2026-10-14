/* Club admin (owners) and platform panel (Adrian). Same sign-in as the app.
   Everything goes through Supabase; row level security decides what each person may do. */
(function(){
  "use strict";
  var PVB = window.PV, sb = PVB && PVB.client;
  var PAGE = document.body.dataset.page;            /* "admin" or "platform" */
  function $(s, r){ return (r || document).querySelector(s); }
  function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function toast(m){ if(window.r2toast) window.r2toast(m); }
  function fail(r){ if(r && r.error) throw r.error; return r ? r.data : null; }
  function oops(e){ toast((e && e.message) || "Something went wrong"); console.warn(e); }
  function money(n){ return "$" + Number(n).toLocaleString("en-US"); }
  var PLANS = (window.PP && window.PP.PLANS) || [];

  /* Demo club admin (admin.html?demo=1): sample data, nothing is saved. For sales visits. */
  var DEMO = PAGE === "admin" && new URLSearchParams(location.search).get("demo") === "1";
  function demoNote(){ toast("Demo club: nothing is saved here"); }
  if(DEMO){
    /* a stand-in for the database that answers every call with nothing and saves nothing */
    var fake = function(){
      var wrote = false;
      var h = {get:function(t, k){
        if(k === "then") return function(ok){ if(wrote) demoNote(); return Promise.resolve({data:null, error:null}).then(ok); };
        return function(){ if(/^(insert|update|upsert|delete|rpc)$/.test(k)) wrote = true; return px; };
      }};
      var px = new Proxy(function(){}, h);
      return px;
    };
    sb = {from:function(){ return fake().from(); }, rpc:function(){ return fake().rpc(); }};
  }
  var ROLES = {owner:"Owner", coach:"Coach", staff:"Bar staff", player:"Player"};

  function gate(html){
    $("#gate").hidden = false; $("#main").hidden = true;
    $("#gateBody").innerHTML = html;
  }
  function open(){ $("#gate").hidden = true; $("#main").hidden = false; }

  /* ---------------------------------------------------------------- boot */
  async function boot(){
    if(DEMO){ open(); $("#who").textContent = "Demo"; return demoAdmin(); }
    if(!sb){ gate("<p>Could not reach the server. Check the connection and reload.</p>"); return; }
    var s = await PVB.session();
    if(!s){
      gate('<p>Sign in to continue.</p><div class="gsi" id="gsiBtn"></div><button class="btn btn-google gate-go" id="goGoogle">Continue with Google</button>');
      PVB.googleButton($("#gsiBtn"), function(){ boot().catch(oops); }, oops)
        .then(function(){ var b = $("#goGoogle"); if(b) b.hidden = true; }).catch(function(){});
      return;
    }
    var st = await PVB.whoami();
    $("#who").textContent = s.user.email;
    if(PAGE === "platform"){
      if(!st.isAdmin){ gate("<p>This panel is only for the Padel Vitals team.</p><a class=\"btn btn-ghost\" href=\"app.html\">Open the app</a>"); return; }
      open(); return platform();
    }
    var owned = st.clubs.filter(function(m){ return m.role === "owner"; });
    if(!owned.length && !st.isAdmin){ gate("<p>Club admin is for club owners. Your account is not the owner of a club.</p><a class=\"btn btn-ghost\" href=\"app.html\">Open the app</a>"); return; }
    open();
    var want = new URLSearchParams(location.search).get("club");
    var clubId = want || (owned[0] && owned[0].club_id) || (st.clubs[0] && st.clubs[0].club_id);
    if(!clubId){ $("#adminBody").innerHTML = '<p class="muted">No clubs yet. Create one in the <a class="coral" href="platform.html">platform panel</a>.</p>'; return; }
    return admin(clubId);
  }

  document.addEventListener("click", function(e){
    if(e.target.closest("#goGoogle")) PVB.signInWithGoogle().catch(oops);
    if(e.target.closest("#signOut")) PVB.signOut().then(function(){ location.href = "app.html"; });
  });

  /* ---------------------------------------------------------------- platform panel */
  async function platform(){
    var countries = window.PV_REGIONS || [];
    var cSel = $("#ncCountry"), rSel = $("#ncRegion");
    cSel.innerHTML = countries.map(function(c){ return '<option value="'+c.code+'">'+esc(c.name)+'</option>'; }).join("");
    cSel.value = "US";
    function fillRegions(){
      var c = countries.filter(function(x){ return x.code === cSel.value; })[0];
      rSel.innerHTML = (c ? c.regions : []).map(function(r){ return '<option>'+esc(r)+'</option>'; }).join("");
    }
    cSel.onchange = fillRegions; fillRegions();
    $("#ncPlan").innerHTML = PLANS.map(function(p){ return '<option value="'+p.id+'">'+p.name+' · '+money(p.price)+'/mo</option>'; }).join("");
    $("#ncPlan").value = "club";

    $("#newClub").onsubmit = async function(e){
      e.preventDefault();
      var f = e.target;
      try{
        fail(await sb.rpc("create_club", {p_name:f.name.value.trim(), p_country:cSel.value, p_region:rSel.value,
          p_city:f.city.value.trim(), p_plan:f.plan.value, p_owner_email:f.owner.value.trim().toLowerCase(), p_owner_name:f.ownerName.value.trim()}));
        toast(f.name.value + " created. The owner signs in with " + f.owner.value);
        if(f.dataset.lead){ patchLead(f.dataset.lead, {status:"won"}); delete f.dataset.lead; }
        f.reset(); cSel.value = "US"; fillRegions();
        listClubs();
      }catch(err){
        if(/clubs_one_per_region/.test(err.message || "")) toast("That region already has a club.");
        else oops(err);
      }
    };
    listClubs();
    listLeads();
  }

  /* ---------------------------------------------------------------- sales pipeline */
  var LEADS = [], leadFilter = "open";
  var LEAD_ST = {new:"New", contacted:"Contacted", demo:"Demo done", won:"Won", lost:"Lost"};
  async function listLeads(){
    try{ LEADS = fail(await sb.from("leads").select("*").order("created_at", {ascending:false})) || []; }
    catch(err){ oops(err); LEADS = []; }
    drawLeads();
  }
  function drawLeads(){
    var box = $("#leadList");
    if(!box) return;
    var counts = {open:0, all:LEADS.length};
    LEADS.forEach(function(l){ counts[l.status] = (counts[l.status] || 0) + 1; if(l.status !== "won" && l.status !== "lost") counts.open++; });
    $("#leadCount").textContent = (counts["new"] || 0) + " new";
    $("#leadTabs").innerHTML = [["open","Open"],["new","New"],["contacted","Contacted"],["demo","Demo done"],["won","Won"],["lost","Lost"],["all","All"]].map(function(x){
      return '<button class="'+(leadFilter === x[0] ? "on" : "")+'" data-lf="'+x[0]+'">'+x[1]+' '+(counts[x[0]] || 0)+'</button>';
    }).join("");
    var today = new Date().toISOString().slice(0,10);
    var list = LEADS.filter(function(l){
      return leadFilter === "all" || (leadFilter === "open" ? (l.status !== "won" && l.status !== "lost") : l.status === leadFilter);
    }).sort(function(a,b){ return (a.follow_up || "9999") < (b.follow_up || "9999") ? -1 : 1; });
    box.innerHTML = list.length ? list.map(function(l){
      var plan = window.PP ? window.PP.planFor(l.players) : null;
      var c = window.PP ? window.PP.country(l.country) : null;
      var due = l.follow_up && l.follow_up <= today && l.status !== "won" && l.status !== "lost";
      var wa = l.phone ? "https://wa.me/" + String(l.phone).replace(/[^0-9]/g, "") : "";
      return '<div class="arow lead'+(due ? " due" : "")+'"><div class="arow-main">'+
        '<b>'+esc(l.club_name)+'</b><small>'+esc([l.city, l.region, c ? c.name : l.country].filter(Boolean).join(", "))+' · '+new Date(l.created_at).toLocaleDateString()+'</small>'+
        '<small>'+esc(l.contact || "")+(l.email ? ' · <a class="coral" href="mailto:'+esc(l.email)+'">'+esc(l.email)+'</a>' : '')+(wa ? ' · <a class="coral" href="'+wa+'" target="_blank" rel="noopener">WhatsApp</a>' : '')+'</small>'+
        '<small>'+(l.players || 0)+' players · '+(l.coaches || 0)+' coaches'+(plan ? ' · fits '+plan.name+' ('+money(plan.price)+')' : '')+'</small>'+
        (l.notes ? '<small class="lead-note">“'+esc(l.notes)+'”</small>' : '')+
        '<textarea class="lead-admin" data-lead-notes="'+l.id+'" rows="2" placeholder="Your notes">'+esc(l.admin_notes || "")+'</textarea></div>'+
        '<div class="arow-ctl">'+
          '<select data-lead-status="'+l.id+'">'+Object.keys(LEAD_ST).map(function(k){ return '<option value="'+k+'"'+(k === l.status ? " selected" : "")+'>'+LEAD_ST[k]+'</option>'; }).join("")+'</select>'+
          '<label class="lead-fu'+(due ? " due" : "")+'"><span>Follow up</span><input type="date" value="'+(l.follow_up || "")+'" data-lead-fu="'+l.id+'"></label>'+
          (l.status !== "won" ? '<button class="btn btn-ghost btn-sm" data-lead-club="'+l.id+'">Create club</button>' : '')+
        '</div></div>';
    }).join("") : '<p class="muted">Nothing here. New registrations from the website show up here.</p>';
  }
  async function patchLead(id, patch){
    try{ fail(await sb.from("leads").update(patch).eq("id", id)); var l = LEADS.filter(function(x){ return x.id === id; })[0]; if(l) Object.assign(l, patch); drawLeads(); toast("Saved"); }
    catch(err){ oops(err); }
  }
  document.addEventListener("click", function(e){
    var f = e.target.closest("[data-lf]");
    if(f){ leadFilter = f.dataset.lf; drawLeads(); return; }
    var c = e.target.closest("[data-lead-club]");
    if(c){
      var l = LEADS.filter(function(x){ return x.id === c.dataset.leadClub; })[0], fm = $("#newClub");
      if(!l || !fm) return;
      fm.name.value = l.club_name || ""; fm.city.value = l.city || ""; fm.ownerName.value = l.contact || ""; fm.owner.value = l.email || "";
      if(l.country){ $("#ncCountry").value = l.country; $("#ncCountry").onchange(); if(l.region) $("#ncRegion").value = l.region; }
      if(window.PP) $("#ncPlan").value = window.PP.planFor(l.players).id;
      fm.dataset.lead = l.id;
      $("#newClubCard").scrollIntoView({behavior:"smooth", block:"start"});
      toast("Filled in from the lead. Check it and tap Create club.");
    }
  });
  document.addEventListener("change", function(e){
    var s = e.target.closest("[data-lead-status]"), fu = e.target.closest("[data-lead-fu]"), n = e.target.closest("[data-lead-notes]");
    if(s) patchLead(s.dataset.leadStatus, {status:s.value});
    if(fu) patchLead(fu.dataset.leadFu, {follow_up:fu.value || null});
    if(n) patchLead(n.dataset.leadNotes, {admin_notes:n.value});
  });

  async function listClubs(){
    try{
      var clubs = fail(await sb.from("clubs").select("id, name, country, region, city, plan, status, billing_status, paypal_sub, paid_until, created_at").order("created_at", {ascending:false}));
      var mem = fail(await sb.from("members").select("club_id, role, status, email"));
      var count = {}, owner = {};
      mem.forEach(function(m){
        count[m.club_id] = count[m.club_id] || {player:0, coach:0};
        if(m.role === "player" && m.status !== "removed") count[m.club_id].player++;
        if(m.role === "coach") count[m.club_id].coach++;
        if(m.role === "owner") owner[m.club_id] = m.email + (m.status === "invited" ? " (not signed in yet)" : "");
      });
      var mrr = clubs.filter(function(c){ return c.status === "active"; }).reduce(function(t, c){
        var p = PLANS.filter(function(x){ return x.id === c.plan; })[0]; return t + (p ? p.price : 0); }, 0);
      $("#kpis").innerHTML =
        kpi(clubs.length, "Clubs") + kpi(clubs.filter(function(c){ return c.status === "active"; }).length, "Paying") +
        kpi(money(mrr), "Monthly revenue") + kpi(mem.filter(function(m){ return m.role === "player"; }).length, "Players");
      $("#clubList").innerHTML = clubs.length ? clubs.map(function(c){
        var n = count[c.id] || {player:0, coach:0};
        return '<div class="arow"><div class="arow-main"><b>'+esc(c.name)+'</b><small>'+esc(c.region)+', '+esc(c.country)+(c.city ? ' · '+esc(c.city) : '')+'</small>'+
          '<small>Owner: '+esc(owner[c.id] || "none")+' · '+n.player+' players · '+n.coach+' coaches</small>'+
          '<small>'+billChip(c.billing_status)+(c.paypal_sub ? ' PayPal '+esc(c.paypal_sub) : '')+(c.paid_until ? ' · paid until '+new Date(c.paid_until).toLocaleDateString() : '')+'</small></div>'+
          '<div class="arow-ctl">'+
            '<select data-club-plan="'+c.id+'">'+PLANS.map(function(p){ return '<option value="'+p.id+'"'+(p.id===c.plan?" selected":"")+'>'+p.name+'</option>'; }).join("")+'</select>'+
            '<select data-club-status="'+c.id+'">'+["trial","active","paused","cancelled"].map(function(s){ return '<option'+(s===c.status?" selected":"")+'>'+s+'</option>'; }).join("")+'</select>'+
            '<a class="btn btn-ghost btn-sm" href="admin.html?club='+c.id+'">Open</a>'+
          '</div></div>';
      }).join("") : '<p class="muted">No clubs yet. Create the first one above.</p>';
    }catch(err){ oops(err); }
  }
  var BILL = {none:["Not set up","chip"], pending:["Waiting for PayPal","chip ochre"], active:["Paying by PayPal","chip sea"], past_due:["Payment failed","chip danger"], cancelled:["Cancelled","chip danger"]};
  function billChip(b){ var x = BILL[b || "none"] || BILL.none; return '<span class="'+x[1]+'">'+x[0]+'</span>'; }
  function kpi(v, l){ return '<div class="kpi"><b>'+v+'</b><span>'+l+'</span></div>'; }

  document.addEventListener("change", async function(e){
    var p = e.target.closest("[data-club-plan]"), st = e.target.closest("[data-club-status]");
    try{
      if(p){ fail(await sb.from("clubs").update({plan:p.value}).eq("id", p.dataset.clubPlan)); toast("Plan saved"); listClubs(); }
      if(st){ fail(await sb.from("clubs").update({status:st.value}).eq("id", st.dataset.clubStatus)); toast("Status saved"); listClubs(); }
    }catch(err){ oops(err); listClubs(); }
  });

  /* ---------------------------------------------------------------- club admin */
  var CLUB = null, MEMBERS = [], GROUPS = [];

  async function admin(clubId){
    try{
      CLUB = fail(await sb.from("clubs").select("*").eq("id", clubId).single());
    }catch(err){ oops(err); return; }
    $("#clubName").textContent = CLUB.name;
    $("#clubWhere").textContent = CLUB.region + ", " + CLUB.country + " · " + (CLUB.plan || "") + " plan · " + CLUB.status;
    tabs();
    await refresh();
  }

  var DEMO_DATA = null;
  function demoAdmin(){
    var D = window.R2 || {};
    var groups = [{id:"g1", name:"Advanced", days:"Tuesday & Thursday"}, {id:"g2", name:"Intermediate", days:"Monday & Wednesday"}, {id:"g3", name:"Kids", days:"Saturday"}];
    var members = [{id:"o1", full_name:"Kim Bennett", email:"kim@miamipadel.demo", role:"owner", status:"active", level:0}];
    (D.COACHES || []).slice(0, 4).forEach(function(c, i){
      members.push({id:"c" + i, full_name:c.n, email:c.n.toLowerCase().replace(/[^a-z]+/g, ".") + "@miamipadel.demo", role:"coach", status:"active", level:0});
    });
    members.push({id:"s1", full_name:"Leo Martins", email:"bar@miamipadel.demo", role:"staff", status:"active", level:0});
    (D.ROSTER || []).forEach(function(p, i){
      members.push({id:p.id, full_name:p.n, email:p.n.toLowerCase().replace(/[^a-z]+/g, ".") + "@gmail.com", role:"player",
                    group_id:p.group === "Intermediate" ? "g2" : "g1", level:p.rating, status:i === 7 ? "invited" : "active"});
    });
    var now = Date.now();
    var sessions = (D.SCHEDULE || []).map(function(x, i){
      return {id:x.id, kind:x.kind, starts_at:new Date(x.date).toISOString(), duration_min:90, court:x.court, capacity:x.cap, points:x.pts, group_id:"g1", coach_id:"c" + (i % 4)};
    });
    var rewards = (D.SHOP || []).map(function(r, i){ return {id:"r" + i, name:r.n, detail:r.s, icon:r.ico, cost:r.c, active:true}; });
    var std = (D.ROSTER || []).map(function(p){ return {member_id:p.id, full_name:p.n, points:p.pts, sessions:p.streak}; });
    var att = (D.ROSTER || []).slice(0, 6).map(function(p){ return {member_id:p.id, created_at:new Date(now - 3*864e5).toISOString()}; });
    CLUB = {id:"demo", name:"Miami Padel Club", country:"US", region:"Florida", city:"Miami", plan:"club", status:"active",
            color:"#C8F542", points_rules:{attended:50, on_time:10, camp:100, drill:15, friend:150, tournament:200},
            billing_status:"active", paid_until:new Date(now + 21*864e5).toISOString()};
    DEMO_DATA = {members:members, groups:groups, sessions:sessions, rewards:rewards, std:std, att:att};
    REQS = [{id:"q1", email:"marta.lopez@gmail.com", full_name:"Marta Lopez", created_at:new Date(now - 864e5).toISOString()},
            {id:"q2", email:"ben.carter@gmail.com", full_name:"Ben Carter", created_at:new Date(now - 2*36e5).toISOString()}];
    $("#clubName").textContent = CLUB.name;
    $("#clubWhere").textContent = "Florida, US · Club plan · demo club, nothing is saved";
    var bar = document.createElement("div"); bar.className = "demo-bar";
    bar.innerHTML = 'Demo club with sample data. Try anything: nothing is saved. <a class="coral" href="register.html">Get this for your club</a>';
    $("#main").insertBefore(bar, $("#main").firstChild);
    tabs();
    return refresh();
  }

  async function refresh(){
    if(DEMO){
      MEMBERS = DEMO_DATA.members; GROUPS = DEMO_DATA.groups;
      drawStats(DEMO_DATA.std, DEMO_DATA.att);
      drawMembers(); drawGroups(); drawSessions(DEMO_DATA.sessions); drawRewards(DEMO_DATA.rewards); drawClub(); drawBilling();
      drawExtras(); drawRequests();
      return;
    }
    var id = CLUB.id, now = new Date();
    var q = await Promise.all([
      sb.from("members").select("id, full_name, email, role, group_id, level, status, created_at").eq("club_id", id).order("role").order("full_name"),
      sb.from("groups").select("id, name, days").eq("club_id", id).order("name"),
      sb.from("sessions").select("id, kind, starts_at, duration_min, court, capacity, points, group_id, coach_id").eq("club_id", id)
        .gte("starts_at", new Date(now.getTime() - 864e5).toISOString()).order("starts_at").limit(60),
      sb.from("rewards").select("id, name, detail, icon, cost, active").eq("club_id", id).order("cost"),
      sb.rpc("club_standings", {p_club:id}),
      sb.from("attendance").select("member_id, created_at").gte("created_at", new Date(now.getTime() - 30*864e5).toISOString())
    ]);
    q.forEach(function(r){ if(r.error) console.warn(r.error.message); });
    MEMBERS = q[0].data || []; GROUPS = q[1].data || [];
    drawStats(q[4].data || [], q[5].data || []);
    drawMembers(); drawGroups(); drawSessions(q[2].data || []); drawRewards(q[3].data || []); drawClub(); drawBilling();
    drawExtras(); loadRequests();
  }

  function tabs(){
    $$("[data-tab]").forEach(function(b){
      b.onclick = function(){
        $$("[data-tab]").forEach(function(x){ x.classList.toggle("on", x === b); });
        $$(".apanel").forEach(function(p){ p.hidden = p.id !== "p-" + b.dataset.tab; });
      };
    });
  }

  function grpName(id){ var g = GROUPS.filter(function(x){ return x.id === id; })[0]; return g ? g.name : ""; }
  function memName(id){ var m = MEMBERS.filter(function(x){ return x.id === id; })[0]; return m ? (m.full_name || m.email) : ""; }
  function groupOptions(sel){ return '<option value="">No group</option>' + GROUPS.map(function(g){ return '<option value="'+g.id+'"'+(g.id===sel?" selected":"")+'>'+esc(g.name)+'</option>'; }).join(""); }

  function drawStats(std, att){
    var players = MEMBERS.filter(function(m){ return m.role === "player" && m.status !== "removed"; });
    var active = players.filter(function(m){ return m.status === "active"; }).length;
    var trainedRecently = {}; att.forEach(function(a){ trainedRecently[a.member_id] = true; });
    var slipping = players.filter(function(m){ return m.status === "active" && !trainedRecently[m.id]; });
    $("#kpis").innerHTML = kpi(players.length, "Players") + kpi(active, "Signed in") +
      kpi(MEMBERS.filter(function(m){ return m.role === "coach"; }).length, "Coaches") +
      kpi(Object.keys(trainedRecently).length, "Trained, last 30 days");
    $("#slipping").innerHTML = slipping.length
      ? '<h3>Not seen in 30 days</h3>' + slipping.slice(0, 12).map(function(m){ return '<span class="chip">'+esc(m.full_name || m.email)+'</span>'; }).join(" ")
      : "";
  }

  /* members */
  function drawMembers(){
    $("#mGroup").innerHTML = groupOptions("");
    $("#memberList").innerHTML = MEMBERS.filter(function(m){ return m.status !== "removed"; }).map(function(m){
      return '<div class="arow"><div class="arow-main"><b>'+esc(m.full_name || "(no name yet)")+'</b><small>'+esc(m.email)+
        (m.status === "invited" ? ' · <span class="ochre">waiting for first sign in</span>' : '')+'</small></div>'+
        '<div class="arow-ctl">'+
          (m.role === "owner" ? '<span class="chip">Owner</span>' :
          '<select data-m-role="'+m.id+'">'+["coach","staff","player"].map(function(r){ return '<option value="'+r+'"'+(r===m.role?" selected":"")+'>'+ROLES[r]+'</option>'; }).join("")+'</select>')+
          (m.role === "player" ? '<select data-m-group="'+m.id+'">'+groupOptions(m.group_id)+'</select>'+
            '<input class="lvl" type="number" step="0.25" min="0" max="7" value="'+Number(m.level).toFixed(2)+'" data-m-level="'+m.id+'" aria-label="Level">'+
            '<a class="link-btn" href="report.html?player='+m.id+'" target="_blank" rel="noopener">Report</a>' : '')+
          (m.role !== "owner" ? '<button class="link-btn danger" data-m-remove="'+m.id+'">Remove</button>' : '')+
        '</div></div>';
    }).join("") || '<p class="muted">Nobody yet. Add your coaches and players above.</p>';
  }

  $("#addMember") && ($("#addMember").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target, email = f.email.value.trim().toLowerCase();
    try{
      fail(await sb.from("members").insert({club_id:CLUB.id, email:email, full_name:f.name.value.trim(), role:f.role.value,
                                            group_id:f.group.value || null, status:"invited"}));
      toast((f.name.value || email) + " added. They sign in with " + email);
      f.reset(); refresh();
    }catch(err){ if(/duplicate|unique/i.test(err.message)) toast("That email is already in the club."); else oops(err); }
  });

  document.addEventListener("change", async function(e){
    var r = e.target.closest("[data-m-role]"), g = e.target.closest("[data-m-group]"), l = e.target.closest("[data-m-level]");
    try{
      if(r){ fail(await sb.from("members").update({role:r.value}).eq("id", r.dataset.mRole)); toast("Role saved"); refresh(); }
      if(g){ fail(await sb.from("members").update({group_id:g.value || null}).eq("id", g.dataset.mGroup)); toast("Group saved"); }
      if(l){ fail(await sb.rpc("set_level", {p_member:l.dataset.mLevel, p_level:parseFloat(l.value)})); toast("Level saved"); }
    }catch(err){ oops(err); refresh(); }
  });
  document.addEventListener("click", async function(e){
    var rm = e.target.closest("[data-m-remove]");
    if(rm && window.confirm("Remove " + memName(rm.dataset.mRemove) + " from the club? Their history is kept.")){
      try{ fail(await sb.from("members").update({status:"removed"}).eq("id", rm.dataset.mRemove)); toast("Removed"); refresh(); }catch(err){ oops(err); }
    }
  });

  /* groups */
  function drawGroups(){
    $("#groupList").innerHTML = GROUPS.map(function(g){
      var n = MEMBERS.filter(function(m){ return m.group_id === g.id && m.status !== "removed"; }).length;
      return '<div class="arow"><div class="arow-main"><b>'+esc(g.name)+'</b><small>'+esc(g.days || "")+' · '+n+' players</small></div>'+
        '<div class="arow-ctl"><button class="link-btn danger" data-g-remove="'+g.id+'">Delete</button></div></div>';
    }).join("") || '<p class="muted">No groups yet. Make one per training group, like "Advanced" or "Kids Saturday".</p>';
    $("#sGroup").innerHTML = groupOptions("");
    $("#sCoach").innerHTML = '<option value="">—</option>' + MEMBERS.filter(function(m){ return m.role === "coach" || m.role === "owner"; })
      .map(function(m){ return '<option value="'+m.id+'">'+esc(m.full_name || m.email)+'</option>'; }).join("");
  }
  $("#addGroup") && ($("#addGroup").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target;
    try{ fail(await sb.from("groups").insert({club_id:CLUB.id, name:f.name.value.trim(), days:f.days.value.trim()})); f.reset(); toast("Group added"); refresh(); }
    catch(err){ oops(err); }
  });
  document.addEventListener("click", async function(e){
    var g = e.target.closest("[data-g-remove]");
    if(g && window.confirm("Delete this group? Players stay in the club.")){
      try{ fail(await sb.from("groups").delete().eq("id", g.dataset.gRemove)); refresh(); }catch(err){ oops(err); }
    }
  });

  /* schedule */
  function drawSessions(list){
    var df = new Intl.DateTimeFormat("en-US", {weekday:"short", month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"});
    $("#sessionList").innerHTML = list.map(function(s){
      return '<div class="arow"><div class="arow-main"><b>'+esc(s.kind)+(s.group_id ? ' · '+esc(grpName(s.group_id)) : '')+'</b>'+
        '<small>'+df.format(new Date(s.starts_at))+' · '+s.duration_min+' min · '+esc(s.court || "")+' · '+esc(memName(s.coach_id))+'</small></div>'+
        '<div class="arow-ctl"><span class="chip">'+s.capacity+' spots · +'+s.points+'</span><button class="link-btn danger" data-s-remove="'+s.id+'">Delete</button></div></div>';
    }).join("") || '<p class="muted">Nothing scheduled. Add your weekly training above.</p>';
  }
  $("#addSession") && ($("#addSession").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target, weeks = Math.max(1, Math.min(26, parseInt(f.weeks.value, 10) || 1));
    var start = new Date(f.date.value + "T" + f.time.value);
    if(isNaN(start)){ toast("Pick a date and time"); return; }
    var rows = [];
    for(var w=0; w<weeks; w++){
      var d = new Date(start.getTime() + w*7*864e5);
      rows.push({club_id:CLUB.id, kind:f.kind.value.trim() || "Group training", starts_at:d.toISOString(),
                 duration_min:parseInt(f.dur.value, 10) || 90, court:f.court.value.trim(), note:f.note.value.trim(),
                 capacity:parseInt(f.cap.value, 10) || 8, points:parseInt(f.pts.value, 10) || 50,
                 group_id:f.group.value || null, coach_id:f.coach.value || null});
    }
    try{ fail(await sb.from("sessions").insert(rows)); toast(rows.length + (rows.length > 1 ? " sessions added" : " session added")); refresh(); }
    catch(err){ oops(err); }
  });
  document.addEventListener("click", async function(e){
    var s = e.target.closest("[data-s-remove]");
    if(s && window.confirm("Delete this session?")){
      try{ fail(await sb.from("sessions").delete().eq("id", s.dataset.sRemove)); refresh(); }catch(err){ oops(err); }
    }
  });

  /* rewards */
  function drawRewards(list){
    $("#rewardList").innerHTML = list.map(function(r){
      return '<div class="arow"><div class="arow-main"><b>'+esc(r.icon || "")+' '+esc(r.name)+'</b><small>'+esc(r.detail || "")+'</small></div>'+
        '<div class="arow-ctl"><input class="lvl" type="number" min="1" value="'+r.cost+'" data-r-cost="'+r.id+'" aria-label="Cost in points"> pts'+
        '<label class="tog"><input type="checkbox" data-r-active="'+r.id+'"'+(r.active?" checked":"")+'> on menu</label>'+
        '<button class="link-btn danger" data-r-remove="'+r.id+'">Delete</button></div></div>';
    }).join("") || '<p class="muted">No rewards yet.</p>';
  }
  $("#addReward") && ($("#addReward").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target;
    try{ fail(await sb.from("rewards").insert({club_id:CLUB.id, name:f.name.value.trim(), detail:f.detail.value.trim(), icon:f.icon.value.trim() || "🎾", cost:parseInt(f.cost.value, 10)})); f.reset(); toast("Reward added"); refresh(); }
    catch(err){ oops(err); }
  });
  document.addEventListener("change", async function(e){
    var c = e.target.closest("[data-r-cost]"), a = e.target.closest("[data-r-active]");
    try{
      if(c){ fail(await sb.from("rewards").update({cost:parseInt(c.value, 10)}).eq("id", c.dataset.rCost)); toast("Saved"); }
      if(a){ fail(await sb.from("rewards").update({active:a.checked}).eq("id", a.dataset.rActive)); toast("Saved"); }
    }catch(err){ oops(err); refresh(); }
  });
  document.addEventListener("click", async function(e){
    var r = e.target.closest("[data-r-remove]");
    if(r && window.confirm("Delete this reward?")){
      try{ fail(await sb.from("rewards").delete().eq("id", r.dataset.rRemove)); refresh(); }catch(err){ oops(err); }
    }
  });

  /* ---------------------------------------------------------------- QR join, paste list, messages */
  var JOIN = null, REQS = [];
  function appBase(){ return location.origin + location.pathname.replace(/[^/]*$/, ""); }
  function drawExtras(){
    var opts = '<option value="">No group</option>' + GROUPS.map(function(g){ return '<option value="'+g.id+'">'+esc(g.name)+'</option>'; }).join("");
    if($("#pasteGroup")) $("#pasteGroup").innerHTML = opts;
    if($("#msgGroup")) $("#msgGroup").innerHTML = '<option value="">Everyone at the club</option>' + GROUPS.map(function(g){ return '<option value="'+g.id+'">'+esc(g.name)+' group</option>'; }).join("");
    if(JOIN) drawJoin();
  }
  function drawJoin(){
    var url = appBase() + "app.html?join=" + JOIN;
    var qr = window.r2qr ? window.r2qr.svg(url, {fg:"#0B0D0F", bg:"#FFFFFF"}) : "";
    $("#joinBody").innerHTML = '<div class="join-row"><div class="join-qr">'+qr+'</div><div><div class="eyebrow">Club code</div><b class="join-code">'+esc(JOIN)+'</b>'+
      '<p class="muted small">'+esc(url)+'</p><div class="row-btns"><button class="btn btn-primary btn-sm" id="printPoster">Print poster</button>'+
      '<button class="btn btn-ghost btn-sm" id="copyJoin">Copy link</button></div></div></div>';
  }
  async function loadRequests(){
    if(DEMO) return drawRequests();
    try{ REQS = fail(await sb.from("join_requests").select("id, email, full_name, created_at, status").eq("club_id", CLUB.id).eq("status", "pending").order("created_at")) || []; }
    catch(err){ REQS = []; }
    drawRequests();
  }
  function drawRequests(){
    var box = $("#reqList"), chip = $("#reqCount");
    if(!box) return;
    chip.hidden = !REQS.length; chip.textContent = REQS.length + " waiting";
    var opts = '<option value="">No group</option>' + GROUPS.map(function(g){ return '<option value="'+g.id+'">'+esc(g.name)+'</option>'; }).join("");
    box.innerHTML = REQS.map(function(r){
      return '<div class="arow"><div class="arow-main"><b>'+esc(r.full_name || r.email)+'</b><small>'+esc(r.email)+' · asked '+new Date(r.created_at).toLocaleDateString()+'</small></div>'+
        '<div class="arow-ctl"><select data-req-group="'+r.id+'">'+opts+'</select>'+
        '<button class="btn btn-primary btn-sm" data-req-ok="'+r.id+'">Approve</button><button class="link-btn danger" data-req-no="'+r.id+'">Decline</button></div></div>';
    }).join("");
  }
  function parsePaste(text){
    var out = [], seen = {};
    String(text || "").split(/\r?\n/).forEach(function(line){
      var m = line.match(/[^\s<>,;"']+@[^\s<>,;"']+\.[a-z]{2,}/i);
      if(!m) return;
      var email = m[0].toLowerCase();
      if(seen[email]) return; seen[email] = 1;
      var name = line.replace(m[0], "").replace(/[<>"';,\t|]+/g, " ").replace(/\s+/g, " ").trim();
      out.push({email:email, name:name});
    });
    return out;
  }
  document.addEventListener("input", function(e){
    if(e.target.id !== "pasteList") return;
    var list = parsePaste(e.target.value), have = {};
    MEMBERS.forEach(function(m){ have[(m.email || "").toLowerCase()] = 1; });
    var fresh = list.filter(function(x){ return !have[x.email]; });
    $("#pasteInfo").textContent = list.length ? fresh.length + " new player" + (fresh.length === 1 ? "" : "s") + (list.length > fresh.length ? ", " + (list.length - fresh.length) + " already in" : "") : "";
    $("#pasteAdd").disabled = !fresh.length;
  });
  document.addEventListener("click", async function(e){
    if(e.target.closest("#showJoin")){
      if(DEMO){ JOIN = "DEMO42"; drawJoin(); return; }
      try{ JOIN = fail(await sb.rpc("club_join_code", {p_club:CLUB.id})); drawJoin(); }catch(err){ oops(err); }
      return;
    }
    if(e.target.closest("#copyJoin")){
      var u = appBase() + "app.html?join=" + JOIN;
      if(navigator.clipboard) navigator.clipboard.writeText(u).then(function(){ toast("Link copied"); });
      return;
    }
    if(e.target.closest("#printPoster")){
      var url = appBase() + "app.html?join=" + JOIN;
      var w = window.open("", "_blank");
      if(!w) return;
      w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+esc(CLUB.name)+' · Join</title>'+
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Instrument+Sans:wght@400;600&display=swap">'+
        '<style>@page{size:A4;margin:0}body{margin:0;font-family:"Instrument Sans",sans-serif;background:#0B0D0F;color:#F2F4F5;-webkit-print-color-adjust:exact;print-color-adjust:exact}'+
        '.p{width:210mm;height:297mm;box-sizing:border-box;padding:22mm;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}'+
        'h1{font-family:Anton,Impact,sans-serif;font-weight:400;font-size:66px;line-height:1;text-transform:uppercase;margin:0}h1 span{color:#C8F542}'+
        '.q{background:#fff;padding:14mm;border-radius:10mm;width:105mm;height:105mm;box-sizing:content-box}.q svg{width:100%;height:100%}'+
        '.s{font-size:22px;color:#BFC6CC;max-width:150mm;line-height:1.4}.c{font-family:monospace;font-size:26px;letter-spacing:.2em;color:#C8F542}.b{font-family:Anton,Impact,sans-serif;font-size:26px;text-transform:uppercase}</style></head>'+
        '<body><div class="p"><div><div class="s" style="text-transform:uppercase;letter-spacing:.2em;font-size:16px">'+esc(CLUB.name)+'</div>'+
        '<h1>Train here?<br><span>Track it.</span></h1></div>'+
        '<div class="q">'+(window.r2qr ? window.r2qr.svg(url, {fg:"#0B0D0F", bg:"#FFFFFF"}) : "")+'</div>'+
        '<div class="s">Scan, sign in with Google and ask to join. Your coach rates your shots and you watch your level climb.</div>'+
        '<div><div class="c">CODE '+esc(JOIN)+'</div><div class="b" style="margin-top:10px">Padel <span style="color:#C8F542">Vitals</span></div></div></div>'+
        '<scr'+'ipt>setTimeout(function(){print()},600)</scr'+'ipt></body></html>');
      w.document.close();
      return;
    }
    var ok = e.target.closest("[data-req-ok]"), no = e.target.closest("[data-req-no]");
    if(ok || no){
      var id = (ok || no).dataset[ok ? "reqOk" : "reqNo"];
      var g = ok ? (document.querySelector('[data-req-group="'+id+'"]') || {}).value || null : null;
      if(DEMO){ demoNote(); return; }
      try{ fail(await sb.rpc("answer_join", {p_request:id, p_ok:!!ok, p_group:g})); toast(ok ? "Approved. They're in." : "Declined"); refresh(); }
      catch(err){ oops(err); }
      return;
    }
    if(e.target.closest("#pasteAdd")){
      var list = parsePaste($("#pasteList").value), have = {};
      MEMBERS.forEach(function(m){ have[(m.email || "").toLowerCase()] = 1; });
      var rows = list.filter(function(x){ return !have[x.email]; }).map(function(x){
        return {club_id:CLUB.id, email:x.email, full_name:x.name, role:"player", group_id:$("#pasteGroup").value || null, status:"invited"};
      });
      if(!rows.length) return;
      if(DEMO){ demoNote(); return; }
      $("#pasteAdd").disabled = true;
      try{ fail(await sb.from("members").upsert(rows, {onConflict:"club_id,email", ignoreDuplicates:true})); toast(rows.length + " players added"); $("#pasteList").value = ""; $("#pasteInfo").textContent = ""; refresh(); }
      catch(err){ oops(err); $("#pasteAdd").disabled = false; }
    }
  });
  $("#msgForm") && ($("#msgForm").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target;
    if(DEMO){ demoNote(); return; }
    try{
      var n = fail(await sb.rpc("announce", {p_club:CLUB.id, p_group:f.group.value || null, p_title:f.title.value.trim(), p_body:f.body.value.trim()}));
      toast("Sent to " + n + " people"); f.reset();
    }catch(err){ oops(err); }
  });

  /* billing: the owner subscribes with PayPal; the webhook marks the club as paying */
  var paypalLoading = null;
  function loadPaypal(cfg){
    if(window.paypal) return Promise.resolve();
    if(paypalLoading) return paypalLoading;
    paypalLoading = new Promise(function(ok, no){
      var sc = document.createElement("script");
      sc.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(cfg.clientId) + "&vault=true&intent=subscription&components=buttons";
      sc.onload = ok; sc.onerror = function(){ paypalLoading = null; no(new Error("PayPal did not load")); };
      document.head.appendChild(sc);
    });
    return paypalLoading;
  }
  function drawBilling(){
    var box = $("#billingCard");
    if(!box || !CLUB) return;
    var plan = PLANS.filter(function(x){ return x.id === CLUB.plan; })[0] || PLANS[0];
    var cfg = (window.PP && window.PP.PAYPAL) || {};
    var planId = cfg.plans && cfg.plans[plan.id];
    var b = CLUB.billing_status || "none";
    var contact = window.PP ? window.PP.waLink("Hi, I'd like to pay for Padel Vitals for " + CLUB.name + ".") : "#";
    var html = '<div class="card-hd"><h3>'+esc(plan.name)+' plan</h3>'+billChip(b)+'</div>'+
      '<p class="bill-price"><b>'+money(plan.price)+'</b> per month · '+esc(plan.who)+'</p>';
    if(b === "active"){
      html += '<p class="muted small">Paid by PayPal'+(CLUB.paid_until ? '. Next payment around '+new Date(CLUB.paid_until).toLocaleDateString() : '')+'.</p>'+
        '<a class="btn btn-ghost btn-sm" href="https://www.paypal.com/myaccount/autopay/" target="_blank" rel="noopener">Manage in PayPal</a>';
    } else if(b === "pending"){
      html += '<p class="muted small">Thanks. PayPal is confirming your subscription; this page updates within a few minutes.</p>';
    } else {
      if(b === "past_due") html += '<p class="small danger-text">Your last payment didn\'t go through. Update your card in PayPal or subscribe again below to keep your club running.</p>';
      if(cfg.clientId && planId){
        html += '<p class="muted small">Pay monthly with PayPal or a card. Cancel any time from your PayPal account.</p><div id="ppButtons" class="pp-buttons"></div>';
      } else {
        html += '<p class="muted small">Online payment opens soon. To start paying now, message us and we send you an invoice.</p>'+
          '<a class="btn btn-primary btn-sm" href="'+contact+'" target="_blank" rel="noopener">Message us on WhatsApp</a>';
      }
    }
    html += '<p class="muted small bill-change">Want a different plan? <a class="coral" href="'+contact+'" target="_blank" rel="noopener">Tell us</a> and we switch it the same day.</p>';
    box.innerHTML = html;
    if(cfg.clientId && planId && b !== "active" && b !== "pending"){
      loadPaypal(cfg).then(function(){
        window.paypal.Buttons({
          style:{shape:"pill", color:"gold", layout:"vertical", label:"subscribe"},
          createSubscription: function(data, actions){ return actions.subscription.create({plan_id:planId, custom_id:CLUB.id}); },
          onApprove: function(data){
            return sb.rpc("attach_subscription", {p_club:CLUB.id, p_sub:data.subscriptionID}).then(function(r){
              if(r.error) throw r.error;
              CLUB.billing_status = "pending"; CLUB.paypal_sub = data.subscriptionID; drawBilling(); toast("Subscribed. Thank you!");
              setTimeout(function(){ admin(CLUB.id); }, 15000);
            }).catch(oops);
          },
          onError: function(err){ oops({message:"PayPal: " + ((err && err.message) || "something went wrong")}); }
        }).render("#ppButtons");
      }).catch(oops);
    }
  }

  /* club settings */
  function drawClub(){
    var f = $("#clubForm");
    if(!f) return;
    f.name.value = CLUB.name; f.city.value = CLUB.city || ""; f.color.value = CLUB.color || "#C8F542";
    var lp = $("#logoPrev");
    if(lp) lp.innerHTML = CLUB.logo_url ? '<img src="'+esc(CLUB.logo_url)+'" alt="">' : '<span>'+esc((CLUB.name || "?").split(/\s+/).map(function(w){ return w.charAt(0); }).join("").slice(0,3).toUpperCase())+'</span>';
    var r = CLUB.points_rules || {};
    ["attended","on_time","camp","drill","friend","tournament"].forEach(function(k){ if(f[k]) f[k].value = r[k] != null ? r[k] : ""; });
  }
  document.addEventListener("change", async function(e){
    if(e.target.id !== "logoFile") return;
    var file = e.target.files[0];
    if(!file) return;
    if(DEMO){ e.target.value = ""; demoNote(); return; }
    if(file.size > 2 * 1024 * 1024){ toast("Logo must be under 2 MB"); e.target.value = ""; return; }
    var ext = (file.type.split("/")[1] || "png").replace("svg+xml", "svg").replace("jpeg", "jpg");
    var path = CLUB.id + "/logo-" + Date.now() + "." + ext;
    try{
      toast("Uploading…");
      var up = await sb.storage.from("logos").upload(path, file, {contentType:file.type, upsert:true});
      if(up.error) throw up.error;
      var url = sb.storage.from("logos").getPublicUrl(path).data.publicUrl;
      fail(await sb.from("clubs").update({logo_url:url}).eq("id", CLUB.id));
      CLUB.logo_url = url; drawClub(); toast("Logo saved");
    }catch(err){ oops(err); }
    e.target.value = "";
  });
  $("#clubForm") && ($("#clubForm").onsubmit = async function(e){
    e.preventDefault();
    var f = e.target, rules = {};
    ["attended","on_time","camp","drill","friend","tournament"].forEach(function(k){ rules[k] = parseInt(f[k].value, 10) || 0; });
    try{
      fail(await sb.from("clubs").update({name:f.name.value.trim(), city:f.city.value.trim(), color:f.color.value, points_rules:rules}).eq("id", CLUB.id));
      CLUB.name = f.name.value.trim(); $("#clubName").textContent = CLUB.name;
      toast("Club saved");
    }catch(err){ oops(err); }
  });

  boot().catch(oops);
})();
