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
    {id:"starter",  name:"Starter",  max:50,   price:1699,
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

  var STATES = [
    ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
    ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["DC","Washington DC"],["FL","Florida"],
    ["GA","Georgia"],["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],
    ["IA","Iowa"],["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],
    ["MD","Maryland"],["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],
    ["MO","Missouri"],["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],
    ["NJ","New Jersey"],["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],
    ["OH","Ohio"],["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],
    ["SC","South Carolina"],["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],
    ["VT","Vermont"],["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],
    ["WY","Wyoming"],["PR","Puerto Rico"]
  ].map(function(s){ return {code:s[0], name:s[1], status:"open", club:""}; });

  /* ---- edit here as clubs sign ---- */
  var STATUS = {
    /* "FL": {status:"talks", club:""} */
  };
  STATES.forEach(function(s){ if(STATUS[s.code]){ s.status = STATUS[s.code].status; s.club = STATUS[s.code].club || ""; } });

  function waLink(text){ return "https://wa.me/" + CONTACT.whatsapp + "?text=" + encodeURIComponent(text); }
  function mailLink(subject, body){ return "mailto:" + CONTACT.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body); }

  return {CONTACT:CONTACT, PLANS:PLANS, STATES:STATES, planFor:planFor, waLink:waLink, mailLink:mailLink};
})();
