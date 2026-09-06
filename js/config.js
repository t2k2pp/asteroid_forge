/* ASTEROID FORGE — 全チューニング値 (このファイルだけでバランス変更できる) */
(function (root) {
  root.AF = root.AF || {};

  var CFG = {
    VERSION: '1.0.0',
    SAVE_KEY: 'af_save_v1',

    arena: { w: 132, d: 132 },           // XZ プレーン (halfW/halfD は起動時に算出)
    camera: { fov: 52, pos: [0, 94, 78], look: [0, 0, -4] },

    ship: {
      turnBase: 4.0,        // rad/s (エンジン Lv で倍率)
      thrustBase: 36,       // u/s^2
      drag: 0.45,           // 速度比例の減衰 (現代的な操作性のため微減衰)
      maxSpeed: 46,         // u/s
      radius: 2.4,          // 衝突判定半径
      hpBase: 2,            // 船体 Lv1 の HP
      respawnInvuln: 3.0    // 復活直後の無敵時間 (s)
    },

    bullet: { speed: 86, life: 1.15, radius: 0.9, inheritMul: 0.25 },

    rock: {
      radii: [6.2, 3.4, 1.9],   // idx0=大 1=中 2=小
      score: [20, 50, 100],     // 原作と同じ点数比 (大が安い)
      spd: [6.5, 10.5, 14.5],   // 基本速度
      hpBase: [2, 1, 1],        // ステージ追加HP前の基礎HP
      yJitter: 1.6              // 配置時の Y 揺らぎ (みせかけの奥行き)
    },

    magnetBase: 8.5,            // 資源吸着半径 (エンジン Lv で拡張)
    pickup: { radius: 1.0, collectDist: 2.6, accel: 260, maxSpeed: 70, cap: 90 },

    raider: {                   // ステージ3以上で出現するレイド機 (円盤オマージュ)
      radius: 2.6, hp: 3, fireEvery: 1.6, bulletSpeed: 30,
      score: 150, keepDist: 30, spawnEvery: 7
    },

    combo: { window: 2.5, step: 0.25, max: 3 },   // コンボ倍率 +0.25/件 ×3上限
    shieldGrace: 3.2,                              // 被弾後にシールド再生を再開するまでの待ち (s)

    colors: {
      bg: 0x04060d, ship: 0x59f7ff, shipFill: 0x0d4a56, thruster: 0xffa63c,
      bulletP: 0xfff2a8, bulletR: 0xff8adf,
      rock: 0x9aa5c8, geode: 0x4fffd0,
      raider: 0xff5ad2,
      pickFe: 0xffb347, pickCr: 0x53e8ff,
      warp: 0x7df9ff, grid: 0x11384a, bound: 0x2ad6c8, star: 0xcfe6ff
    }
  };

  CFG.arena.halfW = CFG.arena.w / 2;
  CFG.arena.halfD = CFG.arena.d / 2;

  root.AF.CFG = CFG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
