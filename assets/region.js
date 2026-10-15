/* Visitor region. Asked once on the first visit ("Choose your region"), remembered on this
   device, and used by the pricing and register pages to show that region's plans. */
(function(){
  "use strict";
  var KEY = "pv.country";
  var LIST = window.PV_REGIONS || [];
  function T(s, v){ return window.pvT ? window.pvT(s, v) : s; }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function get(){ try{ var c = localStorage.getItem(KEY); return c && byCode(c) ? c : null; }catch(e){ return null; } }
  function set(c){ try{ localStorage.setItem(KEY, c); }catch(e){} }
  function byCode(c){ return LIST.filter(function(x){ return x.code === c; })[0] || null; }
  function guess(){
    var langs = navigator.languages || [navigator.language || ""];
    for(var i=0;i<langs.length;i++){ var m = /-([A-Z]{2})$/i.exec(langs[i] || ""); if(m && byCode(m[1].toUpperCase())) return m[1].toUpperCase(); }
    return "US";
  }
  function name(c){
    var x = byCode(c); if(!x) return c;
    try{ return new Intl.DisplayNames([(window.pvLang && window.pvLang()) || "en"], {type:"region"}).of(c) || x.name; }catch(e){ return x.name; }
  }
  var picked = get();
  window.pvCountry = function(){ return picked || guess(); };

  function chipText(){ return T("Region") + ": " + name(window.pvCountry()); }
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
    var cur = window.pvCountry();
    var opts = LIST.map(function(c){ return {code:c.code, n:name(c.code)}; }).sort(function(a,b){ return a.n.localeCompare(b.n); });
    box = document.createElement("div");
    box.className = "region-gate";
    box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "rgTitle");
    box.innerHTML = '<div class="rg-card">'+
      '<div class="rg-mark"><svg viewBox="0 0 80 120" aria-hidden="true"><ellipse cx="40" cy="42" rx="29" ry="35" fill="none" stroke="currentColor" stroke-width="8"/><path d="M24 71 L35 90 M56 71 L45 90" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/><rect x="32" y="89" width="16" height="27" rx="3" fill="currentColor"/><polyline points="2,44 21,44 26,33 33,60 40,20 46,52 50,44 78,44" fill="none" stroke="var(--volt)" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/></svg></div>'+
      '<h2 id="rgTitle">'+esc(T("Choose your region"))+'</h2>'+
      '<p>'+esc(T("We'll show you the regions and plans for where your club is."))+'</p>'+
      '<label class="rg-label" for="rgSel">'+esc(T("Country"))+'</label>'+
      '<select id="rgSel">'+opts.map(function(o){ return '<option value="'+o.code+'"'+(o.code===cur?" selected":"")+'>'+esc(o.n)+'</option>'; }).join("")+'</select>'+
      '<button type="button" class="btn btn-primary rg-go" id="rgGo">'+esc(T("Continue"))+'</button>'+
    '</div>';
    document.body.appendChild(box);
    document.documentElement.classList.add("rg-open");
    var sel = box.querySelector("#rgSel");
    setTimeout(function(){ try{ sel.focus(); }catch(e){} }, 50);
    box.querySelector("#rgGo").addEventListener("click", function(){
      picked = sel.value; set(picked);
      box.remove(); box = null; document.documentElement.classList.remove("rg-open");
      paintChips();
      document.dispatchEvent(new CustomEvent("pv:country", {detail:picked}));
    });
  }
  window.pvChooseRegion = open;

  function start(){
    addChips();
    var qs = new URLSearchParams(location.search), q = (qs.get("country") || "").toUpperCase();
    if(!picked && q && byCode(q)){ picked = q; set(q); paintChips(); }
    if(!picked) open();
  }
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  document.addEventListener("pv:lang", paintChips);
})();
