/* ASTEROID FORGE — 純ロジック & 永続化の単体テスト
 * 実行: node tests/run-tests.mjs   (対象: js/config.js, js/logic.js, js/storage.js) */
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---- node 側に localStorage スタブを供給し、対象ファイルを同一コンテキストで評価 ---- */
const store = new Map();
const sandbox = {
  console,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  }
};
const ctx = createContext(sandbox);
for (const f of ['js/config.js', 'js/logic.js', 'js/storage.js']) {
  runInContext(readFileSync(path.join(rootDir, f), 'utf8'), ctx, { filename: f });
}
const AF = ctx.AF;
const C = AF.CFG, L = AF.LOGIC, S = AF.Save;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

console.log('\n== ASTEROID FORGE unit tests ==\n');

/* ---------- config 整合性 ---------- */
test('CFG: arena halfW/halfD が w/d の半分', () => {
  assert.equal(C.arena.halfW, C.arena.w / 2);
  assert.equal(C.arena.halfD, C.arena.d / 2);
});

/* ---------- 武器バランスの単調性 ---------- */
test('weaponStats: Lv が上がるほど連射は速く・弾数/威力は減らない', () => {
  let prev = L.weaponStats(1);
  for (let lv = 2; lv <= 5; lv++) {
    const w = L.weaponStats(lv);
    assert.ok(w.cd <= prev.cd, `Lv${lv} の連射間隔が悪化 (${prev.cd} → ${w.cd})`);
    assert.ok(w.dmg >= prev.dmg, `Lv${lv} で威力低下`);
    assert.ok(w.shots >= prev.shots, `Lv${lv} で弾数減少`);
    assert.ok(w.cd * w.dmg < 1.5, 'DPS が異常');
    prev = w;
  }
  assert.equal(L.weaponStats(99).name, 'Mk V', 'Lv上限クランプ');
  assert.equal(L.weaponStats(0).name, 'Mk I', 'Lv下限クランプ');
});

/* ---------- エンジン ---------- */
test('engineStats: 旋回/推力/磁石が Lv で単調増加', () => {
  let e1 = L.engineStats(1);
  assert.equal(e1.turnMul, 1);
  assert.equal(Math.round(e1.magnet * 10) / 10, C.magnetBase);
  for (let lv = 2; lv <= 4; lv++) {
    const e = L.engineStats(lv);
    assert.ok(e.turnMul > e1.turnMul && e.thrustMul > e1.thrustMul && e.speedMul > e1.speedMul && e.magnet > e1.magnet);
    e1 = e;
  }
});

/* ---------- クラフト原価 ---------- */
test('costFor: 全レシピでコストが上昇し、MAX 超は null', () => {
  for (const r of L.RECIPES) {
    let prevFe = -1, prevCr = -1;
    for (let t = r.start + 1; t <= r.max; t++) {
      const c = L.costFor(r.id, t);
      assert.ok(c && c.fe > prevFe && c.cr >= prevCr, `${r.id} Lv${t} のコスト設計 ${JSON.stringify(c)}`);
      prevFe = c.fe; prevCr = c.cr;
    }
    assert.equal(L.costFor(r.id, r.max + 1), null);
  }
  assert.equal(L.costFor('bogus', 1), null);
  assert.equal(L.costFor('weapon', 0), null);
});

test('canAfford: 境界 (ちょうど所持 = true / 1不足 = false)', () => {
  const cost = L.costFor('weapon', 2);
  assert.equal(L.canAfford({ fe: cost.fe, cr: cost.cr }, cost), true);
  assert.equal(L.canAfford({ fe: cost.fe - 1, cr: cost.cr + 99 }, cost), false);
});

/* ---------- ステージスケーリング ---------- */
test('stagePlan: 隕石数は単調非減少で上限12・速度に上限', () => {
  let prev = 0;
  for (let n = 1; n <= 30; n++) {
    const p = L.stagePlan(n);
    assert.ok(p.rocks >= prev && p.rocks >= 4 && p.rocks <= 12, `stage${n} rocks=${p.rocks}`);
    assert.ok(p.speedMul >= 1 && p.speedMul <= 1.85);
    assert.ok(p.geodeChance >= 0.12 && p.geodeChance <= 0.30);
    prev = p.rocks;
  }
});

test('stagePlan: レイド機は stage3 から出現し同時数 4 上限 / HPボーナスは 3 帯ごと', () => {
  assert.equal(L.stagePlan(1).raiders, 0);
  assert.equal(L.stagePlan(2).raiders, 0);
  assert.equal(L.stagePlan(3).raiders, 1);
  assert.ok(L.stagePlan(99).raiders <= 4 && L.stagePlan(99).raiders >= 4);
  assert.equal(L.stagePlan(1).hpBonus, 0);
  assert.equal(L.stagePlan(4).hpBonus, 1);
  assert.equal(L.stagePlan(7).hpBonus, 2);
});

/* ---------- コンボ / ドローン / シールド / 船体 ---------- */
test('comboMult: 1件=×1, +0.25/件, ×3 上限', () => {
  assert.equal(L.comboMult(1), 1);
  assert.equal(Math.round(L.comboMult(2) * 100) / 100, 1.25);
  assert.equal(L.comboMult(999), C.combo.max);
  assert.equal(L.comboMult(0), 1);
});

test('drone: Lv0=無効, Lv↑で頻度増・収量増, Cr は Lv3 のみ', () => {
  assert.equal(L.droneInterval(0), null);
  const i1 = L.droneInterval(1), i2 = L.droneInterval(2), i3 = L.droneInterval(3);
  assert.ok(i1 > i2 && i2 > i3 && i3 >= 10, `${i1},${i2},${i3}`);
  assert.equal(L.droneYield(1).cr, 0);
  assert.ok(L.droneYield(3).cr > 0);
  assert.ok(L.droneYield(3).fe > L.droneYield(1).fe);
});

test('shieldCap/regen, hullHp: Lv スケール', () => {
  assert.equal(L.shieldCap(0), 0);
  assert.equal(L.shieldCap(1), 2);
  assert.equal(L.shieldCap(3), 6);
  assert.ok(L.shieldRegen(3) > L.shieldRegen(1) > 0);
  assert.equal(L.hullHp(1), C.ship.hpBase);
  assert.equal(L.hullHp(4), C.ship.hpBase + 3);
});

test('stageBonus: 正でステージと共に増加', () => {
  const a = L.stageBonus(1), b = L.stageBonus(5);
  assert.ok(a.fe > 0 && a.cr > 0 && b.fe > a.fe && b.cr > a.cr);
});

/* ---------- 永続化 ---------- */
test('Save: 初期状態は安全なデフォルト / hasSave=false', () => {
  const s = S.load();
  assert.equal(s.stage, 1);
  assert.equal(s.res.fe, 0);
  assert.equal(s.res.cr, 0);
  assert.equal(s.upgrades.weapon, 1);
  assert.equal(s.upgrades.engine, 1);
  assert.equal(s.upgrades.shield, 0);
  assert.equal(s.upgrades.hull, 1);
  assert.equal(s.upgrades.drone, 0);
  assert.equal(S.hasSave(), false);
});

test('Save: save→load ラウンドトリップ & hasSave=true', () => {
  const state = {
    stage: 7, res: { fe: 120, cr: 34 },
    upgrades: { weapon: 3, engine: 2, shield: 1, hull: 2, drone: 1 },
    highScore: 58120, deaths: 3, muted: true
  };
  assert.equal(S.save(state), true);
  const s = S.load();
  assert.equal(s.stage, 7);
  assert.equal(s.res.fe, 120);
  assert.equal(s.res.cr, 34);
  assert.equal(s.upgrades.weapon, 3);
  assert.equal(s.upgrades.engine, 2);
  assert.equal(s.upgrades.shield, 1);
  assert.equal(s.upgrades.hull, 2);
  assert.equal(s.upgrades.drone, 1);
  assert.equal(s.highScore, 58120);
  assert.equal(s.muted, true);
  assert.equal(S.hasSave(), true);
});

test('Save: 破損 JSON でもデフォルトに復帰しクラッシュしない', () => {
  store.set(C.SAVE_KEY, '{"stage": ??broken');
  const s = S.load();
  assert.equal(s.stage, 1);
  assert.equal(s.res.fe, 0);
});

test('Save: サニタイズ (負値/型異常/範囲外/未知キーを弾く)', () => {
  const evil = {
    stage: -5, res: { fe: 'x', cr: 99999 },
    upgrades: { weapon: 99, shield: -3, bogus: 77 },
    highScore: -9, deaths: null, muted: 'yes'
  };
  const s = S.sanitize(evil);
  assert.equal(s.stage, 1);
  assert.equal(s.res.fe, 0);
  assert.equal(s.res.cr, 9999);          // 上限クランプ
  assert.equal(s.upgrades.weapon, 5);    // レシピ max クランプ
  assert.equal(s.upgrades.shield, 0);
  assert.equal(s.upgrades.bogus, undefined);
  assert.equal(s.highScore, 0);
  assert.equal(typeof s.muted, 'boolean');
});

test('Save: clear 後にデフォルトへ', () => {
  S.clear();
  assert.equal(S.hasSave(), false);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail > 0 ? 1 : 0;
