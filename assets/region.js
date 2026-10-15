/* Visitor's part of the world. Asked once on the first visit ("Choose your region"),
   remembered on this device, and used by the pricing and register pages. */
(function(){
  "use strict";
  var KEY = "pv.zone";
  var Z = window.PV_ZONES, LIST = window.PV_REGIONS || [];
  if(!Z) return;
  function T(s, v){ return window.pvT ? window.pvT(s, v) : s; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function get(){ try{ var z = localStorage.getItem(KEY); return Z.get(z) ? z : null; }catch(e){ return null; } }
  function set(z){ try{ localStorage.setItem(KEY, z); }catch(e){} }
  function hasCountry(c){ return LIST.some(function(x){ return x.code === c; }); }
  function browserCountry(){
    var langs = navigator.languages || [navigator.language || ""];
    for(var i=0;i<langs.length;i++){ var m = /-([A-Z]{2})$/i.exec(langs[i] || ""); if(m && hasCountry(m[1].toUpperCase())) return m[1].toUpperCase(); }
    return null;
  }
  var zone = get();
  window.pvZone = function(){ return zone || Z.of(browserCountry()) || "NA"; };
  /* a country inside the chosen part of the world: the visitor's own if it fits, else a typical one */
  window.pvCountry = function(){
    var z = window.pvZone(), b = browserCountry();
    return (b && Z.of(b) === z) ? b : Z.get(z).rep;
  };

  function chipText(){ return T("Region") + ": " + T(Z.get(window.pvZone()).name); }
  function paintChips(){ document.querySelectorAll(".region-chip").forEach(function(b){ b.textContent = chipText(); }); }
  function addChips(){
    var foot = document.querySelector(".foot-nav");
    if(foot && !foot.querySelector(".region-chip")){
      var b = document.createElement("button"); b.type = "button"; b.className = "region-chip"; foot.appendChild(b);
    }
    paintChips();
  }
  document.addEventListener("click", function(e){ if(e.target.closest(".region-chip")) open(); });

  var box = null;
  function open(){
    if(box) return;
    var cur = zone || Z.of(browserCountry());
    box = document.createElement("div");
    box.className = "region-gate";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "rgTitle");
    box.innerHTML = '<div class="rg-card">'+
      '<div class="rg-mark"><svg viewBox="0 0 80 120" aria-hidden="true"><ellipse cx="40" cy="42" rx="29" ry="35" fill="none" stroke="currentColor" stroke-width="8"/><path d="M24 71 L35 90 M56 71 L45 90" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><rect x="32" y="89" width="16" height="27" rx="3" fill="currentColor"/><polyline points="2,44 21,44 26,33 33,60 40,20 46,52 50,44 78,44" fill="none" stroke="var(--volt)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/></svg></div>'+
      '<h2 id="rgTitle">'+esc(T("Choose your region"))+'</h2>'+
      '<p>'+esc(T("Where is your club?"))+'</p>'+
      '<div class="rg-zones">'+Z.list.map(function(z){
        return '<button type="button" class="rg-zone'+(z.id===cur?" on":"")+'" data-zone="'+z.id+'">'+esc(T(z.name))+'</button>';
      }).join("")+'</div>'+
    '</div>';
    document.body.appendChild(box);
    document.documentElement.classList.add("rg-open");
    var first = box.querySelector(".rg-zone.on") || box.querySelector(".rg-zone");
    setTimeout(function(){ try{ first.focus(); }catch(e){} }, 50);
    box.addEventListener("click", function(e){
      var b = e.target.closest(".rg-zone"); if(!b) return;
      zone = b.dataset.zone; set(zone);
      box.remove(); box = null; document.documentElement.classList.remove("rg-open");
      paintChips();
      document.dispatchEvent(new CustomEvent("pv:country", {detail:window.pvCountry()}));
    });
  }
  window.pvChooseRegion = open;

  function start(){ addChips(); if(!zone) open(); }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  document.addEventListener("pv:lang", paintChips);
})();
