/* ASTEROID FORGE — 永続化 (localStorage + メモリ退避 + sanitize)
 * スキーマ: {v, stage, res:{fe,cr}, upgrades:{...}, highScore, deaths, muted, ts} */
(function (root) {
  var AF = root.AF = root.AF || {};
  var C = AF.CFG;

  var MAX_RES = 9999, MAX_STAGE = 999;
  var memFallback = null;   // localStorage 不可環境の退避先

  function ls() { try { return root.localStorage || null; } catch (e) { return null; } }
  function getRaw() {
    try { var s = ls(); if (s) { var v = s.getItem(C.SAVE_KEY); if (v != null) return v; } } catch (e) { }
    return memFallback;
  }
  function setRaw(v) {
    try { var s = ls(); if (s) { s.setItem(C.SAVE_KEY, v); return true; } } catch (e) { }
    memFallback = v; return false;
  }
  function delRaw() {
    try { var s = ls(); if (s) s.removeItem(C.SAVE_KEY); } catch (e) { }
    memFallback = null;
  }

  /* 数值を安全に整数へ。型不正は default を返す。 */
  function num(v, min, max, def) {
    var n;
    if (typeof v === 'number') n = v;
    else if (typeof v === 'string' && v.trim() !== '') n = Number(v);
    else return def;
    if (!isFinite(n)) return def;
    n = Math.floor(n);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function sanitize(raw) {
    var L = AF.LOGIC, base = L.baseUpgrades();
    if (!raw || typeof raw !== 'object') raw = {};
    var res = (raw.res && typeof raw.res === 'object') ? raw.res : {};
    var upg = (raw.upgrades && typeof raw.upgrades === 'object') ? raw.upgrades : {};
    var out = {
      v: 1,
      stage: num(raw.stage, 1, MAX_STAGE, 1),
      res: { fe: num(res.fe, 0, MAX_RES, 0), cr: num(res.cr, 0, MAX_RES, 0) },
      upgrades: {},
      highScore: num(raw.highScore, 0, 1e9, 0),
      deaths: num(raw.deaths, 0, 1e6, 0),
      muted: !!raw.muted,
      padLayout: raw.padLayout === 'switch' ? 'switch' : 'xbox',
      wpnMode: raw.wpnMode === 'laser' ? 'laser' : 'vulcan',
      ts: num(raw.ts, 0, 1e12, 0)
    };
    for (var i = 0; i < L.RECIPES.length; i++) {
      var r = L.RECIPES[i];
      out.upgrades[r.id] = num(upg[r.id], 0, r.max, base[r.id]);
    }
    return out;
  }

  function load() {
    var raw = getRaw();
    if (raw == null) return sanitize(null);
    try { return sanitize(JSON.parse(raw)); } catch (e) { return sanitize(null); }
  }
  function save(state) {
    try { setRaw(JSON.stringify(sanitize(state))); return true; } catch (e) { return false; }
  }
  function hasSave() {
    var s = load();
    return s.stage > 1 || s.res.fe > 0 || s.res.cr > 0 || s.highScore > 0;
  }
  function clear() { delRaw(); }
  function getPadLayout() {
    var s = load();
    return s.padLayout || 'xbox';
  }
  function setPadLayout(layout) {
    var s = load();
    s.padLayout = layout === 'switch' ? 'switch' : 'xbox';
    save(s);
    return s.padLayout;
  }
  function getWpnMode() {
    var s = load();
    return s.wpnMode || 'vulcan';
  }
  function setWpnMode(mode) {
    var s = load();
    s.wpnMode = mode === 'laser' ? 'laser' : 'vulcan';
    save(s);
    return s.wpnMode;
  }

  AF.Save = {
    load: load, save: save, hasSave: hasSave, clear: clear, sanitize: sanitize,
    getPadLayout: getPadLayout, setPadLayout: setPadLayout,
    getWpnMode: getWpnMode, setWpnMode: setWpnMode
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
