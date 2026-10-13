/* Pricing, state list and club registration. Data lives in clubs.js. */
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
          '<ul><li class="excl">Your whole state, nobody else gets it</li>'+p.perks.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ul>'+
          '<a class="btn '+(p.pick?"btn-primary":"btn-ghost")+'" href="register.html?plan='+p.id+(yearly?"&billing=year":"")+'">Choose '+p.name+'</a>'+
        '</div>';
      }).join("");
      $("#billNote").textContent = yearly
        ? "Billed once a year, two months free."
        : "Billed monthly. Cancel with 30 days notice, and your state opens up again.";
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

  /* ---------------------------------------------------------------- states */
  var statesEl = $("#states");
  if(statesEl){
    var LABEL = {open:"Open", talks:"In talks", taken:"Taken"};
    var drawStates = function(q){
      q = (q || "").trim().toLowerCase();
      var list = PP.STATES.filter(function(s){ return !q || s.name.toLowerCase().indexOf(q) > -1 || s.code.toLowerCase() === q; });
      statesEl.innerHTML = list.map(function(s){
        var tail = s.status === "open"
          ? '<a class="btn btn-primary btn-sm" href="register.html?state='+s.code+'">Claim</a>'
          : '<span class="muted small">'+(s.club ? esc(s.club) : LABEL[s.status])+'</span>';
        return '<div class="st '+s.status+'"><i class="sdot '+s.status+'"></i>'+
          '<div class="st-n"><b>'+s.name+'</b><span>'+LABEL[s.status]+'</span></div>'+tail+'</div>';
      }).join("");
      $("#stateNone").hidden = list.length > 0;
    };
    $("#openCount").textContent = PP.STATES.filter(function(s){ return s.status === "open"; }).length;
    $("#stateFind").addEventListener("input", function(e){ drawStates(e.target.value); });
    drawStates("");
  }

  /* ---------------------------------------------------------------- register */
  var form = $("#regForm");
  if(form){
    var qs = new URLSearchParams(location.search);
    var stSel = $("#regState"), plSel = $("#regPlan");

    stSel.innerHTML = '<option value="">Choose your state</option>' +
      PP.STATES.map(function(s){
        return '<option value="'+s.code+'"'+(s.status==="taken"?" disabled":"")+'>'+s.name+(s.status==="taken"?" (taken)":"")+'</option>';
      }).join("") + '<option value="INTL">Outside the US</option>';
    plSel.innerHTML = PP.PLANS.map(function(p){
      return '<option value="'+p.id+'">'+p.name+', '+usd(p.price)+' / month</option>';
    }).join("");

    if(qs.get("state")) stSel.value = qs.get("state");
    if(qs.get("plan")) plSel.value = qs.get("plan");
    if(qs.get("billing") === "year") form.billing.value = "Yearly";

    var planTouched = !!qs.get("plan");
    plSel.addEventListener("change", function(){ planTouched = true; showPlan(); });

    var showState = function(){
      var s = PP.STATES.filter(function(x){ return x.code === stSel.value; })[0], m = $("#stateMsg");
      if(!s){ m.hidden = stSel.value !== "INTL"; m.className = "statemsg"; m.textContent = "Tell us your country in the notes and we'll check it for you."; return; }
      m.hidden = false;
      m.className = "statemsg " + s.status;
      m.textContent = s.status === "open"  ? s.name + " is open. Register now and we hold it for you for 7 days."
                    : s.status === "talks" ? s.name + " is in talks with another club, but nothing is signed. Register and you're next in line."
                    : s.name + " is taken.";
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
    stSel.addEventListener("change", showState);
    $("#regPlayers").addEventListener("input", showPlan);
    showState(); showPlan();

    var message = function(){
      var f = form, plan = PP.PLANS.filter(function(p){ return p.id === f.plan.value; })[0];
      var stName = f.state.value === "INTL" ? "Outside the US" : (stSel.options[stSel.selectedIndex] || {}).text;
      return [
        "New club registration",
        "",
        "Club: " + f.club.value.trim(),
        "City: " + f.city.value.trim(),
        "State: " + stName,
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
      if(!form.state.value) bad.push("state");
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

    $("#waDirect").href = PP.waLink("Hi, I'd like to know more about the padel player app for my club.");
    $("#waDirect").textContent = PP.CONTACT.display;
    $("#mailDirect").href = "mailto:" + PP.CONTACT.email;
    $("#mailDirect").textContent = PP.CONTACT.email;
  }
})();
