/* minimal QR encoder (byte mode, error correction level M, versions 1-10).
   Used for kantine redemption codes so the bar staff can scan instead of type.
   No dependencies. Returns a boolean matrix; r2qr.svg() renders it. */
window.r2qr = (function(){
  "use strict";

  /* data codewords per block, level M: [ecPerBlock, blocks1, data1, blocks2, data2] */
  var RS = {
    1:[10,1,16,0,0], 2:[16,1,28,0,0], 3:[26,1,44,0,0], 4:[18,2,32,0,0], 5:[24,2,43,0,0],
    6:[16,4,27,0,0], 7:[18,4,31,0,0], 8:[22,2,38,2,39], 9:[22,3,36,2,37], 10:[26,4,43,1,44]
  };
  var ALIGN = {
    1:[], 2:[6,18], 3:[6,22], 4:[6,26], 5:[6,30],
    6:[6,34], 7:[6,22,38], 8:[6,24,42], 9:[6,26,46], 10:[6,28,50]
  };

  /* ---- GF(256) ---- */
  var EXP = new Array(512), LOG = new Array(256);
  (function(){
    var x = 1;
    for(var i=0;i<255;i++){
      EXP[i] = x; LOG[x] = i;
      x <<= 1; if(x & 0x100) x ^= 0x11D;
    }
    for(var j=255;j<512;j++) EXP[j] = EXP[j-255];
  })();
  function mul(a,b){ return (a===0||b===0) ? 0 : EXP[LOG[a]+LOG[b]]; }

  function generator(n){
    var g = [1];
    for(var i=0;i<n;i++){
      var next = new Array(g.length+1).fill(0);
      for(var j=0;j<g.length;j++){
        next[j]   ^= mul(g[j], 1);
        next[j+1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    return g;
  }
  function ecc(data, n){
    var g = generator(n), res = new Array(n).fill(0);
    for(var i=0;i<data.length;i++){
      var factor = data[i] ^ res[0];
      res.shift(); res.push(0);
      for(var j=0;j<n;j++) res[j] ^= mul(g[j+1], factor);
    }
    return res;
  }

  /* ---- bit stream ---- */
  function Bits(){ this.b = []; }
  Bits.prototype.put = function(val, len){
    for(var i=len-1;i>=0;i--) this.b.push((val >>> i) & 1);
  };

  /* ---- BCH for format and version information ---- */
  function bch(value, poly, bits){
    var v = value << (bits);
    var polyBits = 0, t = poly;
    while(t){ polyBits++; t >>>= 1; }
    while(true){
      var vb = 0, u = v;
      while(u){ vb++; u >>>= 1; }
      if(vb < polyBits) break;
      v ^= poly << (vb - polyBits);
    }
    return (value << bits) | v;
  }

  function pickVersion(len){
    for(var v=1; v<=10; v++){
      var r = RS[v];
      var dataCW = r[1]*r[2] + r[3]*r[4];
      var countBits = v < 10 ? 8 : 16;
      if(dataCW*8 >= 4 + countBits + len*8) return v;
    }
    return null;
  }

  function encode(text){
    var bytes = [];
    for(var i=0;i<text.length;i++){
      var c = text.charCodeAt(i);
      if(c < 128) bytes.push(c);
      else if(c < 2048){ bytes.push(192|(c>>6), 128|(c&63)); }
      else { bytes.push(224|(c>>12), 128|((c>>6)&63), 128|(c&63)); }
    }
    var version = pickVersion(bytes.length);
    if(!version) throw new Error("code too long for a small QR");

    var r = RS[version], ecPer = r[0];
    var dataCW = r[1]*r[2] + r[3]*r[4];
    var bits = new Bits();
    bits.put(4, 4);
    bits.put(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(function(b){ bits.put(b, 8); });

    var cap = dataCW*8;
    bits.put(0, Math.min(4, cap - bits.b.length));
    while(bits.b.length % 8) bits.b.push(0);

    var cw = [];
    for(var k=0;k<bits.b.length;k+=8){
      var v = 0;
      for(var j=0;j<8;j++) v = (v<<1) | bits.b[k+j];
      cw.push(v);
    }
    var pad = [0xEC, 0x11], p = 0;
    while(cw.length < dataCW) cw.push(pad[p++ % 2]);

    /* split into blocks, interleave data then ecc */
    var blocks = [], pos = 0, spec = [];
    for(var b1=0;b1<r[1];b1++) spec.push(r[2]);
    for(var b2=0;b2<r[3];b2++) spec.push(r[4]);
    spec.forEach(function(n){
      var d = cw.slice(pos, pos+n); pos += n;
      blocks.push({d:d, e:ecc(d, ecPer)});
    });
    var out = [], maxD = Math.max.apply(null, spec);
    for(var i2=0;i2<maxD;i2++)
      blocks.forEach(function(b){ if(i2 < b.d.length) out.push(b.d[i2]); });
    for(var i3=0;i3<ecPer;i3++)
      blocks.forEach(function(b){ out.push(b.e[i3]); });

    return {version:version, cw:out};
  }

  /* ---- matrix ---- */
  function build(version, cw, mask){
    var n = version*4 + 17;
    var m = [], fixed = [];
    for(var i=0;i<n;i++){ m.push(new Array(n).fill(0)); fixed.push(new Array(n).fill(false)); }

    function set(x,y,v){ if(x>=0&&y>=0&&x<n&&y<n){ m[y][x] = v?1:0; fixed[y][x] = true; } }

    /* finders + separators */
    [[0,0],[n-7,0],[0,n-7]].forEach(function(p){
      for(var y=-1;y<8;y++) for(var x=-1;x<8;x++){
        var on = (x>=0&&x<7&&y>=0&&y<7) &&
                 (x===0||x===6||y===0||y===6 || (x>=2&&x<=4&&y>=2&&y<=4));
        set(p[0]+x, p[1]+y, on);
      }
    });
    /* timing */
    for(var t=8;t<n-8;t++){ set(t,6,t%2===0); set(6,t,t%2===0); }
    /* alignment */
    var al = ALIGN[version];
    al.forEach(function(ax){
      al.forEach(function(ay){
        if((ax<9&&ay<9) || (ax<9&&ay>n-10) || (ax>n-10&&ay<9)) return;
        for(var y=-2;y<=2;y++) for(var x=-2;x<=2;x++){
          set(ax+x, ay+y, Math.max(Math.abs(x),Math.abs(y)) !== 1);
        }
      });
    });
    /* dark module */
    set(8, n-8, 1);
    /* format info placeholder area is reserved below by writing it directly */
    var fmt = bch((0 << 3) | mask, 0x537, 10) ^ 0x5412;   /* 00 = level M */
    for(var f=0; f<15; f++){
      var bit = (fmt >>> f) & 1;
      if(f < 6) set(8, f, bit);
      else if(f === 6) set(8, 7, bit);
      else if(f === 7) set(8, 8, bit);
      else if(f === 8) set(7, 8, bit);
      else set(14 - f, 8, bit);

      if(f < 8) set(n-1-f, 8, bit);
      else set(8, n-15+f, bit);
    }
    /* version info */
    if(version >= 7){
      var vinfo = bch(version, 0x1F25, 12);
      for(var v2=0; v2<18; v2++){
        var vb = (vinfo >>> v2) & 1;
        set(Math.floor(v2/3), n-11 + (v2%3), vb);
        set(n-11 + (v2%3), Math.floor(v2/3), vb);
      }
    }

    /* data placement, zigzag from bottom right */
    var dir = -1, row = n-1, idx = 0, bit = 0;
    for(var col = n-1; col > 0; col -= 2){
      if(col === 6) col--;
      while(true){
        for(var c=0;c<2;c++){
          var x = col - c;
          if(!fixed[row][x]){
            var dark = 0;
            if(idx < cw.length) dark = (cw[idx] >>> (7-bit)) & 1;
            if(maskFn(mask, x, row)) dark ^= 1;
            m[row][x] = dark;
            bit++;
            if(bit === 8){ bit = 0; idx++; }
          }
        }
        row += dir;
        if(row < 0 || row >= n){ row -= dir; dir = -dir; break; }
      }
    }
    return m;
  }

  function maskFn(k, x, y){
    switch(k){
      case 0: return (x+y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x+y) % 3 === 0;
      case 4: return (Math.floor(y/2) + Math.floor(x/3)) % 2 === 0;
      case 5: return (x*y)%2 + (x*y)%3 === 0;
      case 6: return ((x*y)%2 + (x*y)%3) % 2 === 0;
      default:return ((x+y)%2 + (x*y)%3) % 2 === 0;
    }
  }

  function penalty(m){
    var n = m.length, p = 0, i, j, run, last, dark = 0;
    function line(get){
      run = 1; last = get(0);
      for(var k=1;k<n;k++){
        var v = get(k);
        if(v === last){ run++; if(run === 5) p += 3; else if(run > 5) p++; }
        else { run = 1; last = v; }
      }
    }
    for(i=0;i<n;i++){ (function(r){ line(function(k){ return m[r][k]; }); })(i); }
    for(i=0;i<n;i++){ (function(c){ line(function(k){ return m[k][c]; }); })(i); }
    for(i=0;i<n-1;i++) for(j=0;j<n-1;j++){
      var s = m[i][j]+m[i][j+1]+m[i+1][j]+m[i+1][j+1];
      if(s === 0 || s === 4) p += 3;
    }
    var pat1 = [1,0,1,1,1,0,1,0,0,0,0], pat2 = [0,0,0,0,1,0,1,1,1,0,1];
    function scan(get){
      for(var k=0;k+11<=n;k++){
        var a = true, b = true;
        for(var q=0;q<11;q++){
          if(get(k+q) !== pat1[q]) a = false;
          if(get(k+q) !== pat2[q]) b = false;
        }
        if(a) p += 40;
        if(b) p += 40;
      }
    }
    for(i=0;i<n;i++){ (function(r){ scan(function(k){ return m[r][k]; }); })(i); }
    for(i=0;i<n;i++){ (function(c){ scan(function(k){ return m[k][c]; }); })(i); }
    for(i=0;i<n;i++) for(j=0;j<n;j++) dark += m[i][j];
    p += Math.floor(Math.abs(dark*100/(n*n) - 50) / 5) * 10;
    return p;
  }

  function matrix(text){
    var enc = encode(text), best = null, bestP = Infinity;
    for(var k=0;k<8;k++){
      var m = build(enc.version, enc.cw, k), p = penalty(m);
      if(p < bestP){ bestP = p; best = m; }
    }
    return best;
  }

  /* renders the matrix as an inline SVG string, quiet zone included */
  function svg(text, opts){
    opts = opts || {};
    var m = matrix(text), n = m.length, q = opts.quiet == null ? 3 : opts.quiet;
    var size = n + q*2;
    var fg = opts.fg || "#0A1622", bg = opts.bg || "#FFFFFF";
    var d = "";
    for(var y=0;y<n;y++){
      for(var x=0;x<n;x++){
        if(m[y][x]) d += "M"+(x+q)+","+(y+q)+"h1v1h-1z";
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+size+' '+size+'" '+
      'shape-rendering="crispEdges" role="img" aria-label="Redemption code '+text+'">'+
      '<rect width="'+size+'" height="'+size+'" fill="'+bg+'" rx="1"/>'+
      '<path d="'+d+'" fill="'+fg+'"/></svg>';
  }

  return {matrix:matrix, svg:svg};
})();
