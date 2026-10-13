/* camera scanning for the kantine.
   Bar staff point the phone at the player's screen instead of typing five characters
   with wet hands. Uses BarcodeDetector where the browser has it (Android Chrome,
   Chrome and Edge on desktop). Safari has no BarcodeDetector, so there we say so
   plainly and fall back to the native camera app or typing, rather than pretending.
   Nothing here leaves the device: no frames are uploaded anywhere. */
window.r2scan = (function(){
  "use strict";

  var supported = typeof window.BarcodeDetector === "function";
  var media = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  var stream = null, video = null, raf = 0, detector = null, stopped = true;

  function isSupported(){ return supported && media && window.isSecureContext; }
  function hasCamera(){ return media && window.isSecureContext; }

  /* Pull the five character code out of whatever the QR carried: either the full
     deep link we generate, or a bare code if someone printed one by hand. */
  function codeFrom(raw){
    if(!raw) return null;
    var s = String(raw).trim();
    var m = s.match(/verify-([A-Z0-9]{4,8})/i);
    if(m) return m[1].toUpperCase();
    m = s.match(/^[A-Z0-9]{5}$/i);
    return m ? s.toUpperCase() : null;
  }

  function stop(){
    stopped = true;
    if(raf) cancelAnimationFrame(raf);
    raf = 0;
    if(stream){
      stream.getTracks().forEach(function(t){ try{ t.stop(); }catch(e){} });
      stream = null;
    }
    video = null;
  }

  /* Torch is not in the spec everywhere; treat it as a bonus that may not exist. */
  function torchTrack(){
    if(!stream) return null;
    var track = stream.getVideoTracks()[0];
    if(!track || !track.getCapabilities) return null;
    var caps = {};
    try{ caps = track.getCapabilities() || {}; }catch(e){ return null; }
    return caps.torch ? track : null;
  }

  function setTorch(on){
    var track = torchTrack();
    if(!track) return Promise.resolve(false);
    return track.applyConstraints({advanced:[{torch:!!on}]})
      .then(function(){ return true; })
      .catch(function(){ return false; });
  }

  /* start(videoEl, onCode, onError) — resolves once the camera is showing. */
  function start(videoEl, onCode, onError){
    if(!isSupported()){
      onError && onError("unsupported");
      return Promise.reject(new Error("unsupported"));
    }
    stop();
    stopped = false;
    video = videoEl;

    try{ detector = new window.BarcodeDetector({formats:["qr_code"]}); }
    catch(e){ onError && onError("unsupported"); return Promise.reject(e); }

    return navigator.mediaDevices.getUserMedia({
      video: {facingMode:{ideal:"environment"}, width:{ideal:1280}, height:{ideal:720}},
      audio: false
    }).then(function(s){
      if(stopped){ s.getTracks().forEach(function(t){ t.stop(); }); return; }
      stream = s;
      video.srcObject = s;
      video.setAttribute("playsinline", "");
      video.muted = true;
      return video.play();
    }).then(function(){
      if(stopped) return;
      var last = 0, seen = null, seenAt = 0;

      function frame(now){
        if(stopped) return;
        raf = requestAnimationFrame(frame);
        /* Detection at ~8fps is plenty for a code held still and keeps phones cool. */
        if(now - last < 120) return;
        last = now;
        if(!video || video.readyState < 2) return;

        detector.detect(video).then(function(codes){
          if(stopped || !codes || !codes.length) return;
          for(var i=0;i<codes.length;i++){
            var c = codeFrom(codes[i].rawValue);
            if(!c) continue;
            /* Debounce: the same code sits in frame for many frames running. */
            if(c === seen && Date.now() - seenAt < 2500) return;
            seen = c; seenAt = Date.now();
            onCode(c);
            return;
          }
        }).catch(function(){ /* a dropped frame is not worth surfacing */ });
      }
      raf = requestAnimationFrame(frame);
      return true;
    }).catch(function(err){
      stop();
      var reason = "camera";
      if(err && (err.name === "NotAllowedError" || err.name === "SecurityError")) reason = "denied";
      if(err && err.name === "NotFoundError") reason = "nocamera";
      onError && onError(reason);
      throw err;
    });
  }

  return {
    isSupported: isSupported,
    hasCamera: hasCamera,
    codeFrom: codeFrom,
    start: start,
    stop: stop,
    setTorch: setTorch,
    canTorch: function(){ return !!torchTrack(); }
  };
})();
