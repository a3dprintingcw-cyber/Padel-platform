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
              D.PLAYER.first + ' with the squad average">';
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
           '<rect x="140" y="294" width="10" height="10" rx="2" fill="rgba(143,166,188,.55)"/><text x="156" y="303" fill="#9AA3AB">Squad average</text>'+
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

      /* ---- proportions ----
         The old figure was 6 heads tall with arms two thirds the width of the skull,
         which is why it read as an inflated mannequin. An athlete is nearer eight
         heads, with limbs that taper hard from shoulder to wrist and hip to ankle.
         Everything below is expressed against HEAD so the whole build scales at once. */
      var HEAD_RX = 12, HEAD_RY = 14;
      var W = {
        neck:14,
        upperArm:15.5, elbow:11.5, foreArm:11, wrist:8,
        thigh:23, knee:15.5, calf:16.5, ankle:9.5,
        shirt:5, sleeve:3.5, shorts:6      /* how far clothing sits proud of the limb */
      };

      /* a hand: a small wedge, not a bunch of sausages. At this scale fingers turn to
         mush, and a silhouette reads better with a clean mitt. */
      function hand(wrist, dir, open){
        var a = add(wrist, dir, open ? 5 : 4), b = add(wrist, dir, open ? 13 : 8.5);
        return '<path d="'+limb([
          [wrist[0], wrist[1], W.wrist],
          [a[0], a[1], open ? 9.5 : 10.5],
          [b[0], b[1], open ? 6.5 : 8]
        ])+'"/>';
      }

      /* a shoe: flat sole, heel behind the ankle, toe in front */
      function foot(ankle, knee){
        var lean = ankle[0] >= knee[0] ? 1 : -1;
        var toe  = [ankle[0] + lean*17, ankle[1] + 5];
        var heel = [ankle[0] - lean*7,  ankle[1] + 4];
        return '<path d="'+smooth([
          [ankle[0] - lean*6, ankle[1] - 6],
          [ankle[0] + lean*5, ankle[1] - 5],
          [toe[0] - lean*2,   toe[1] - 4],
          [toe[0],            toe[1] + 1.5],
          [heel[0],           heel[1] + 2],
          [heel[0] - lean*1,  heel[1] - 3]
        ])+'"/>';
      }

      /* A padel racket is a solid perforated bat, roughly the size of the player's
         head, not the wire hoop a tennis racket outline suggests. Drawn in its own
         frame so the holes stay put: +x runs from the wrist out along the handle. */
      function racket(wrist, deg, colour){
        var holes = "", ring = [[0,0],[1,0],[0,1],[1,1],[-1,0],[0,-1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0]];
        ring.forEach(function(h){
          var cx = 34 + h[0]*8.4, cy = h[1]*8.4;
          if((cx-34)*(cx-34)/(11.5*11.5) + cy*cy/(9.5*9.5) > 1) return;
          holes += '<circle cx="'+n2(cx)+'" cy="'+n2(cy)+'" r="2.5" fill="#000"/>';
        });
        return '<g transform="translate('+n2(wrist[0])+','+n2(wrist[1])+') rotate('+n2(deg)+')">'+
          '<mask id="rkm" maskUnits="userSpaceOnUse" x="-14" y="-22" width="72" height="44">'+
            '<rect x="-14" y="-22" width="72" height="44" fill="#fff"/>'+ holes +
          '</mask>'+
          /* handle, with a small flare at the butt so it does not look like a stick */
          '<path d="'+limb([[0,0,9],[9,0,8],[17,0,9.5]])+'" fill="'+colour+'"/>'+
          /* face: longer along the handle than across, the way a padel bat is */
          '<ellipse cx="34" cy="0" rx="17.5" ry="14.5" fill="'+colour+'" mask="url(#rkm)"/>'+
          '</g>';
      }

      /* Real silhouettes now, one PNG per shot, tinted to the score band by using the
         image as a CSS mask over a solid colour. The vector figure below stays as the
         fallback: if a PNG ever fails to load the viewer still shows something. */
      var SHOT_FILE = {
        "Bandeja":"bandeja", "Víbora":"vibora", "Wall exit":"wall-exit", "Volley":"volley",
        "Chiquita":"chiquita", "Positioning":"positioning", "Serve":"serve",
        "Agility":"agility", "Match head":"match-head"
      };
      var shotOk = {};

      function drawPhoto(sk, c){
        var file = SHOT_FILE[sk.k];
        if(!file) return false;
        var url = "assets/shots/" + file + ".png";
        figure.innerHTML =
          '<div class="shotwrap">'+
            '<div class="shotimg" role="img" aria-label="'+sk.k+', rated '+sk.v.toFixed(1)+' out of 10" '+
            'style="background-color:'+c+';-webkit-mask-image:url('+url+');mask-image:url('+url+')"></div>'+
            '<div class="shotshadow"></div>'+
          '</div>';
        return true;
      }

      function drawVector(sk){
        var p = sk.pose, c = band(sk.v).c;
        var ms = lerp(p.sL, p.sR, .5), mh = lerp(p.hL, p.hR, .5);
        var chest = lerp(ms, mh, .26), waist = lerp(ms, mh, .66);
        function span(a,b){ var dx=a[0]-b[0], dy=a[1]-b[1]; return Math.sqrt(dx*dx+dy*dy); }
        var sh = span(p.sL,p.sR), hp = span(p.hL,p.hR);

        var body = "";

        /* torso: deltoid line, chest, waist pinch, hips */
        body += '<path d="'+limb([
          [ms[0], ms[1]-1, sh*0.96],
          [chest[0], chest[1], sh*0.92],
          [waist[0], waist[1], sh*0.62],
          [mh[0], mh[1]+1, hp*0.94]
        ])+'"/>';

        /* the shirt sits proud of the torso and stops at a hem, which is most of what
           makes a silhouette read as a person in kit rather than a nude figure */
        var hem = lerp(ms, mh, 1.02);
        body += '<path d="'+limb([
          [ms[0], ms[1]+1, sh*0.96 + W.shirt],
          [chest[0], chest[1], sh*0.94 + W.shirt],
          [waist[0], waist[1], sh*0.78 + W.shirt],
          [hem[0], hem[1], hp*0.98 + W.shirt]
        ])+'"/>';

        /* neck, then the skull */
        var hx = p.head[0], hy = p.head[1];
        var chin = [hx, hy + HEAD_RY - 1];
        body += '<path d="'+limb([
          [chin[0], chin[1], W.neck],
          [lerp(chin, ms, .7)[0], lerp(chin, ms, .7)[1], W.neck + 4],
          [ms[0], ms[1]+1, sh*0.55]
        ])+'"/>';
        body += '<ellipse cx="'+hx+'" cy="'+hy+'" rx="'+HEAD_RX+'" ry="'+HEAD_RY+'"/>';

        /* arms, the racket side last so the hand lands on top of the grip */
        [[p.sL,p.eL,p.wL,false],[p.sR,p.eR,p.wR,true]].forEach(function(arm){
          var s0=arm[0], e=arm[1], w=arm[2];
          var bicep = lerp(s0,e,.42), fore = lerp(e,w,.40);
          /* sleeve */
          body += '<path d="'+limb([
            [s0[0], s0[1], W.upperArm + W.sleeve + 2],
            [lerp(s0,e,.34)[0], lerp(s0,e,.34)[1], W.upperArm + W.sleeve]
          ])+'"/>';
          body += '<path d="'+limb([
            [s0[0], s0[1], W.upperArm],
            [bicep[0], bicep[1], W.upperArm - 1],
            [e[0], e[1], W.elbow]
          ])+'"/>';
          body += '<path d="'+limb([
            [e[0], e[1], W.elbow],
            [fore[0], fore[1], W.foreArm],
            [w[0], w[1], W.wrist]
          ])+'"/>';
          body += hand(w, unit(e,w), !arm[3]);
        });

        /* legs */
        [[p.hL,p.kL,p.aL],[p.hR,p.kR,p.aR]].forEach(function(leg){
          var h0=leg[0], k=leg[1], a0=leg[2];
          var quad = lerp(h0,k,.40), calf = lerp(k,a0,.33);
          /* shorts to mid thigh */
          body += '<path d="'+limb([
            [h0[0], h0[1]-4, W.thigh + W.shorts + 2],
            [lerp(h0,k,.46)[0], lerp(h0,k,.46)[1], W.thigh + W.shorts - 3]
          ])+'"/>';
          body += '<path d="'+limb([
            [h0[0], h0[1]-2, W.thigh],
            [quad[0], quad[1], W.thigh - 2],
            [k[0], k[1], W.knee]
          ])+'"/>';
          body += '<path d="'+limb([
            [k[0], k[1], W.knee],
            [calf[0], calf[1], W.calf],
            [a0[0], a0[1], W.ankle]
          ])+'"/>';
          body += foot(a0, k);
        });

        var ball = p.ball
          ? '<circle cx="'+p.ball[0]+'" cy="'+p.ball[1]+'" r="6" fill="#E9FF6B" stroke="'+darken(c,.45)+'" stroke-width="1.2"/>'
          : "";

        /* every point the drawing can reach, so nothing gets sliced off the frame */
        var pts = [p.head, p.sL, p.sR, p.hL, p.hR, p.eL, p.eR, p.wL, p.wR,
                   p.kL, p.kR, p.aL, p.aR].slice();
        if(p.ball) pts.push(p.ball);
        var rad = p.ra * Math.PI/180;
        pts.push([p.wR[0] + Math.cos(rad)*54, p.wR[1] + Math.sin(rad)*54]);   /* racket tip */
        pts.push([p.wR[0] + Math.cos(rad+1.35)*38, p.wR[1] + Math.sin(rad+1.35)*38]);
        pts.push([p.wR[0] + Math.cos(rad-1.35)*38, p.wR[1] + Math.sin(rad-1.35)*38]);

        var xs = pts.map(function(q){ return q[0]; }), ys = pts.map(function(q){ return q[1]; });
        var pad = 26;
        var x0 = Math.min.apply(null, xs) - pad, x1 = Math.max.apply(null, xs) + pad;
        var y0 = Math.min.apply(null, ys) - pad, y1 = Math.max.apply(null, ys) + pad + 14;

        /* hold the frame's shape so the figure does not jump size between shots */
        var AR = 240/300, w = x1-x0, h = y1-y0;
        if(w/h < AR){ var nw = h*AR; x0 -= (nw-w)/2; w = nw; }
        else { var nh = w/AR; y0 -= (nh-h)/2; h = nh; }

        var footY = Math.max(p.aL[1], p.aR[1]) + 11;
        var footX = (p.aL[0] + p.aR[0]) / 2;
        var stance = Math.abs(p.aL[0] - p.aR[0]);

        figure.innerHTML =
          '<svg viewBox="'+n2(x0)+' '+n2(y0)+' '+n2(w)+' '+n2(h)+'" preserveAspectRatio="xMidYMax meet" '+
          'role="img" aria-label="'+sk.k+', rated '+sk.v.toFixed(1)+' out of 10">'+
          '<ellipse cx="'+n2(footX)+'" cy="'+n2(footY)+'" rx="'+n2(stance/2 + 34)+'" ry="6.5" fill="#000" fill-opacity=".28"/>'+
          '<g fill="'+c+'">'+body+'</g>'+
          racket(p.wR, p.ra, c) + ball +
          '</svg>';

        cap.innerHTML = '<div class="bk">'+sk.k+'</div>'+
          '<div class="be">'+sk.es+' &middot; '+sk.part+'</div>'+
          '<div class="bv" style="color:'+c+'">'+sk.v.toFixed(1)+'<small>/10</small></div>';
      }


      function draw(sk){
        var c = band(sk.v).c;
        var file = SHOT_FILE[sk.k];
        if(file && shotOk[file] !== false && drawPhoto(sk, c)){
          if(shotOk[file] === undefined){
            var probe = new Image();
            probe.onload  = function(){ shotOk[file] = true; };
            probe.onerror = function(){ shotOk[file] = false; drawVector(sk); };
            probe.src = "assets/shots/" + file + ".png";
          }
        } else {
          drawVector(sk);
        }
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
