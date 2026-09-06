/* ASTEROID FORGE — ブート & キー入力ルーティング */
(function (root) {
  var AF = root.AF;
  var PREVENT = { Space: 1, Tab: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };

  function fatal(e) {
    try { console.error('[ASTEROID FORGE] boot failed:', e); } catch (_) { }
    var d = document.createElement('div');
    d.id = 'fatal';
    d.textContent = '起動に失敗しました: ' + (e && e.message ? e.message : String(e));
    document.body.appendChild(d);
  }

  function boot() {
    try {
      if (!root.THREE) throw new Error('three.min.js が読み込めませんでした');
      if (!AF || !AF.CFG) throw new Error('ゲームライブラリの読み込みに失敗しました');
      AF.Game.init(document.getElementById('scene'));
    } catch (e) {
      fatal(e);
      return;
    }

    // AudioContext は最初のジェスチャで遅延初期化 (自動再生ポリシー対策)
    var armed = false;
    function arm() { if (armed) return; armed = true; try { AF.SFX.init(); } catch (e) { } }

    root.addEventListener('keydown', function (e) {
      if (PREVENT[e.code]) e.preventDefault();
      arm();
      AF.Game.onKey(e.code, true);
    });
    root.addEventListener('keyup', function (e) { AF.Game.onKey(e.code, false); });
    root.addEventListener('pointerdown', arm);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
