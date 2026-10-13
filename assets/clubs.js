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

  /* Monthly USD. Yearly = 10 months. Founding clubs keep this price for as long as they stay. */
  var PLANS = [
    {id:"starter",  name:"Starter",  max:50,   price:599,
     who:"Up to 50 training players",
     perks:["Player accounts with personal stats","Coach skill ratings on 9 padel shots","Attendance and training schedule","Home drill library","2 coach accounts","English and Spanish","Email support"]},
    {id:"club",     name:"Club",     max:150,  price:999, pick:true,
     who:"51 to 150 training players",
     perks:["Everything in Starter","Points and rewards at your bar or shop","Group leaderboards and badges","6 coach accounts","Your logo and club colors","WhatsApp support"]},
    {id:"academy",  name:"Academy",  max:300,  price:1699,
     who:"151 to 300 training players",
     perks:["Everything in Club","Unlimited coaches","Video drills from your coaches","Parent accounts for kids programs","Monthly progress report to every player","Priority support"]},
    {id:"flagship", name:"Flagship", max:null, price:2799,
     who:"300+ players or more than one location",
     perks:["Everything in Academy","Multiple locations under one club","Your own web address","On site onboarding day","Data export","A direct line to us"]}
  ];

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

  function waLink(text){ return "https://wa.me/" + CONTACT.whatsapp + "?text=" + encodeURIComponent(text); }
  function mailLink(subject, body){ return "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body); }

  return {CONTACT:CONTACT, PLANS:PLANS, COUNTRIES:COUNTRIES, country:country, regions:regions, openCount:openCount, planFor:planFor, waLink:waLink, mailLink:mailLink};
})();
