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
  var ROLES = {owner:"Owner", coach:"Coach", staff:"Bar staff", player:"Player"};

  function gate(html){
    $("#gate").hidden = false; $("#main").hidden = true;
    $("#gateBody").innerHTML = html;
  }
  function open(){ $("#gate").hidden = true; $("#main").hidden = false; }

  /* ---------------------------------------------------------------- boot */
  async function boot(){
    if(!sb){ gate("<p>Could not reach the server. Check the connection and reload.</p>"); return; }
    var s = await PVB.session();
    if(!s){
      gate('<p>Sign in to continue.</p><button class="btn btn-google gate-go" id="goGoogle">Continue with Google</button>');
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
        f.reset(); cSel.value = "US"; fillRegions();
        listClubs();
      }catch(err){
        if(/clubs_one_per_region/.test(err.message || "")) toast("That region already has a club.");
        else oops(err);
      }
    };
    listClubs();
  }

  async function listClubs(){
    try{
      var clubs = fail(await sb.from("clubs").select("id, name, country, region, city, plan, status, created_at").order("created_at", {ascending:false}));
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
          '<small>Owner: '+esc(owner[c.id] || "none")+' · '+n.player+' players · '+n.coach+' coaches</small></div>'+
          '<div class="arow-ctl">'+
            '<select data-club-plan="'+c.id+'">'+PLANS.map(function(p){ return '<option value="'+p.id+'"'+(p.id===c.plan?" selected":"")+'>'+p.name+'</option>'; }).join("")+'</select>'+
            '<select data-club-status="'+c.id+'">'+["trial","active","paused","cancelled"].map(function(s){ return '<option'+(s===c.status?" selected":"")+'>'+s+'</option>'; }).join("")+'</select>'+
            '<a class="btn btn-ghost btn-sm" href="admin.html?club='+c.id+'">Open</a>'+
          '</div></div>';
      }).join("") : '<p class="muted">No clubs yet. Create the first one above.</p>';
    }catch(err){ oops(err); }
  }
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

  async function refresh(){
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
    drawMembers(); drawGroups(); drawSessions(q[2].data || []); drawRewards(q[3].data || []); drawClub();
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
            '<input class="lvl" type="number" step="0.25" min="0" max="7" value="'+Number(m.level).toFixed(2)+'" data-m-level="'+m.id+'" aria-label="Level">' : '')+
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

  /* club settings */
  function drawClub(){
    var f = $("#clubForm");
    if(!f) return;
    f.name.value = CLUB.name; f.city.value = CLUB.city || ""; f.color.value = CLUB.color || "#C8F542";
    var r = CLUB.points_rules || {};
    ["attended","on_time","camp","drill","friend","tournament"].forEach(function(k){ if(f[k]) f[k].value = r[k] != null ? r[k] : ""; });
  }
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
