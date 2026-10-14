/* Shared sales data: contact, plans and the state map.
   To mark a state as taken, change its status to "taken" and add the club name.
   Statuses: "open", "talks" (in talks, not signed), "taken". */
window.PP = (function(){
  "use strict";

  var CONTACT = {
    email:    "a3dprinting.cw@gmail.com",
    whatsapp: "59995401708",           /* digits only, for wa.me links */
    display:  "+599 9 540 1708"
  };

  /* Monthly USD. Yearly = 10 months. Founding clubs keep this price for as long as they stay.
     Each perk is [text, soon]: soon = true shows a "Soon" tag, for things not built yet. */
  var PLANS = [
    {id:"starter",  name:"Starter",  max:50,   price:599,  color:"#35C6D6",
     who:"Up to 50 training players",
     perks:[["Player accounts with personal stats"],["Coach ratings on 9 padel shots"],["Level system set by your coaches"],["Training schedule and attendance"],["Coach notes on every player"],["Goals per player with progress bars"],["Progress chart for every shot"],["Rate a whole group in one minute"],["Home drill library"],["2 coach accounts"],["8 languages"],["Email support"]]},
    {id:"club",     name:"Club",     max:150,  price:999,  color:"#C8F542", pick:true, badge:"Most clubs",
     who:"51 to 150 training players",
     perks:[["Everything in Starter"],["Points and rewards at your bar or shop"],["Group leaderboards and badges"],["Your logo and club colors"],["Session reminders on WhatsApp", true],["Monthly progress report for every player"],["Level-up cards players share on Instagram"],["6 coach accounts"],["WhatsApp support"]]},
    {id:"academy",  name:"Academy",  max:300,  price:1699, color:"#FF6B4A",
     who:"151 to 300 training players",
     perks:[["Everything in Club"],["Unlimited coaches"],["Video drills from your coaches", true],["Video feedback from coaches on every rating"],["Parent accounts for kids programs", true],["Kids pathway with levels and certificates", true],["Club tournaments and ladders in the app", true],["Priority support"]]},
    {id:"flagship", name:"Flagship", max:null, price:2799, color:"#F2C94C", badge:"The full package",
     who:"300+ players or more than one location",
     perks:[["Everything in Academy"],["Your own branded app: your club's name and icon on every player's phone", true],["AI training plan for every player, built from the coach ratings", true],["Owner dashboard: retention, revenue per coach, players about to leave", true],["Match video analysis with every shot tagged", true],["Multiple locations under one club", true],["Connects to your booking system", true],["First right on the regions next to yours"],["Coach education day at your club"],["Your own account manager"],["Early access to every new feature"]]}
  ];

  /* PayPal subscriptions. The client id is public; the secret lives only in Supabase.
     Fill the plan ids after creating the four monthly plans in PayPal. */
  var PAYPAL = {
    env: "sandbox",
    clientId: "",
    plans: {starter:"", club:"", academy:"", flagship:""}
  };

  function planFor(players){
    players = +players || 0;
    for(var i=0;i<PLANS.length;i++){ if(PLANS[i].max === null || players <= PLANS[i].max) return PLANS[i]; }
    return PLANS[PLANS.length-1];
  }

  /* ---- edit here as clubs sign ----
     Key is "COUNTRY|Region" exactly as written in regions.js. Whole-country territories use "Whole country".
     status: "talks" (in talks, not signed) or "taken". Anything not listed is open. */
  var STATUS = {
    /* "US|Florida":        {status:"taken", club:"Miami Padel Club"}, */
    /* "ES|Madrid":         {status:"talks", club:""}, */
    /* "CW|Whole country":  {status:"taken", club:"R2PRO"} */
  };

  var COUNTRIES = window.PV_REGIONS || [];
  function country(code){ return COUNTRIES.filter(function(c){ return c.code === code; })[0] || null; }
  function regions(code){
    var c = country(code);
    if(!c) return [];
    return c.regions.map(function(r){
      var st = STATUS[code + "|" + r] || {};
      return {country:code, name:r, status:st.status || "open", club:st.club || ""};
    });
  }
  function openCount(){
    var n = 0;
    COUNTRIES.forEach(function(c){ regions(c.code).forEach(function(r){ if(r.status === "open") n++; }); });
    return n;
  }

  /* Live from the database: the moment a club is created in the platform panel, its region
     shows as taken here. STATUS above still works as a manual override. */
  var LIVE_URL = "https://kvdruhadevpixomatwsb.supabase.co/rest/v1/territories?select=country,region,status,club";
  var LIVE_KEY = "sb_publishable_HitT5azoipqgS8IoNTUPVw_ZiS-BX1U";
  if(window.fetch){
    fetch(LIVE_URL, {headers:{apikey:LIVE_KEY, Authorization:"Bearer " + LIVE_KEY}})
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(rows){
        if(!rows || !rows.length) return;
        rows.forEach(function(t){
          var k = t.country + "|" + t.region;
          if(!STATUS[k] || STATUS[k].status !== "taken") STATUS[k] = {status:t.status, club:t.club || ""};
        });
        /* same signal a language change sends: every list on the page redraws */
        document.dispatchEvent(new CustomEvent("pv:lang", {detail:{territories:true}}));
      }).catch(function(){});
  }

  function waLink(text){ return "https://wa.me/" + CONTACT.whatsapp + "?text=" + encodeURIComponent(text); }
  function mailLink(subject, body){ return "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body); }

  return {API:{url:"https://kvdruhadevpixomatwsb.supabase.co", key:LIVE_KEY}, CONTACT:CONTACT, PLANS:PLANS, PAYPAL:PAYPAL, COUNTRIES:COUNTRIES, country:country, regions:regions, openCount:openCount, planFor:planFor, waLink:waLink, mailLink:mailLink};
})();
