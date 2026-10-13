/* skill profile visuals: the hexagon radar and the shot silhouette viewer.
   Kept apart from app.js because the drawing maths deserves its own file.
   app.js calls r2figure.mount() once the development view exists. */
window.r2figure = (function(){
  "use strict";

  var D = window.R2;
  function $(s){ return document.querySelector(s); }
  function T(k){ return window.r2i18n ? window.r2i18n.t(k) : k; }

  /* score bands. Semantic, not the brand accent. */
  function band(v){
    if(v < 5.5) return {c:"#FF5A5A", t:T("v.needs")};
    if(v < 7.0) return {c:"#FF9F43", t:T("v.solid")};
    return {c:"#5BD98A", t:T("v.strong")};
  }

  /* set by mount() so the rest of the app can drive the viewer */
  var pickShot = null, goSlide = null;

  /* The nine skill cards and the eight-plus shot poses are two different lists.
     Match on the English key, then the Spanish gloss, so "Serve & return" finds
     "Serve" and "Volley" finds "volea". */
  function shotIndex(name){
    if(!D.BODY) return -1;
    var q = String(name).toLowerCase();
    for(var i=0;i<D.BODY.length;i++){
      var b = D.BODY[i];
      if(b.k.toLowerCase() === q) return i;
    }
    for(var j=0;j<D.BODY.length;j++){
      var c = D.BODY[j];
      if(q.indexOf(c.k.toLowerCase()) === 0 || c.k.toLowerCase().indexOf(q) === 0) return j;
      if(c.es && c.es.toLowerCase() === q) return j;
    }
    return -1;
  }

  function showShot(name){
    var i = shotIndex(name);
    if(i < 0 || !pickShot) return false;
    if(goSlide) goSlide(1);
    pickShot(i);
    return true;
  }

  function mount(){
    /* ---------- skill profile: slide 1 radar, slide 2 body map ---------- */
    var MONO = 'IBM Plex Mono, monospace';

    (function radar(){
      var R = D.RADAR, cx = 180, cy = 142, rad = 96, n = R.length;
      function pt(i, val){
        var a = -Math.PI/2 + i*2*Math.PI/n, r = rad*(val/10);
        return [cx + r*Math.cos(a), cy + r*Math.sin(a)];
      }
      var s = '<svg viewBox="0 0 360 314" width="100%" role="img" aria-label="Skill radar comparing ' +
              D.PLAYER.first + ' with the group average">';
      [2.5,5,7.5,10].forEach(function(g){
        var p = []; for(var i=0;i<n;i++) p.push(pt(i,g).join(","));
        s += '<polygon points="'+p.join(" ")+'" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1"/>';
      });
      for(var i=0;i<n;i++){
        var e = pt(i,10);
        s += '<line x1="'+cx+'" y1="'+cy+'" x2="'+e[0]+'" y2="'+e[1]+'" stroke="rgba(255,255,255,.1)" stroke-width="1"/>';
      }
      function poly(key, fill, stroke){
        var p = []; for(var i=0;i<n;i++) p.push(pt(i, R[i][key]).join(","));
        return '<polygon points="'+p.join(" ")+'" fill="'+fill+'" stroke="'+stroke+'" stroke-width="2" stroke-linejoin="round"/>';
      }
      s += poly("sq","rgba(143,166,188,.12)","rgba(143,166,188,.55)");
      s += poly("me","rgba(200,245,66,.22)","#C8F542");
      for(var j=0;j<n;j++){
        var d = pt(j, R[j].me);
        s += '<circle cx="'+d[0]+'" cy="'+d[1]+'" r="3.4" fill="#C8F542"/>';
        var l = pt(j, 12.3);
        var anchor = l[0] > cx+6 ? "start" : (l[0] < cx-6 ? "end" : "middle");
        s += '<text x="'+l[0]+'" y="'+(l[1]+3.5)+'" font-size="11" font-family="'+MONO+'" fill="#9AA3AB" text-anchor="'+anchor+'">'+R[j].k+'</text>';
      }
      s += '<g font-size="11" font-family="'+MONO+'">'+
           '<rect x="38" y="294" width="10" height="10" rx="2" fill="#C8F542"/><text x="54" y="303" fill="#F2F4F5">'+D.PLAYER.first+'</text>'+
           '<rect x="140" y="294" width="10" height="10" rx="2" fill="rgba(143,166,188,.55)"/><text x="156" y="303" fill="#9AA3AB">Group average</text>'+
           '</g></svg>';
      $("#radar").innerHTML = s;
    })();

    (function shotViewer(){
      var figure = $("#bodyFig"), list = $("#bodyList"), cap = $("#bodyCap");
      if(!figure) return;

      /* ---- colour helpers ---- */
      function rgb(h){ return [parseInt(h.substr(1,2),16), parseInt(h.substr(3,2),16), parseInt(h.substr(5,2),16)]; }
      function hex(a){ return "#" + a.map(function(v){ return ("0"+Math.max(0,Math.min(255,Math.round(v))).toString(16)).slice(-2); }).join(""); }
      function mix(h1,h2,t){ var a=rgb(h1), b=rgb(h2); return hex([0,1,2].map(function(i){ return a[i]+(b[i]-a[i])*t; })); }
      var lighten = function(c,t){ return mix(c,"#FFFFFF",t); };
      var darken  = function(c,t){ return mix(c,"#07121D",t); };

      /* ---- geometry helpers ---- */
      function unit(a,b){
        var dx=b[0]-a[0], dy=b[1]-a[1], l=Math.sqrt(dx*dx+dy*dy)||1;
        return [dx/l, dy/l];
      }
      function add(p,d,k){ return [p[0]+d[0]*k, p[1]+d[1]*k]; }
      function lerp(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; }
      function rot(d,deg){
        var r=deg*Math.PI/180, c=Math.cos(r), s=Math.sin(r);
        return [d[0]*c - d[1]*s, d[0]*s + d[1]*c];
      }
      function n2(v){ return v.toFixed(1); }

      /* closed Catmull-Rom through the outline points, so edges curve like a body */
      function smooth(p){
        var n = p.length, d = "M" + n2(p[0][0]) + "," + n2(p[0][1]);
        for(var i=0;i<n;i++){
          var p0=p[(i-1+n)%n], p1=p[i], p2=p[(i+1)%n], p3=p[(i+2)%n];
          var c1=[p1[0]+(p2[0]-p0[0])/6, p1[1]+(p2[1]-p0[1])/6];
          var c2=[p2[0]-(p3[0]-p1[0])/6, p2[1]-(p3[1]-p1[1])/6];
          d += " C"+n2(c1[0])+","+n2(c1[1])+" "+n2(c2[0])+","+n2(c2[1])+" "+n2(p2[0])+","+n2(p2[1]);
        }
        return d + "Z";
      }

      /* a semicircular end cap, so limbs finish round instead of pointed */
      function endCap(centre, dir, r){
        var a = Math.atan2(dir[1], dir[0]);
        return [62, 31, 0, -31, -62].map(function(deg){
          var t = a + deg*Math.PI/180;
          return [centre[0] + Math.cos(t)*r, centre[1] + Math.sin(t)*r];
        });
      }

      /* a limb: centre line with a width at each waypoint, rounded at both ends */
      function limb(way){
        var L = [], R = [], n = way.length;
        for(var i=0;i<n;i++){
          var p = way[i];
          var prev = way[i-1] || way[i], next = way[i+1] || way[i];
          var dx = next[0]-prev[0], dy = next[1]-prev[1];
          var len = Math.sqrt(dx*dx+dy*dy) || 1;
          var nx = -dy/len, ny = dx/len, h = p[2]/2;
          L.push([p[0]+nx*h, p[1]+ny*h]);
          R.unshift([p[0]-nx*h, p[1]-ny*h]);
        }
        var dEnd   = unit([way[n-2][0],way[n-2][1]], [way[n-1][0],way[n-1][1]]);
        var dStart = unit([way[1][0],way[1][1]], [way[0][0],way[0][1]]);
        return smooth(L
          .concat(endCap([way[n-1][0],way[n-1][1]], dEnd,   way[n-1][2]/2))
          .concat(R)
          .concat(endCap([way[0][0],way[0][1]],     dStart, way[0][2]/2)));
      }

      /* an open hand: palm plus four fingers and a thumb */
      function openHand(wrist, dir, w){
        var palmEnd = add(wrist, dir, 7);
        var out = '<path d="'+limb([[wrist[0],wrist[1],w*1.05],[palmEnd[0],palmEnd[1],w*1.3]])+'"/>';
        var fan = [[-23,10],[-7,12],[8,11.5],[24,9.5]];
        fan.forEach(function(f){
          var d = rot(dir, f[0]);
          var tip = add(palmEnd, d, f[1]);
          out += '<path d="'+limb([[palmEnd[0],palmEnd[1],4.4],[tip[0],tip[1],3]])+'"/>';
        });
        var td = rot(dir, -62), tip = add(palmEnd, td, 7.5);
        out += '<path d="'+limb([[wrist[0],wrist[1],5],[tip[0],tip[1],3.4]])+'"/>';
        return out;
      }
      /* a closed fist on the grip */
      function fist(wrist, dir, w){
        var a = add(wrist, dir, 5), b = add(wrist, dir, 10);
        return '<path d="'+limb([[wrist[0],wrist[1],w*1.1],[a[0],a[1],w*1.45],[b[0],b[1],w*1.0]])+'"/>';
      }
      /* a foot, pointing away from the body */
      function foot(ankle, hip){
        var away = ankle[0] >= hip[0] ? 1 : -1;
        var d = [away*0.62, 0.78];
        var m = add(ankle, d, 7), t = add(ankle, d, 14);
        return '<path d="'+limb([[ankle[0],ankle[1]-3,11],[m[0],m[1],11.5],[t[0],t[1],7.5]])+'"/>';
      }

      function draw(sk){
        var p = sk.pose, c = band(sk.v).c;
        var ms = lerp(p.sL, p.sR, .5), mh = lerp(p.hL, p.hR, .5);
        var chest = lerp(ms, mh, .28), waist = lerp(ms, mh, .62);
        function span(a,b){ var dx=a[0]-b[0], dy=a[1]-b[1]; return Math.sqrt(dx*dx+dy*dy); }
        var sh = span(p.sL,p.sR), hp = span(p.hL,p.hR);

        var body = "";

        /* torso: shoulders, chest, waist, hips */
        body += '<path d="'+limb([
          [ms[0], ms[1]-3, sh*1.04],
          [chest[0], chest[1], sh*0.99],
          [waist[0], waist[1], sh*0.70],
          [mh[0], mh[1]+2, hp*1.04]
        ])+'"/>';

        /* neck and trapezius */
        body += '<path d="'+limb([
          [p.head[0], p.head[1]+12, 15],
          [lerp([p.head[0],p.head[1]+12], ms, .6)[0], lerp([p.head[0],p.head[1]+12], ms, .6)[1], 19],
          [ms[0], ms[1]+2, sh*0.60]
        ])+'"/>';

        /* head: skull into a narrower jaw */
        var hx = p.head[0], hy = p.head[1];
        body += '<ellipse cx="'+hx+'" cy="'+(hy-2)+'" rx="16.5" ry="18"/>';
        body += '<path d="'+limb([
          [hx, hy+2, 29],
          [hx, hy+9, 25],
          [hx, hy+15, 16]
        ])+'"/>';

        /* arms: shoulder, bicep, elbow, forearm belly, wrist */
        [[p.sL,p.eL,p.wL,"off"],[p.sR,p.eR,p.wR,"racket"]].forEach(function(arm){
          var s0=arm[0], e=arm[1], w=arm[2];
          var bicep = lerp(s0,e,.45), fore = lerp(e,w,.42);
          body += '<path d="'+limb([
            [s0[0], s0[1], 21],
            [bicep[0], bicep[1], 19.5],
            [e[0], e[1], 14.5]
          ])+'"/>';
          body += '<path d="'+limb([
            [e[0], e[1], 14.5],
            [fore[0], fore[1], 15],
            [w[0], w[1], 9.5]
          ])+'"/>';
          var d = unit(e,w);
          body += arm[3] === "racket" ? fist(w,d,9.5) : openHand(w,d,9.5);
        });

        /* legs: hip, quad, knee, calf, ankle */
        [[p.hL,p.kL,p.aL],[p.hR,p.kR,p.aR]].forEach(function(leg){
          var h0=leg[0], k=leg[1], a0=leg[2];
          var quad = lerp(h0,k,.42), calf = lerp(k,a0,.36);
          body += '<path d="'+limb([
            [h0[0], h0[1]-3, 26],
            [quad[0], quad[1], 25],
            [k[0], k[1], 18]
          ])+'"/>';
          body += '<path d="'+limb([
            [k[0], k[1], 18],
            [calf[0], calf[1], 19],
            [a0[0], a0[1], 11]
          ])+'"/>';
          body += foot(a0, h0);
        });

        /* racket along the wrist angle */
        var ang = p.ra * Math.PI/180;
        var grip = [p.wR[0] + 13*Math.cos(ang), p.wR[1] + 13*Math.sin(ang)];
        var head = [p.wR[0] + 29*Math.cos(ang), p.wR[1] + 29*Math.sin(ang)];
        var racket =
          '<path d="'+limb([[p.wR[0],p.wR[1],7],[grip[0],grip[1],6.4]])+'" fill="'+lighten(c,.2)+'"/>'+
          '<ellipse cx="'+n2(head[0])+'" cy="'+n2(head[1])+'" rx="10" ry="13" '+
          'transform="rotate('+(p.ra+90)+' '+n2(head[0])+' '+n2(head[1])+')" '+
          'fill="none" stroke="'+c+'" stroke-width="3.6"/>';

        var ball = p.ball
          ? '<circle cx="'+p.ball[0]+'" cy="'+p.ball[1]+'" r="6.5" fill="#F2FF7A" stroke="'+darken(c,.4)+'" stroke-width="1.4"/>'
          : "";

        figure.innerHTML =
          '<svg viewBox="0 0 240 300" role="img" aria-label="'+sk.k+', rated '+sk.v.toFixed(1)+' out of 10">'+
          '<ellipse cx="120" cy="287" rx="68" ry="7" fill="#000" fill-opacity=".25"/>'+
          '<g fill="'+c+'">'+body+'</g>'+
          racket + ball +
          '</svg>';

        cap.innerHTML = '<div class="bk">'+sk.k+'</div>'+
          '<div class="be">'+sk.es+' &middot; '+sk.part+'</div>'+
          '<div class="bv" style="color:'+c+'">'+sk.v.toFixed(1)+'<small>/10</small></div>';
      }

      list.innerHTML = D.BODY.map(function(sk,i){
        var c = band(sk.v).c;
        return '<button class="brow'+(i===0?" on":"")+'" data-shot="'+i+'">'+
          '<span class="bd" style="background:'+c+'"></span>'+
          '<span class="bn">'+sk.k+'<small>'+sk.part+'</small></span>'+
          '<span class="bs" style="color:'+c+'">'+sk.v.toFixed(1)+'</span></button>';
      }).join("");

      list.onclick = function(e){
        var b = e.target.closest("[data-shot]");
        if(!b) return;
        pickShot(+b.dataset.shot);
      };

      pickShot = function(i){
        var rows = list.querySelectorAll("[data-shot]");
        Array.prototype.forEach.call(rows, function(x){ x.classList.toggle("on", +x.dataset.shot === i); });
        var row = rows[i];
        if(row && row.scrollIntoView) row.scrollIntoView({block:"nearest"});
        draw(D.BODY[i]);
      };

      draw(D.BODY[0]);
    })();

    /* carousel: segmented buttons plus native swipe / trackpad scroll */
    (function carousel(){
      var strip = $("#pslides");
      if(!strip) return;
      var btns = Array.prototype.slice.call(document.querySelectorAll("[data-slide]"));
      function mark(i){
        btns.forEach(function(b){ b.classList.toggle("on", +b.dataset.slide === i); });
      }
      goSlide = function(i){
        strip.scrollTo({left: i * strip.clientWidth, behavior: "smooth"});
        mark(i);
      };
      btns.forEach(function(b){
        b.onclick = function(){ goSlide(+b.dataset.slide); };
      });
      var t;
      strip.onscroll = function(){
        clearTimeout(t);
        t = setTimeout(function(){
          mark(Math.round(strip.scrollLeft / strip.clientWidth));
        }, 90);
      };
    })();
  }

  return {mount:mount, band:band, showShot:showShot, shotIndex:shotIndex};
})();
