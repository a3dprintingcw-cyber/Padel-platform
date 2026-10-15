/* Pricing, territory list and club registration. Data lives in clubs.js and regions.js. */
(function(){
  "use strict";
  var PP = window.PP;
  function $(s){ return document.querySelector(s); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function usd(n){ return "$" + n.toLocaleString("en-US"); }
  /* translate a built string; site-i18n.js supplies window.pvT, English if missing */
  function T(s, vars){ return window.pvT ? window.pvT(s, vars) : (vars ? s.replace(/\{(\w+)\}/g, function(_, k){ return vars[k]; }) : s); }

  /* the visitor's region, chosen once on the first visit (region.js) */
  function siteCountry(){ return (window.pvCountry && window.pvCountry()) || "US"; }

  /* ---------------------------------------------------------------- pricing */
  var plansEl = $("#plans");
  if(plansEl){
    var yearly = false, picked = (PP.PLANS.filter(function(p){ return p.pick; })[0] || PP.PLANS[0]).id;
    var pcountry = siteCountry();
    document.addEventListener("pv:country", function(){ pcountry = siteCountry(); paint(); });
    var paint = function(){
      plansEl.innerHTML = PP.plansFor(pcountry).map(function(p){
        var amt = yearly ? p.price * 10 : p.price, on = p.id === picked;
        return '<div class="plan tier'+(on?" on":"")+(p.id==="flagship"?" top":"")+'" data-plan="'+p.id+'" style="--pc:'+p.color+'" role="button" tabindex="0" aria-pressed="'+on+'">'+
          '<div class="plan-hd"><h3>'+p.name+'</h3>'+(p.badge ? '<span class="tag pc">'+T(p.badge)+'</span>' : '')+'</div>'+
          '<div class="who">'+T(p.who)+'</div>'+
          '<div class="amt">'+usd(amt)+' <small>/ '+(yearly?T("year"):T("month"))+'</small></div>'+
          (yearly ? '<div class="save">'+T("You save {n}",{n:usd(p.price*2)})+'</div>' : '')+
          '<ul><li class="excl">'+T("Your city or region, nobody else gets it")+'</li>'+
            p.perks.map(function(x){ return '<li>'+T(x[0])+(x[1] ? ' <span class="soon">'+T("Soon")+'</span>' : '')+'</li>'; }).join("")+'</ul>'+
          '<a class="btn plan-cta" href="register.html?plan='+p.id+(yearly?"&billing=year":"")+'">'+T("Choose {plan}",{plan:p.name})+'</a>'+
        '</div>';
      }).join("");
      $("#billNote").textContent = yearly
        ? T("Billed once a year, two months free.")
        : T("Billed monthly. Cancel with 30 days notice, and your region opens up again.");
    };
    var pick = function(card){
      if(!card || card.dataset.plan === picked) return;
      picked = card.dataset.plan;
      plansEl.querySelectorAll(".tier").forEach(function(c){
        var on = c.dataset.plan === picked;
        c.classList.toggle("on", on);
        c.setAttribute("aria-pressed", String(on));
      });
    };
    plansEl.addEventListener("click", function(e){
      if(e.target.closest(".plan-cta")) return;
      pick(e.target.closest(".tier"));
    });
    plansEl.addEventListener("keydown", function(e){
      if((e.key === "Enter" || e.key === " ") && e.target.classList.contains("tier")){ e.preventDefault(); pick(e.target); }
    });
    document.addEventListener("click", function(e){
      var b = e.target.closest("[data-bill]");
      if(!b) return;
      yearly = b.dataset.bill === "year";
      document.querySelectorAll("[data-bill]").forEach(function(x){ x.classList.toggle("on", x === b); });
      paint();
    });
    document.addEventListener("pv:lang", paint);
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
  /* country names in the visitor's language, from the browser itself */
  function cName(c){
    try{ var lang = (window.pvLang && window.pvLang()) || "en"; return new Intl.DisplayNames([lang], {type:"region"}).of(c.code) || c.name; }
    catch(e){ return c.name; }
  }
  function countryOptions(sel){
    var keep = sel.value;
    var list = PP.COUNTRIES.map(function(c){ return {code:c.code, name:cName(c)}; });
    list.sort(function(a,b){ return a.name.localeCompare(b.name); });
    sel.innerHTML = list.map(function(c){ return '<option value="'+c.code+'">'+esc(c.name)+'</option>'; }).join("");
    if(keep) sel.value = keep;
  }
  function LBL(k){ return T({open:"Open", talks:"In talks", taken:"Taken"}[k]); }

  /* ---------------------------------------------------------------- territories */
  var statesEl = $("#states");
  if(statesEl){
    var qs0 = new URLSearchParams(location.search);
    var cSel = $("#stateCountry");
    countryOptions(cSel);
    cSel.value = PP.country(qs0.get("country") || "") ? qs0.get("country") : siteCountry();

    var drawStates = function(){
      var q = ($("#stateFind").value || "").trim().toLowerCase();
      var c = PP.country(cSel.value);
      var all = PP.regions(c.code);
      var list = all.filter(function(r){ return !q || r.name.toLowerCase().indexOf(q) > -1; });
      $("#openCount").textContent = all.filter(function(r){ return r.status === "open"; }).length;
      $("#openLabel").textContent = T("open in {country}", {country:cName(c)});
      $("#stateFind").placeholder = T("Find your " + c.label.toLowerCase());
      $("#stateFind").hidden = all.length < 6;
      statesEl.innerHTML = list.map(function(r){
        var title = r.name === "Whole country" ? cName(c) : r.name;
        var sub = r.name === "Whole country" ? T("Whole country") + " · " + LBL(r.status) : LBL(r.status);
        var tail = r.status === "open"
          ? '<a class="btn btn-primary btn-sm" href="register.html?country='+c.code+'&region='+encodeURIComponent(r.name)+'">'+T("Claim")+'</a>'
          : '<span class="muted small">'+(r.club ? esc(r.club) : LBL(r.status))+'</span>';
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
    document.addEventListener("pv:lang", function(){ countryOptions(cSel); drawStates(); });
    drawStates();
  }

  /* ---------------------------------------------------------------- register */
  var form = $("#regForm");
  if(form){
    var qs = new URLSearchParams(location.search);
    var coSel = $("#regCountry"), stSel = $("#regState"), plSel = $("#regPlan");

    countryOptions(coSel);
    coSel.value = PP.country(qs.get("country") || "") ? qs.get("country") : siteCountry();

    var fillRegions = function(keep){
      var c = PP.country(coSel.value), list = PP.regions(c.code);
      $("#regStateLabel").textContent = T(c.label);
      if(list.length === 1){
        stSel.innerHTML = '<option value="'+esc(list[0].name)+'">'+T("Whole country")+'</option>';
      } else {
        stSel.innerHTML = '<option value="">' + T("Choose your " + c.label.toLowerCase()) + '</option>' +
          list.map(function(r){
            return '<option value="'+esc(r.name)+'"'+(r.status==="taken"?" disabled":"")+'>'+esc(r.name)+(r.status==="taken"?" ("+T("taken")+")":"")+'</option>';
          }).join("");
      }
      if(keep) stSel.value = keep;
      showState();
    };

    var planOptions = function(){
      var keep = plSel.value;
      plSel.innerHTML = PP.plansFor(siteCountry()).map(function(p){
        return '<option value="'+p.id+'">'+p.name+', '+usd(p.price)+' / '+T("month")+'</option>';
      }).join("");
      if(keep) plSel.value = keep;
    };
    planOptions();
    if(qs.get("plan")) plSel.value = qs.get("plan");
    if(qs.get("billing") === "year") form.billing.value = "Yearly";

    var planTouched = !!qs.get("plan");
    plSel.addEventListener("change", function(){ planTouched = true; showPlan(); });

    var showState = function(){
      var c = PP.country(coSel.value), m = $("#stateMsg");
      var r = PP.regions(c.code).filter(function(x){ return x.name === stSel.value; })[0];
      if(!r){ m.hidden = true; return; }
      var where = r.name === "Whole country" ? cName(c) : r.name + ", " + cName(c);
      m.hidden = false;
      m.className = "statemsg " + r.status;
      m.textContent = r.status === "open"  ? T("{place} is open. Register now and we hold it for you for 7 days.", {place:where})
                    : r.status === "talks" ? T("{place} is in talks with another club, but nothing is signed. Register and you're next in line.", {place:where})
                    : T("{place} is taken.", {place:where});
    };
    var showPlan = function(){
      var n = +$("#regPlayers").value, fit = n ? PP.planFor(n, siteCountry()) : null, chosen = PP.plansFor(siteCountry()).filter(function(p){ return p.id === plSel.value; })[0];
      if(fit && !planTouched){ plSel.value = fit.id; chosen = fit; }
      var m = $("#planMsg");
      if(!n){ m.textContent = ""; return; }
      m.textContent = fit.id === chosen.id
        ? T("{n} players fits {plan}: {price} a month.", {n:n, plan:fit.name, price:usd(fit.price)})
        : T("{n} players usually fits {plan}. You picked {chosen}.", {n:n, plan:fit.name, chosen:chosen.name});
    };
    coSel.addEventListener("change", function(){ fillRegions(""); });
    document.addEventListener("pv:country", function(e){ coSel.value = e.detail; fillRegions(""); planOptions(); showPlan(); });
    stSel.addEventListener("change", showState);
    $("#regPlayers").addEventListener("input", showPlan);
    fillRegions(qs.get("region") || "");
    showPlan();
    document.addEventListener("pv:lang", function(){
      var keepPlan = plSel.value, keepRegion = stSel.value;
      countryOptions(coSel); fillRegions(keepRegion);
      plSel.value = keepPlan; planOptions(); plSel.value = keepPlan; showPlan();
    });

    var message = function(){
      var f = form, plan = PP.plansFor(siteCountry()).filter(function(p){ return p.id === f.plan.value; })[0];
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
      if(!form.club.value.trim()) bad.push(T("club name"));
      if(!form.city.value.trim()) bad.push(T("city"));
      if(!form.state.value) bad.push(T(PP.country(coSel.value).label).toLowerCase());
      if(!form.name.value.trim()) bad.push(T("your name"));
      if(!/^\S+@\S+\.\S+$/.test(form.email.value.trim())) bad.push(T("a valid email"));
      if(!(+form.players.value > 0)) bad.push(T("number of players"));
      err.hidden = !bad.length;
      err.textContent = bad.length ? T("Please add: {list}.", {list:bad.join(", ")}) : "";
      if(bad.length) err.scrollIntoView({block:"center", behavior:"smooth"});
      return !bad.length;
    };

    /* registrations go straight into the sales pipeline in the platform panel */
    var saveLead = function(){
      var f = form;
      var lead = {club_name:f.club.value.trim(), country:coSel.value, region:f.state.value, city:f.city.value.trim(),
                  contact:f.name.value.trim(), email:f.email.value.trim(), phone:f.phone.value.trim(),
                  players:f.players.value, coaches:f.coaches.value, plan:f.plan.value,
                  notes:[f.billing.value === "Yearly" ? "Wants yearly billing." : "", f.notes.value.trim()].filter(Boolean).join(" "),
                  lang:(document.documentElement.lang || "en")};
      return fetch(PP.API.url + "/rest/v1/rpc/submit_lead", {method:"POST",
        headers:{apikey:PP.API.key, Authorization:"Bearer " + PP.API.key, "Content-Type":"application/json"},
        body:JSON.stringify({p:lead})}).then(function(r){ if(!r.ok) throw new Error("save failed"); });
    };

    form.addEventListener("submit", function(e){
      e.preventDefault();
      if(!check()) return;
      var btn = $("#regGo"), err = $("#formErr");
      btn.disabled = true;
      saveLead().then(function(){
        form.hidden = true;
        var c = PP.country(coSel.value);
        $("#regDoneWhat").textContent = form.club.value.trim() + " · " + form.state.value + ", " + c.name;
        $("#regDone").hidden = false;
        $("#regDone").scrollIntoView({block:"center", behavior:"smooth"});
      }).catch(function(){
        btn.disabled = false;
        err.hidden = false;
        err.innerHTML = T("Something went wrong. Try again, or message us on WhatsApp.") + ' <a class="coral" href="' + PP.waLink(message()) + '" target="_blank" rel="noopener">WhatsApp</a>';
      });
    });

    $("#waDirect").href = PP.waLink("Hi, I'd like to know more about Padel Vitals for my club.");
    $("#waDirect").textContent = PP.CONTACT.display;
    $("#mailDirect").href = "mailto:" + PP.CONTACT.email;
    $("#mailDirect").textContent = PP.CONTACT.email;
  }
})();
