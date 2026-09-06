/* ASTEROID FORGE — DOM UI (HUD / タイトル / クラフトパネル / オーバーレイ) */
(function (root) {
  var AF = root.AF, L = AF.LOGIC;

  function $(id) { return document.getElementById(id); }

  var els = {};
  var bannerTimer = null, toastTimer = null;
  var _cache = {};
  var cbs = {};

  function init(callbacks) {
    cbs = callbacks || {};
    ['hud', 'hScore', 'hBest', 'hStage', 'hLives', 'hFe', 'hCr', 'hWpn', 'hMute',
      'hpPips', 'shieldWrap', 'shieldFill', 'comboTag',
      'banner', 'bTitle', 'bSub', 'toast',
      'scrTitle', 'scrPause', 'scrCraft', 'scrOver',
      'btnContinue', 'btnNew', 'titleMeta',
      'btnResume', 'btnRetry', 'btnTitle',
      'btnCraftHud', 'btnCraftClose',
      'craftList', 'craftFe', 'craftCr',
      'ovScore', 'ovBest', 'ovStage', 'ovDeaths'
    ].forEach(function (id) { els[id] = $(id); });

    if (els.btnContinue) els.btnContinue.addEventListener('click', function () { cbs.continueRun && cbs.continueRun(); });
    if (els.btnNew) els.btnNew.addEventListener('click', function () { cbs.newRun && cbs.newRun(); });
    if (els.btnResume) els.btnResume.addEventListener('click', function () { cbs.resume && cbs.resume(); });
    if (els.btnRetry) els.btnRetry.addEventListener('click', function () { cbs.retry && cbs.retry(); });
    if (els.btnTitle) els.btnTitle.addEventListener('click', function () { cbs.toTitle && cbs.toTitle(); });
    if (els.btnCraftHud) els.btnCraftHud.addEventListener('click', function () { cbs.craftToggle && cbs.craftToggle(); });
    if (els.btnCraftClose) els.btnCraftClose.addEventListener('click', function () { cbs.closeCraft && cbs.closeCraft(); });

    // クラフト行はクリック委譲 (再描画に耐える)
    if (els.craftList) els.craftList.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-id]') : null;
      if (b && !b.disabled && b.dataset.id) cbs.craft && cbs.craft(b.dataset.id);
    });
  }

  function setScreen(name) {
    var map = { title: 'scrTitle', pause: 'scrPause', craft: 'scrCraft', over: 'scrOver' };
    Object.keys(map).forEach(function (k) {
      if (els[map[k]]) els[map[k]].classList.toggle('show', k === name);
    });
    if (els.hud) els.hud.classList.toggle('hidden', name === 'title');
  }

  function fillTitle(save) {
    var can = AF.Save.hasSave();
    if (els.btnContinue) els.btnContinue.style.display = can ? '' : 'none';
    if (els.titleMeta) {
      els.titleMeta.textContent = can
        ? '第 ' + save.stage + ' の帯 / Fe ' + save.res.fe + ' · Cr ' + save.res.cr + ' / ベスト ' + fmtN(save.highScore)
        : '新規パイロット登録 — すべての帯が未開拓';
    }
  }

  function fmtN(n) { return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function setText(id, v) {
    if (_cache[id] === v) return;
    _cache[id] = v;
    if (els[id]) els[id].textContent = v;
  }

  function hud(s) {
    setText('hScore', fmtN(s.score));
    setText('hBest', 'BEST ' + fmtN(Math.max(s.best, s.score)));
    setText('hStage', 'STAGE ' + s.stage);
    var lives = '';
    for (var i = 0; i < Math.max(0, s.lives); i++) lives += '♥';
    setText('hLives', lives || '—');
    setText('hFe', String(s.res.fe));
    setText('hCr', String(s.res.cr));
    setText('hWpn', s.wpnName + ' / E' + s.engineLv);
    if (els.hMute) els.hMute.style.display = s.muted ? '' : 'none';

    // HP ピップ
    var hpKey = 'hp:' + s.hp + '/' + s.maxHp;
    if (_cache.hp !== hpKey) {
      _cache.hp = hpKey;
      if (els.hpPips) {
        var html = '';
        for (var j = 0; j < s.maxHp; j++) html += '<span class="pip' + (j < s.hp ? ' on' : '') + '"></span>';
        els.hpPips.innerHTML = html;
      }
    }
    if (els.shieldWrap) {
      var showSh = s.maxShield > 0;
      els.shieldWrap.style.display = showSh ? '' : 'none';
      if (showSh) els.shieldFill.style.width = Math.round(100 * Math.max(0, s.shield) / s.maxShield) + '%';
    }
    var comboOn = s.comboMult > 1.02;
    if (els.comboTag) {
      els.comboTag.style.display = comboOn ? '' : 'none';
      if (comboOn) els.comboTag.textContent = '×' + s.comboMult.toFixed(2);
    }
  }

  function banner(title, sub, ms) {
    if (!els.banner) return;
    els.bTitle.textContent = title || '';
    els.bSub.textContent = sub || '';
    els.banner.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { els.banner.classList.remove('show'); }, ms || 2000);
  }

  function toast(msg) {
    if (!els.toast) return;
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 1300);
  }

  function craftPanel(s) {
    if (!els.craftList) return;
    if (els.craftFe) els.craftFe.textContent = s.res.fe;
    if (els.craftCr) els.craftCr.textContent = s.res.cr;
    var html = '';
    L.RECIPES.forEach(function (r, idx) {
      var lv = s.upgrades[r.id] || 0;
      var cur = r.effect(lv);
      var maxed = lv >= r.max;
      var next = maxed ? null : r.effect(lv + 1);
      var cost = maxed ? null : L.costFor(r.id, lv + 1);
      var afford = cost && L.canAfford(s.res, cost);
      html += '<div class="craftRow' + (maxed ? ' maxed' : (afford ? '' : ' poor')) + '">'
        + '<div class="crIdx">[' + (idx + 1) + ']</div>'
        + '<div class="crMain"><div class="crName">' + r.name + ' <span class="crLv">Lv' + lv + '/' + r.max + '</span></div>'
        + '<div class="crEff">' + cur + (maxed ? '' : ' → <b>' + next + '</b>') + '</div></div>'
        + '<div class="crBuy">'
        + (maxed
          ? '<span class="crDone">MAX</span>'
          : '<button data-id="' + r.id + '"' + (afford ? '' : ' disabled') + '>Fe ' + cost.fe + '<br>Cr ' + cost.cr + '</button>')
        + '</div></div>';
    });
    els.craftList.innerHTML = html;
  }

  function overPanel(s) {
    if (els.ovScore) els.ovScore.textContent = fmtN(s.score);
    if (els.ovBest) els.ovBest.textContent = fmtN(s.best);
    if (els.ovStage) els.ovStage.textContent = '第 ' + s.stage + ' の帯';
    if (els.ovDeaths) els.ovDeaths.textContent = String(s.deaths);
  }

  root.AF.UI = { init: init, setScreen: setScreen, fillTitle: fillTitle, hud: hud, banner: banner, toast: toast, craftPanel: craftPanel, overPanel: overPanel };
})(typeof globalThis !== 'undefined' ? globalThis : this);
