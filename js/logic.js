/* ASTEROID FORGE — 純ロジック (DOM / THREE 非依存 = node で単体テスト可能)
 * クラフトレシピ、アップグレード効果表、ステージスケーリング、コンボ計算。 */
(function (root) {
  root.AF = root.AF || {};
  var C = root.AF.CFG;

  function clampi(v, a, b) { v = Math.floor(Number(v)); if (isNaN(v)) v = a; return v < a ? a : (v > b ? b : v); }
  function fmt(n, d) { return Number(n).toFixed(d); }

  /* ---- 武器テーブル (Lv1..5) ------------------------------------------- */
  var WEAPONS = [
    null,
    { cd: 0.30, dmg: 1, shots: 1, spread: 0.00, name: 'Mk I' },
    { cd: 0.24, dmg: 1, shots: 2, spread: 0.07, name: 'Mk II' },
    { cd: 0.24, dmg: 2, shots: 2, spread: 0.07, name: 'Mk III' },
    { cd: 0.18, dmg: 2, shots: 3, spread: 0.11, name: 'Mk IV' },
    { cd: 0.13, dmg: 2, shots: 3, spread: 0.16, name: 'Mk V' }
  ];

  /* costs[対象Lv] = 次の Lv に上げるコスト。未取得スロットは index0 起点。 */
  var RECIPES = [
    {
      id: 'weapon', name: 'レーザー砲', max: 5, start: 1,
      costs: [null, null, { fe: 35, cr: 8 }, { fe: 70, cr: 22 }, { fe: 120, cr: 44 }, { fe: 190, cr: 75 }],
      effect: function (l) {
        return ['単発・連射0.30s', '2連発・連射0.24s', '2連発×威力2・連射0.24s', '3連発×威力2・連射0.18s', '広角3連発×威力2・連射0.13s'][clampi(l, 1, 5) - 1];
      }
    },
    {
      id: 'engine', name: 'エンジン', max: 4, start: 1,
      costs: [null, null, { fe: 30, cr: 6 }, { fe: 60, cr: 18 }, { fe: 110, cr: 38 }],
      effect: function (l) { return '旋回/推力+' + Math.round(16 * (clampi(l, 1, 4) - 1)) + '%・磁石' + fmt(magnet(l), 1) + 'u'; }
    },
    {
      id: 'shield', name: 'シールド', max: 3, start: 0,
      costs: [null, { fe: 40, cr: 12 }, { fe: 85, cr: 32 }, { fe: 150, cr: 60 }],
      effect: function (l) { return l <= 0 ? '未搭載' : '容量' + shieldCap(l) + '・再生' + fmt(shieldRegen(l), 2) + '/s'; }
    },
    {
      id: 'hull', name: '船体装甲', max: 4, start: 1,
      costs: [null, null, { fe: 45, cr: 10 }, { fe: 95, cr: 26 }, { fe: 165, cr: 52 }],
      effect: function (l) { return 'HP' + hullHp(l); }
    },
    {
      id: 'drone', name: '採掘ドローン', max: 3, start: 0,
      costs: [null, { fe: 30, cr: 20 }, { fe: 70, cr: 45 }, { fe: 130, cr: 85 }],
      effect: function (l) {
        if (l <= 0) return '未搭載';
        var y = droneYield(l);
        return 'Fe+' + y.fe + (y.cr ? ' Cr+' + y.cr : '') + '/' + Math.round(droneInterval(l)) + '秒';
      }
    }
  ];

  /* ---- ステータス導出 ---------------------------------------------------- */
  function weaponStats(l) { var w = WEAPONS[clampi(l, 1, 5)]; return { cd: w.cd, dmg: w.dmg, shots: w.shots, spread: w.spread, name: w.name }; }
  function magnet(l) { return C.magnetBase + 5.5 * (clampi(l, 1, 4) - 1); }
  function engineStats(l) { l = clampi(l, 1, 4); return { turnMul: 1 + 0.16 * (l - 1), thrustMul: 1 + 0.16 * (l - 1), speedMul: 1 + 0.10 * (l - 1), magnet: magnet(l) }; }
  function shieldCap(l) { return l <= 0 ? 0 : 2 * clampi(l, 0, 3); }
  function shieldRegen(l) { return l <= 0 ? 0 : 0.5 + 0.22 * l; }
  function hullHp(l) { return C.ship.hpBase + (clampi(l, 1, 4) - 1); }
  function droneInterval(l) { return l <= 0 ? null : Math.max(34 - 8 * clampi(l, 0, 3), 10); }
  function droneYield(l) { return l <= 0 ? { fe: 0, cr: 0 } : { fe: 5 + 3 * l, cr: l >= 3 ? 2 : 0 }; }

  /* ---- ステージスケーリング --------------------------------------------- */
  function stagePlan(n) {
    n = Math.max(1, Math.floor(Number(n)) || 1);
    return {
      rocks: Math.min(3 + Math.ceil(0.9 * n), 12),
      speedMul: Math.min(1 + 0.045 * (n - 1), 1.85),
      hpBonus: Math.floor((n - 1) / 3),
      raiders: n < 3 ? 0 : Math.min(1 + Math.floor((n - 3) / 2), 4),
      geodeChance: Math.min(0.12 + 0.02 * n, 0.30)
    };
  }

  function comboMult(chain) {
    if (!(chain > 1)) return 1;
    return Math.min(1 + C.combo.step * (chain - 1), C.combo.max);
  }
  function stageBonus(n) { n = Math.max(1, Math.floor(Number(n)) || 1); return { fe: 8 + 2 * n, cr: 3 + n }; }

  /* ---- クラフト補助 ------------------------------------------------------ */
  function recipeById(id) { for (var i = 0; i < RECIPES.length; i++) if (RECIPES[i].id === id) return RECIPES[i]; return null; }
  function baseUpgrades() { return { weapon: 1, engine: 1, shield: 0, hull: 1, drone: 0 }; }
  function costFor(id, nextLevel) {
    var r = recipeById(id);
    if (!r || !(nextLevel >= 1) || nextLevel > r.max) return null;
    var c = r.costs[nextLevel];
    return c ? { fe: c.fe, cr: c.cr } : null;
  }
  function canAfford(res, cost) { return !!cost && res.fe >= cost.fe && res.cr >= cost.cr; }

  root.AF.LOGIC = {
    RECIPES: RECIPES, WEAPONS: WEAPONS,
    weaponStats: weaponStats, engineStats: engineStats, magnet: magnet,
    shieldCap: shieldCap, shieldRegen: shieldRegen, hullHp: hullHp,
    droneInterval: droneInterval, droneYield: droneYield,
    stagePlan: stagePlan, comboMult: comboMult, stageBonus: stageBonus,
    recipeById: recipeById, baseUpgrades: baseUpgrades,
    costFor: costFor, canAfford: canAfford, clampi: clampi
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
