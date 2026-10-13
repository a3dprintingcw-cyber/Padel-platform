/* Pricing, territory list and club registration. Data lives in clubs.js and regions.js. */
(function(){
  "use strict";
  var PP = window.PP;
  function $(s){ return document.querySelector(s); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function usd(n){ return "$" + n.toLocaleString("en-US"); }

  /* ---------------------------------------------------------------- pricing */
  var plansEl = $("#plans");
  if(plansEl){
    var yearly = false;
    var paint = function(){
      plansEl.innerHTML = PP.PLANS.map(function(p){
        var amt = yearly ? p.price * 10 : p.price;
        return '<div class="plan'+(p.pick?" pick":"")+'">'+
          (p.pick ? '<span class="tag" style="align-self:flex-start;color:var(--coral);border-color:rgba(200,245,66,.4)">Most clubs</span>' : '')+
          '<h3>'+p.name+'</h3>'+
          '<div class="who">'+p.who+'</div>'+
          '<div class="amt">'+usd(amt)+' <small>/ '+(yearly?"year":"month")+'</small></div>'+
          (yearly ? '<div class="save">You save '+usd(p.price*2)+'</div>' : '')+
          '<ul><li class="excl">Your whole state or region, nobody else gets it</li>'+p.perks.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ul>'+
          '<a class="btn '+(p.pick?"btn-primary":"btn-ghost")+'" href="register.html?plan='+p.id+(yearly?"&billing=year":"")+'">Choose '+p.name+'</a>'+
        '</div>';
      }).join("");
      $("#billNote").textContent = yearly
        ? "Billed once a year, two months free."
        : "Billed monthly. Cancel with 30 days notice, and your region opens up again.";
    };
    document.addEventListener("click", function(e){
      var b = e.target.closest("[data-bill]");
      if(!b) return;
      yearly = b.dataset.bill === "year";
      document.querySelectorAll("[data-bill]").forEach(function(x){ x.classList.toggle("on", x === b); });
      paint();
    });
    paint();
  }

  /* ---------------------------------------------------------------- shared */
  /* best guess at the visitor's country from the browser, US if unknown */
  function guessCountry(){
    var langs = (navigator.languages || [navigator.language || ""]);
    for(var i=0;i<langs.length;i++){
      var m = /-([A-Z]{2})$/i.exec(langs[i] || "");
      if(m && PP.country(m[1].toUpperCase())) return m[1].toUpperCase();
    }
    return "US";
  }
  function countryOptions(sel){
    sel.innerHTML = PP.COUNTRIES.map(function(c){ return '<option value="'+c.code+'">'+esc(c.name)+'</option>'; }).join("");
  }
  var LABEL = {open:"Open", talks:"In talks", taken:"Taken"};

  /* ---------------------------------------------------------------- territories */
  var statesEl = $("#states");
  if(statesEl){
    var qs0 = new URLSearchParams(location.search);
    var cSel = $("#stateCountry");
    countryOptions(cSel);
    cSel.value = PP.country(qs0.get("country") || "") ? qs0.get("country") : guessCountry();

    var drawStates = function(){
      var q = ($("#stateFind").value || "").trim().toLowerCase();
      var c = PP.country(cSel.value);
      var all = PP.regions(c.code);
      var list = all.filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) > -1; });
      $("#openCount").textContent = all.filter(function(r){ return r.status === "open"; }).length;
      $("#openLabel").textContent = all.length === 1 ? "open in " + c.name : (c.label.toLowerCase() + (all.length > 1 ? "s" : "") + " open in " + c.name);
      $("#stateFind").placeholder = "Find your " + c.label.toLowerCase();
      $("#stateFind").hidden = all.length < 6;
      statesEl.innerHTML = list.map(function(r){
        var title = r.name === "Whole country" ? c.name : r.name;
        var sub = r.name === "Whole country" ? "Whole country · " + LABEL[r.status] : LABEL[r.status];
        var tail = r.status === "open"
          ? '<a class="btn btn-primary btn-sm" href="register.html?country='+c.code+'&region='+encodeURIComponent(r.name)+'">Claim</a>'
          : '<span class="muted small">'+(r.club ? esc(r.club) : LABEL[r.status])+'</span>';
        return '<div class="st '+r.status+'"><i class="sdot '+r.status+'"></i>'+
          '<div class="st-n"><b>'+esc(title)+'</b><span>'+sub+'</span></div>'+tail+'</div>';
      }).join("");
      $("#stateNone").hidden = list.length > 0;
    };
    cSel.addEventListener("change", function(){
      $("#stateFind").value = "";
      history.replaceState(null, "", "?country=" + cSel.value);
      drawStates();
    });
    $("#stateFind").addEventListener("input", drawStates);
    drawStates();
  }

  /* ---------------------------------------------------------------- register */
  var form = $("#regForm");
  if(form){
    var qs = new URLSearchParams(location.search);
    var coSel = $("#regCountry"), stSel = $("#regState"), plSel = $("#regPlan");

    countryOptions(coSel);
    coSel.value = PP.country(qs.get("country") || "") ? qs.get("country") : guessCountry();

    var fillRegions = function(keep){
      var c = PP.country(coSel.value), list = PP.regions(c.code);
      $("#regStateLabel").textContent = c.label;
      if(list.length === 1){
        stSel.innerHTML = '<option value="'+esc(list[0].name)+'">Whole country</option>';
      } else {
        stSel.innerHTML = '<option value="">Choose your ' + c.label.toLowerCase() + '</option>' +
          list.map(function(r){
            return '<option value="'+esc(r.name)+'"'+(r.status==="taken"?" disabled":"")+'>'+esc(r.name)+(r.status==="taken"?" (taken)":"")+'</option>';
          }).join("");
      }
      if(keep) stSel.value = keep;
      showState();
    };

    plSel.innerHTML = PP.PLANS.map(function(p){
      return '<option value="'+p.id+'">'+p.name+', '+usd(p.price)+' / month</option>';
    }).join("");
    if(qs.get("plan")) plSel.value = qs.get("plan");
    if(qs.get("billing") === "year") form.billing.value = "Yearly";

    var planTouched = !!qs.get("plan");
    plSel.addEventListener("change", function(){ planTouched = true; showPlan(); });

    var showState = function(){
      var c = PP.country(coSel.value), m = $("#stateMsg");
      var r = PP.regions(c.code).filter(function(x){ return x.name === stSel.value; })[0];
      if(!r){ m.hidden = true; return; }
      var where = r.name === "Whole country" ? c.name : r.name + ", " + c.name;
      m.hidden = false;
      m.className = "statemsg " + r.status;
      m.textContent = r.status === "open"  ? where + " is open. Register now and we hold it for you for 7 days."
                    : r.status === "talks" ? where + " is in talks with another club, but nothing is signed. Register and you're next in line."
                    : where + " is taken.";
    };
    var showPlan = function(){
      var n = +$("#regPlayers").value, fit = n ? PP.planFor(n) : null, chosen = PP.PLANS.filter(function(p){ return p.id === plSel.value; })[0];
      if(fit && !planTouched){ plSel.value = fit.id; chosen = fit; }
      var m = $("#planMsg");
      if(!n){ m.textContent = ""; return; }
      m.textContent = fit.id === chosen.id
        ? n + " players fits " + fit.name + ": " + usd(fit.price) + " a month."
        : n + " players usually fits " + fit.name + ". You picked " + chosen.name + ".";
    };
    coSel.addEventListener("change", function(){ fillRegions(""); });
    stSel.addEventListener("change", showState);
    $("#regPlayers").addEventListener("input", showPlan);
    fillRegions(qs.get("region") || "");
    showPlan();

    var message = function(){
      var f = form, plan = PP.PLANS.filter(function(p){ return p.id === f.plan.value; })[0];
      var c = PP.country(coSel.value);
      return [
        "New club registration",
        "",
        "Club: " + f.club.value.trim(),
        "City: " + f.city.value.trim(),
        "Country: " + c.name,
        c.label + ": " + f.state.value,
        "Contact: " + f.name.value.trim(),
        "Email: " + f.email.value.trim(),
        "Phone: " + (f.phone.value.trim() || "not given"),
        "Players in training: " + f.players.value,
        "Coaches: " + (f.coaches.value || "not given"),
        "Plan: " + plan.name + " (" + usd(plan.price) + " / month), " + f.billing.value,
        f.notes.value.trim() ? "Notes: " + f.notes.value.trim() : ""
      ].filter(function(l, i){ return l !== "" || i === 1; }).join("\n");
    };

    var check = function(){
      var err = $("#formErr"), bad = [];
      if(!form.club.value.trim()) bad.push("club name");
      if(!form.city.value.trim()) bad.push("city");
      if(!form.state.value) bad.push(PP.country(coSel.value).label.toLowerCase());
      if(!form.name.value.trim()) bad.push("your name");
      if(!/^\S+@\S+\.\S+$/.test(form.email.value.trim())) bad.push("a valid email");
      if(!(+form.players.value > 0)) bad.push("number of players");
      err.hidden = !bad.length;
      err.textContent = bad.length ? "Please add: " + bad.join(", ") + "." : "";
      if(bad.length) err.scrollIntoView({block:"center", behavior:"smooth"});
      return !bad.length;
    };

    form.addEventListener("submit", function(e){
      e.preventDefault();
      if(!check()) return;
      window.open(PP.waLink(message()), "_blank", "noopener");
      window.r2toast && window.r2toast("Opening WhatsApp. Hit send and we'll reply within a day.");
    });
    $("#regMail").addEventListener("click", function(){
      if(!check()) return;
      location.href = PP.mailLink("Club registration: " + form.club.value.trim(), message());
    });

    $("#waDirect").href = PP.waLink("Hi, I'd like to know more about Padel Vitals for my club.");
    $("#waDirect").textContent = PP.CONTACT.display;
    $("#mailDirect").href = "mailto:" + PP.CONTACT.email;
    $("#mailDirect").textContent = PP.CONTACT.email;
  }
})();
