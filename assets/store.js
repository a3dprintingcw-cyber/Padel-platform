/* local state. Everything a player does survives a refresh and works offline.
   One record per academy, so the switcher keeps each club's data apart the way the
   real multi-tenant backend will. */
window.r2store = (function(){
  "use strict";

  var KEY = "padelvitals.v1";

  var DEFAULTS = {
    lang:      "en",
    role:      "player",
    academy:   "demo-miami",
    installDismissed: false,
    clubs: {}
  };

  var CLUB = {
    points:      1340,
    drillsDone:  [],
    redemptions: [],          /* {code, item, cost, at, status} */
    rsvp:        {},          /* sessionId: "in" | "out" */
    checkins:    {},          /* sessionId: {playerId: true}, coach view */
    skillEdits:  {},          /* skill name: new score, coach view */
    weekDrills:  0
  };

  function clone(o){ return JSON.parse(JSON.stringify(o)); }

  var state;
  try{
    state = Object.assign(clone(DEFAULTS), JSON.parse(localStorage.getItem(KEY) || "{}"));
  }catch(e){
    state = clone(DEFAULTS);
  }
  if(!state.clubs) state.clubs = {};

  function save(){
    try{ localStorage.setItem(KEY, JSON.stringify(state)); }
    catch(e){ /* private mode: the session still works, it just won't persist */ }
  }

  function club(id){
    id = id || state.academy;
    if(!state.clubs[id]) state.clubs[id] = clone(CLUB);
    return state.clubs[id];
  }

  return {
    get all(){ return state; },
    get club(){ return club(); },

    patch: function(obj){ Object.assign(state, obj); save(); },

    clubPatch: function(obj){ Object.assign(club(), obj); save(); },

    /* points ledger */
    addPoints: function(n){
      var c = club();
      c.points = Math.max(0, c.points + n);
      save();
      return c.points;
    },

    toggleDrill: function(id){
      var c = club(), i = c.drillsDone.indexOf(id);
      if(i === -1){ c.drillsDone.push(id); c.weekDrills++; }
      save();
      return i === -1;
    },
    drillDone: function(id){ return club().drillsDone.indexOf(id) !== -1; },

    setRsvp: function(sessionId, value){
      club().rsvp[sessionId] = value;
      save();
    },
    rsvp: function(sessionId){ return club().rsvp[sessionId] || null; },

    addRedemption: function(rec){
      club().redemptions.unshift(rec);
      save();
    },
    findRedemption: function(code){
      var list = club().redemptions;
      for(var i=0;i<list.length;i++) if(list[i].code === code) return list[i];
      return null;
    },
    markRedeemed: function(code){
      var r = this.findRedemption(code);
      if(r){ r.status = "confirmed"; r.confirmedAt = Date.now(); save(); }
      return r;
    },

    /* Check-ins hang off a session, not off the player, so Tuesday's list does not
       arrive already ticked from Monday. Older saves kept one flat blob; migrate it
       onto whichever session the app asks about first rather than dropping it. */
    checks: function(sessionId){
      var c = club();
      if(!c.checkins || typeof c.checkins !== "object") c.checkins = {};
      var flat = null;
      for(var k in c.checkins){
        if(c.checkins[k] === true){ flat = flat || {}; flat[k] = true; }
      }
      if(flat){
        for(var k2 in flat) delete c.checkins[k2];
        c.checkins[sessionId] = Object.assign(flat, c.checkins[sessionId] || {});
        save();
      }
      if(!c.checkins[sessionId]) c.checkins[sessionId] = {};
      return c.checkins[sessionId];
    },
    checked: function(sessionId, playerId){ return !!this.checks(sessionId)[playerId]; },
    checkIn: function(sessionId, playerId){
      var m = this.checks(sessionId);
      if(m[playerId]) delete m[playerId]; else m[playerId] = true;
      save();
      return !!m[playerId];
    },
    setChecks: function(sessionId, map){
      club().checkins[sessionId] = map || {};
      save();
    },

    setSkill: function(name, value){
      club().skillEdits[name] = value;
      save();
    },

    reset: function(){
      state = clone(DEFAULTS);
      save();
    }
  };
})();
