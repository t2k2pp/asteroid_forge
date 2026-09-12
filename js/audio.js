/* ASTEROID FORGE — WebAudio 合成 SFX (外部ファイル不使用 / ユーザージェスチャ後に遅延初期化) */
(function (root) {
  var AF = root.AF = root.AF || {};

  var ctx = null, master = null, noiseBuf = null;
  var mutedFlag = false;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.22;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function noise() {
    if (!noiseBuf && ctx) {
      try {
        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
        var d = noiseBuf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { }
    }
    return noiseBuf;
  }

  function tone(f0, f1, dur, type, vol, at) {
    if (!ctx) return;
    try {
      var t = (at == null ? ctx.currentTime : at);
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(Math.max(20, f0), t);
      if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(Math.max(0.0001, vol == null ? 0.5 : vol), t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { }
  }

  function burstNoise(dur, vol, fLo, fHi) {
    if (!ctx || !noise()) return;
    try {
      var t = ctx.currentTime;
      var src = ctx.createBufferSource(); src.buffer = noiseBuf;
      var f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(fHi, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(30, fLo), t + dur);
      f.Q.value = 1.1;
      var g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.03);
    } catch (e) { }
  }

  var lib = {
    shoot: function () { tone(760, 320, 0.07, 'square', 0.4); },
    hitRock: function () { tone(190, 150, 0.05, 'square', 0.3); },
    boom: function () { burstNoise(0.42, 0.8, 60, 1800); tone(120, 40, 0.34, 'triangle', 0.5); },
    boomSmall: function () { burstNoise(0.22, 0.5, 160, 2400); },
    hurt: function () { tone(220, 60, 0.3, 'sawtooth', 0.7); burstNoise(0.3, 0.5, 90, 900); },
    pickup: function () { tone(620, 930, 0.09, 'sine', 0.5); },
    craft: function () { var t = ctx ? ctx.currentTime : 0; tone(420, 420, 0.1, 'square', 0.4, t); tone(630, 630, 0.1, 'square', 0.4, t + 0.08); tone(840, 840, 0.14, 'square', 0.4, t + 0.16); },
    warp: function () { tone(200, 900, 0.12, 'sine', 0.25); },
    clear: function () { var t = ctx ? ctx.currentTime : 0; tone(392, 392, 0.16, 'square', 0.45, t); tone(523, 523, 0.16, 'square', 0.45, t + 0.14); tone(784, 784, 0.28, 'square', 0.5, t + 0.28); },
    raider: function () { tone(90, 70, 0.16, 'sawtooth', 0.35); },
    heal: function () { tone(440, 880, 0.18, 'sine', 0.4); },
    click: function () { tone(520, 480, 0.04, 'square', 0.25); }
  };

  function play(name) {
    if (mutedFlag) return;
    ensure();
    if (!ctx || !lib[name]) return;
    try { if (ctx.state === 'suspended') ctx.resume(); lib[name](); } catch (e) { }
  }

  AF.SFX = {
    init: function () { ensure(); },
    play: play,
    toggleMute: function () { mutedFlag = !mutedFlag; return mutedFlag; },
    setMuted: function (v) { mutedFlag = !!v; },
    muted: function () { return mutedFlag; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
