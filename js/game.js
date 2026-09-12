/* ASTEROID FORGE — ゲーム本体 (状態機械 / ループ / 湧き / 衝突 / クラフト適用 / セーブ) */
(function (root) {
  var AF = root.AF, C = AF.CFG, L = AF.LOGIC, S = AF.Save, UI = AF.UI, SFX = AF.SFX;
  var T = root.THREE;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  var G = {
    state: 'boot', time: 0, last: 0,
    save: null, stage: 1, score: 0, lives: 3,
    res: { fe: 0, cr: 0 }, upg: L.baseUpgrades(), wpnMode: 'vulcan',
    hp: 2, shield: 0, shieldT: 0, shipDead: false, respawnT: -1, invuln: 0,
    fireCd: 0, chain: 0, chainT: 0, clearT: -1, droneT: 0, shakeT: 0,
    raidersQueue: 0, raiderT: 0, plan: null,
    rocks: [], bullets: [], pickups: [], raiders: [], options: [], trailHistory: [],
    input: { rot: 0, thrust: false, fire: false }, keys: {},
    padLayout: 'xbox', padConnected: false, padPrevButtons: {}, padPrevAxes: {}, craftCursor: 0,
    pointer: { active: false, screenX: 0, screenY: 0, worldX: 0, worldZ: 0, inside: true, justDown: false },
    renderer: null, scene: null, camera: null, ship: null, fx: null, stars: null,
    camBase: null
  };

  /* ================= 初期化 ================= */
  function init(host) {
    G.renderer = new T.WebGLRenderer({ antialias: true });
    G.renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    G.renderer.setSize(root.innerWidth, root.innerHeight);
    host.appendChild(G.renderer.domElement);

    G.scene = new T.Scene();
    G.scene.background = new T.Color(C.colors.bg);
    G.scene.fog = new T.FogExp2(C.colors.bg, 0.0035);

    var cp = C.camera.pos;
    G.camera = new T.PerspectiveCamera(C.camera.fov, root.innerWidth / root.innerHeight, 0.1, 1200);
    G.camBase = new T.Vector3(cp[0], cp[1], cp[2]);
    updateCamera();

    G.stars = AF.world.buildStars(); G.scene.add(G.stars);
    G.scene.add(AF.world.buildNebula());
    G.scene.add(AF.world.buildFloor());

    G.ship = new AF.Ship(G.scene);
    G.fx = new AF.FXManager(G.scene);
    for (var i = 0; i < 70; i++) G.bullets.push(new AF.Bullet(G.scene));
    for (var oi = 0; oi < 3; oi++) G.options.push(new AF.OptionDrone(G.scene, oi));

    UI.init({
      continueRun: function () { start(false); },
      newRun: function () { start(true); },
      resume: function () { setPaused(false); },
      craft: function (id) { craft(id); },
      retry: function () { if (G.state === 'over') { UI.setScreen(null); runFrom(G.save); } },
      toTitle: function () { toTitle(); },
      craftToggle: function () { craftPanelOpen(); },
      closeCraft: function () { if (G.state === 'craft') { G.state = 'play'; UI.setScreen(null); } },
      togglePadLayout: function () { return togglePadLayout(); }
    });

    G.save = S.load();
    G.padLayout = (G.save && G.save.padLayout) ? G.save.padLayout : S.getPadLayout();

    root.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && G.state === 'play') setPaused(true);
    });
    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);

    SFX.setMuted(G.save.muted);
    UI.fillTitle(G.save);
    UI.setScreen('title');
    spawnAmbient();
    G.state = 'title';

    G.last = 0;
    G.renderer.setAnimationLoop(frame);
  }

  function updateCamera() {
    if (!G.camera) return;
    var w = root.innerWidth, h = root.innerHeight;
    var aspect = w / h;
    G.camera.aspect = aspect;

    // 画面が縦長 (aspect < 1.42) の場合、視野角の狭まりに合わせて注視点からカメラ距離を自動調整
    // 手前角を含めたアリーナ全境界 (132x132) が自然に画面内に収まる
    var baseAspect = 1.42;
    var zoomScale = Math.max(1.0, baseAspect / aspect);

    var cp = C.camera.pos;
    var look = C.camera.look;
    G.camBase.x = look[0] + (cp[0] - look[0]) * zoomScale;
    G.camBase.y = look[1] + (cp[1] - look[1]) * zoomScale;
    G.camBase.z = look[2] + (cp[2] - look[2]) * zoomScale;

    if (G.shakeT <= 0) {
      G.camera.position.copy(G.camBase);
    }
    G.camera.lookAt(new T.Vector3(look[0], look[1], look[2]));
    G.camera.updateProjectionMatrix();
  }

  function onResize() {
    updateCamera();
    G.renderer.setSize(root.innerWidth, root.innerHeight);
  }

  /* ================= マウス / タッチ (Pointer Events) ================= */
  var _raycaster = new T.Raycaster();
  var _arenaPlane = new T.Plane(new T.Vector3(0, 1, 0), -1); // Y = 1 平面 (自機飛行平面)
  var _tmpVec = new T.Vector3();

  function screenToWorldXZ(clientX, clientY, out) {
    if (!G.camera) return null;
    var target = out || _tmpVec;
    var ndcX = (clientX / root.innerWidth) * 2 - 1;
    var ndcY = -(clientY / root.innerHeight) * 2 + 1;
    _raycaster.setFromCamera({ x: ndcX, y: ndcY }, G.camera);
    if (_raycaster.ray.intersectPlane(_arenaPlane, target)) {
      return target;
    }
    return null;
  }

  function isInsideArena(worldPos) {
    if (!worldPos) return false;
    return Math.abs(worldPos.x) <= C.arena.halfW && Math.abs(worldPos.z) <= C.arena.halfD;
  }

  /* ================= オプション (グラディウス風追従支援機) ================= */
  function updateOptionDrones(dt, tSec) {
    if (!G.ship || !G.ship.group || !G.options) return;
    var shipPos = G.ship.group.position;
    var count = L.optionCount(G.upg.option || 0);

    if (G.shipDead || count <= 0) {
      for (var k = 0; k < G.options.length; k++) {
        G.options[k].active = false;
        G.options[k].mesh.visible = false;
      }
      return;
    }

    if (!G.trailHistory || G.trailHistory.length === 0) {
      G.trailHistory = [];
      for (var h = 0; h < 60; h++) {
        G.trailHistory.push({ x: shipPos.x, z: shipPos.z, heading: G.ship.heading });
      }
    }

    var lastPt = G.trailHistory[0];
    var dx = shipPos.x - lastPt.x, dz = shipPos.z - lastPt.z;
    var dMoved = Math.sqrt(dx * dx + dz * dz);
    if (dMoved > 0.3) {
      if (dMoved > 20) {
        var shiftX = shipPos.x - lastPt.x;
        var shiftZ = shipPos.z - lastPt.z;
        for (var m = 0; m < G.trailHistory.length; m++) {
          G.trailHistory[m].x += shiftX;
          G.trailHistory[m].z += shiftZ;
          wrapPos(G.trailHistory[m], 0);
        }
      }
      G.trailHistory.unshift({ x: shipPos.x, z: shipPos.z, heading: G.ship.heading });
      if (G.trailHistory.length > 60) G.trailHistory.pop();
    } else {
      lastPt.heading = G.ship.heading;
    }

    var spacing = 12;
    for (var i = 0; i < G.options.length; i++) {
      var opt = G.options[i];
      if (i < count) {
        opt.active = true;
        var idx = Math.min((i + 1) * spacing, G.trailHistory.length - 1);
        var pt = G.trailHistory[idx] || G.trailHistory[G.trailHistory.length - 1];
        opt.update(pt, pt.heading, tSec);
      } else {
        opt.active = false;
        opt.mesh.visible = false;
      }
    }
  }

  function fireOptionDrones(w) {
    if (!G.options || G.upg.option <= 0) return;
    var count = L.optionCount(G.upg.option || 0);
    for (var o = 0; o < count; o++) {
      var opt = G.options[o];
      if (!opt.active) continue;
      var optPos = opt.mesh.position;
      var ang = opt.heading;
      for (var i = 0; i < w.shots; i++) {
        var bl = acquireBullet();
        if (!bl) break;
        var off = w.shots > 1 ? (i - (w.shots - 1) / 2) * w.spread * 2.4 : 0;
        var finalAng = ang + off;
        var dx = -Math.sin(finalAng), dz = -Math.cos(finalAng);
        var spd = C.bullet.speed * (1 + 0.06 * (G.upg.weapon - 1)) * (w.speedMul || 1.0);
        bl.reset(
          optPos.x + dx * 2.2, optPos.z + dz * 2.2,
          dx * spd + G.ship.vel.x * 0.35,
          dz * spd + G.ship.vel.z * 0.35,
          w.dmg, C.bullet.life, 'p', w.pierce, w.mode
        );
      }
    }
  }

  function tryFireShip() {
    if (!G.ship || G.shipDead || G.clearT >= 0 || G.fireCd > 0) return false;
    var w = L.weaponStats(G.upg.weapon, G.wpnMode);
    var shipPos = G.ship.group.position;
    var fired = false;
    for (var i = 0; i < w.shots; i++) {
      var bl = acquireBullet();
      if (!bl) break;
      var off = w.shots > 1 ? (i - (w.shots - 1) / 2) * w.spread * 2.4 : 0;
      var ang = G.ship.heading + off;
      var dx = -Math.sin(ang), dz = -Math.cos(ang);
      var spd = C.bullet.speed * (1 + 0.06 * (G.upg.weapon - 1)) * (w.speedMul || 1.0);
      bl.reset(
        shipPos.x + dx * 3.4, shipPos.z + dz * 3.4,
        dx * spd + G.ship.vel.x * C.bullet.inheritMul,
        dz * spd + G.ship.vel.z * C.bullet.inheritMul,
        w.dmg, C.bullet.life, 'p', w.pierce, w.mode
      );
      fired = true;
    }
    if (fired) {
      if (typeof fireOptionDrones === 'function') fireOptionDrones(w);
      SFX.play('shoot');
      G.fireCd = w.cd;
    }
    return fired;
  }

  function onPointerDown(e) {
    if (e.target && e.target.closest && e.target.closest('button, details, #toast, .panel')) {
      return;
    }

    if (G.state === 'title') {
      S.hasSave() ? start(false) : start(true);
      return;
    }
    if (G.state === 'over') {
      UI.setScreen(null);
      runFrom(G.save);
      return;
    }
    if (G.state === 'craft') {
      craftPanelOpen();
      return;
    }
    if (G.state === 'pause') {
      setPaused(false);
      return;
    }

    if (G.state === 'play') {
      var hit = screenToWorldXZ(e.clientX, e.clientY, _tmpVec);
      if (!hit || !isInsideArena(hit)) {
        // フィールド外をタップした場合: クラフト画面を開く (Pauseと同じく完全停止)
        craftPanelOpen();
        return;
      }

      G.pointer.active = true;
      G.pointer.screenX = e.clientX;
      G.pointer.screenY = e.clientY;
      G.pointer.worldX = hit.x;
      G.pointer.worldZ = hit.z;
      G.pointer.inside = true;
      G.pointer.justDown = true;
      G.pointer.pendingFire = true;
      G.input.fire = true;

      // タップした方向へ瞬時に旋回
      var pdx = hit.x - G.ship.group.position.x;
      var pdz = hit.z - G.ship.group.position.z;
      if (Math.hypot(pdx, pdz) > 1.2) {
        G.ship.heading = Math.atan2(-pdx, -pdz);
        G.ship.group.rotation.y = G.ship.heading;
      }
      if (tryFireShip()) {
        G.pointer.pendingFire = false;
      }
    }
  }

  function onPointerMove(e) {
    if (!G.pointer.active || G.state !== 'play') return;
    var hit = screenToWorldXZ(e.clientX, e.clientY, _tmpVec);
    if (hit) {
      G.pointer.screenX = e.clientX;
      G.pointer.screenY = e.clientY;
      G.pointer.worldX = hit.x;
      G.pointer.worldZ = hit.z;
      G.pointer.inside = isInsideArena(hit);
    }
  }

  function onPointerUp(e) {
    G.pointer.active = false;
    G.pointer.justDown = false;
    G.pointer.pendingFire = false;
  }

  /* ================= レイヤーライフサイクル ================= */
  function clearField() {
    while (G.rocks.length) removeRock(G.rocks[0]);
    G.bullets.forEach(function (b) { b.kill(); });
    G.pickups.forEach(function (p) { p.active = false; p.mesh.visible = false; });
    G.raiders.forEach(function (r) { r.active = false; r.mesh.visible = false; });
    G.raiders.length = 0;
    if (G.options) G.options.forEach(function (opt) { opt.active = false; opt.mesh.visible = false; });
    G.trailHistory = [];
  }

  function spawnAmbient() {
    clearField();
    for (var i = 0; i < 7; i++) spawnRock(i % 3, false);
  }

  function start(fresh) {
    var oldHigh = G.save ? Math.max(G.save.highScore, 0) : 0;
    var oldDeaths = G.save ? G.save.deaths : 0;
    var muted = SFX.muted();
    if (fresh || !S.hasSave()) {
      G.save = S.sanitize(null);
      G.save.highScore = oldHigh;
      G.save.deaths = oldDeaths;
    } else {
      G.save = S.load();
    }
    G.save.muted = muted;
    runFrom(G.save);
  }

  /* 開発・検証用フラグ: ?debugRes=fe,cr で開始資源 / ?autocraft=1 で出撃時にクラフトパネルを開く */
  function applyDevFlags() {
    try {
      var q = new URLSearchParams(root.location.search);
      G.devCraft = q.has('autocraft');
      var v = q.get('debugRes');
      if (v) {
        var p = String(v).split(',');
        G.res.fe = L.clampi(parseInt(p[0], 10), 0, 9999);
        G.res.cr = L.clampi(parseInt(p[1] || '0', 10), 0, 9999);
      }
    } catch (e) { }
  }

  function runFrom(save) {
    G.stage = Math.max(1, save.stage || 1);
    G.res = save.res;            // 同じオブジェクト参照を持ち回る (death/stage で自動セーブ対象)
    G.upg = save.upgrades;
    G.wpnMode = save.wpnMode || 'vulcan';
    G.score = 0;
    G.lives = 3;
    G.chain = 0; G.chainT = 0; G.fireCd = 0;
    G.clearT = -1; G.shipDead = false; G.respawnT = -1;
    G.plan = L.stagePlan(G.stage);
    G.droneT = L.droneInterval(G.upg.drone) || 20;
    healFull();
    clearField();
    applyDevFlags();
    spawnWave();
    G.ship.reset();
    UI.setScreen(null);
    UI.banner('STAGE ' + G.stage, stageHint(G.stage), 1900);
    SFX.play('click');
    G.state = 'play';
    if (G.devCraft) craftPanelOpen();
  }

  function toTitle() {
    G.save = S.load();
    G.res = G.save.res; G.upg = G.save.upgrades;
    G.wpnMode = G.save.wpnMode || 'vulcan';
    spawnAmbient();
    UI.fillTitle(G.save);
    UI.setScreen('title');
    G.state = 'title';
  }

  function setPaused(p) {
    if (p && G.state === 'play') { G.state = 'pause'; UI.setScreen('pause'); }
    else if (!p && (G.state === 'pause' || G.state === 'craft')) { G.state = 'play'; UI.setScreen(null); }
  }

  function stageHint(n) {
    var hints = [
      '隕石を壊して Fe を採掘しよう',
      '緑色に光るジオード隕石は Cr を落とす',
      'Tab / C キーでクラフトパネル (即時ポーズ)',
      'ステージと資源はブラウザに自動保存される',
      'ステージ 3 以降はレイド機に注意'
    ];
    return hints[(n - 1) % hints.length];
  }

  /* ================= ステージ湧き ================= */
  function spawnWave() {
    G.plan = L.stagePlan(G.stage);
    var n = G.plan.rocks;
    for (var i = 0; i < n; i++) {
      var largeP = Math.min(0.3 + 0.02 * G.stage, 0.6);
      var r = Math.random();
      var size = r < largeP ? 0 : (r < largeP + 0.4 * (1 - largeP / 2) ? 1 : 2);
      spawnRock(size, Math.random() < G.plan.geodeChance);
    }
    G.raidersQueue = G.plan.raiders;
    G.raiderT = rnd(3.5, 6);
  }

  function farSpot(minDist) {
    var sp = G.ship.group.position;
    for (var i = 0; i < 14; i++) {
      var a = rnd(0, Math.PI * 2), d = rnd(minDist, minDist + 28);
      var x = sp.x + Math.cos(a) * d, z = sp.z + Math.sin(a) * d;
      if (Math.abs(x) < C.arena.halfW - 6 && Math.abs(z) < C.arena.halfD - 6) return { x: x, z: z };
    }
    return { x: rnd(-C.arena.halfW + 10, C.arena.halfW - 10), z: rnd(-C.arena.halfD + 10, C.arena.halfD - 10) };
  }

  function spawnRock(size, geode, x, z, velFrom) {
    var hp = C.rock.hpBase[size] + (G.plan ? G.plan.hpBonus : 0);
    var rock = new AF.Rock(G.scene, size, hp, geode, G.plan ? G.plan.speedMul : 0.55);
    var spot = (x != null) ? { x: x, z: z } : farSpot(46);
    rock.mesh.position.x = spot.x;
    rock.mesh.position.z = spot.z;
    if (velFrom) {
      var ang = Math.atan2(velFrom.x, velFrom.z) + rnd(-1.35, 1.35);
      var spd = C.rock.spd[size] * (G.plan ? G.plan.speedMul : 1) * rnd(0.85, 1.25);
      rock.vel.set(Math.sin(ang) * spd, 0, Math.cos(ang) * spd);
    }
    G.rocks.push(rock);
    return rock;
  }

  function removeRock(rock) {
    var i = G.rocks.indexOf(rock);
    if (i >= 0) G.rocks.splice(i, 1);
    G.scene.remove(rock.mesh);
    rock.mesh.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); });
  }

  function spawnRaider() {
    var sp = G.ship.group.position;
    for (var i = 0; i < 12; i++) {
      var a = rnd(0, Math.PI * 2), d = rnd(48, 62);
      var x = Math.max(-C.arena.halfW + 6, Math.min(C.arena.halfW - 6, sp.x + Math.cos(a) * d));
      var z = Math.max(-C.arena.halfD + 6, Math.min(C.arena.halfD - 6, sp.z + Math.sin(a) * d));
      var dx = x - sp.x, dz = z - sp.z;
      if (dx * dx + dz * dz > 35 * 35) {
        var r = new AF.Raider(G.scene);
        r.reset(x, z);
        G.raiders.push(r);
        SFX.play('warp');
        G.fx.ring(r.mesh.position, C.colors.raider, 4, 20, 0.5);
        return;
      }
    }
  }

  /* ================= ゲームパッド入力 (HTML5 Gamepad API) ================= */
  function pollGamepad(dt) {
    var result = { rot: 0, thrust: false, fire: false };
    if (!root.navigator || !root.navigator.getGamepads) return result;
    var pads = root.navigator.getGamepads();
    if (!pads) return result;
    var gp = null;
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    }
    if (!gp) {
      if (G.padConnected) {
        G.padConnected = false;
        UI.toast('🎮 コントローラー切断');
      }
      return result;
    }
    if (!G.padConnected) {
      G.padConnected = true;
      var name = gp.id ? gp.id.replace(/\s*\(.*?\)/, '').slice(0, 20) : 'コントローラー';
      UI.toast('🎮 接続: ' + name);
    }

    var btns = gp.buttons || [];
    var isDown = function (idx) { return !!(btns[idx] && (btns[idx].pressed || btns[idx].value > 0.4)); };
    var justPressed = function (idx) {
      var now = isDown(idx);
      var prev = !!G.padPrevButtons[idx];
      return now && !prev;
    };

    var deadzone = 0.18;
    var ax = (gp.axes && typeof gp.axes[0] === 'number') ? gp.axes[0] : 0;
    var ay = (gp.axes && typeof gp.axes[1] === 'number') ? gp.axes[1] : 0;
    var stickX = Math.abs(ax) > deadzone ? ax : 0;
    var stickY = Math.abs(ay) > deadzone ? ay : 0;

    var prevStickY = G.padPrevAxes.y || 0;
    var stickUpPressed = stickY < -0.5 && prevStickY >= -0.5;
    var stickDownPressed = stickY > 0.5 && prevStickY <= 0.5;

    var layout = G.padLayout || 'xbox';
    var confirmIdx = layout === 'switch' ? 1 : 0; // Switch: A(右) / Xbox: A(下)
    var cancelIdx  = layout === 'switch' ? 0 : 1; // Switch: B(下) / Xbox: B(右)
    var craftIdx   = layout === 'switch' ? 3 : 2; // Switch: X(上) / Xbox: X(左)
    var altCraftIdx = layout === 'switch' ? 2 : 3;

    if (G.state === 'title') {
      if (justPressed(confirmIdx) || justPressed(9) || justPressed(0) || justPressed(1)) {
        S.hasSave() ? start(false) : start(true);
      }
    } else if (G.state === 'over') {
      if (justPressed(confirmIdx) || justPressed(9) || justPressed(0) || justPressed(1)) {
        UI.setScreen(null);
        runFrom(G.save);
      }
    } else if (G.state === 'play') {
      if (justPressed(9)) {
        setPaused(true);
      } else if (justPressed(craftIdx) || justPressed(altCraftIdx) || justPressed(8)) {
        craftPanelOpen();
      }
    } else if (G.state === 'pause') {
      if (justPressed(9) || justPressed(cancelIdx) || justPressed(confirmIdx)) {
        setPaused(false);
      }
    } else if (G.state === 'craft') {
      if (justPressed(cancelIdx) || justPressed(9) || justPressed(craftIdx) || justPressed(8)) {
        craftPanelOpen();
      } else {
        if (justPressed(12) || stickUpPressed) {
          G.craftCursor = (G.craftCursor - 1 + L.RECIPES.length) % L.RECIPES.length;
          SFX.play('click');
          UI.craftPanel(snapshot(), G.craftCursor);
        } else if (justPressed(13) || stickDownPressed) {
          G.craftCursor = (G.craftCursor + 1) % L.RECIPES.length;
          SFX.play('click');
          UI.craftPanel(snapshot(), G.craftCursor);
        } else if (justPressed(confirmIdx)) {
          craft(L.RECIPES[G.craftCursor].id);
          UI.craftPanel(snapshot(), G.craftCursor);
        }
      }
    }

    if (G.state === 'play') {
      var padRot = 0;
      if (stickX !== 0) padRot = stickX;
      else if (isDown(15)) padRot = 1;
      else if (isDown(14)) padRot = -1;

      // 推進 (Thrust): スティック上 / 十字キー上 / LT (左トリガー) / LB (左バンパー) / 下ボタン (Xbox: A, Switch: B)
      // ※射撃ボタン (RT, RB, X/Y/A) によるスラスター誤動作を防止し、射撃と完全独立化
      var padThrust = stickY < -0.3 || isDown(12) || isDown(6) || isDown(4) || isDown(0);

      // 射撃 (Fire): RT (右トリガー) / RB (右バンパー) / フェイス射撃ボタン
      var padFire = isDown(7) || isDown(5);
      if (layout === 'xbox') {
        if (isDown(2)) padFire = true; // Xボタン (左)
      } else {
        if (isDown(1) || isDown(2)) padFire = true; // Aボタン (右) / Yボタン (左) (※上ボタン3のXはクラフト用)
      }

      result.rot = padRot;
      result.thrust = padThrust;
      result.fire = padFire;
    }

    for (var b = 0; b < 17; b++) G.padPrevButtons[b] = isDown(b);
    G.padPrevAxes.x = stickX;
    G.padPrevAxes.y = stickY;

    return result;
  }

  /* ================= 入力状態の毎フレーム合成・リセット ================= */
  function updateInputs(dt) {
    var pad = pollGamepad(dt) || { rot: 0, thrust: false, fire: false };

    if (G.state !== 'play' || G.shipDead) {
      G.input.rot = 0;
      G.input.thrust = false;
      G.input.fire = false;
      return;
    }

    // キーボード入力
    var kbRot = ((G.keys['ArrowRight'] || G.keys['KeyD']) ? 1 : 0) - ((G.keys['ArrowLeft'] || G.keys['KeyA']) ? 1 : 0);
    var kbThrust = !!(G.keys['ArrowUp'] || G.keys['KeyW']);
    var kbFire = !!G.keys['Space'];

    // ポインター (マウス / タッチ) 入力
    var pointerThrust = false;
    var pointerFire = false;

    if (G.pointer.active && G.ship && G.ship.group) {
      var shipPos = G.ship.group.position;
      var pdx = G.pointer.worldX - shipPos.x;
      var pdz = G.pointer.worldZ - shipPos.z;
      var pdist = Math.hypot(pdx, pdz);

      if (pdist > 1.2) {
        var pTargetAngle = Math.atan2(-pdx, -pdz);
        var pDiff = (pTargetAngle - G.ship.heading) % (Math.PI * 2);
        if (pDiff > Math.PI) pDiff -= Math.PI * 2;
        if (pDiff < -Math.PI) pDiff += Math.PI * 2;
        var st = L.engineStats(G.upg ? G.upg.engine : 1);
        var pTurnSpeed = C.ship.turnBase * st.turnMul;
        var pMaxStep = pTurnSpeed * dt;
        if (Math.abs(pDiff) <= pMaxStep) {
          G.ship.heading = pTargetAngle;
        } else {
          G.ship.heading += Math.sign(pDiff) * pMaxStep;
        }
        G.ship.group.rotation.y = G.ship.heading;

        // クリック/ドラッグ中かつ距離・機首方向が合致している時のみスラスターをON
        if (pdist > 3.2 && Math.abs(pDiff) < 1.4) {
          pointerThrust = true;
        }
      }
      pointerFire = true;
    }

    if (G.pointer.pendingFire) {
      pointerFire = true;
    }

    // 毎フレーム全ての入力を合成して確定代入（未入力時は必ず false / 0 にリセット）
    G.input.rot = kbRot !== 0 ? kbRot : pad.rot;
    G.input.thrust = kbThrust || pad.thrust || pointerThrust;
    G.input.fire = kbFire || pad.fire || pointerFire;
  }

  /* ================= メインループ ================= */
  function frame(t) {
    var dt = Math.min(0.05, Math.max(0.0001, (t - G.last) / 1000 || 0.016));
    G.last = t;
    updateInputs(dt);
    if (G.state === 'play') updatePlay(dt);
    else if (G.state !== 'pause' && G.state !== 'craft') {
      // タイトル/オーバー画面のみ背景を動かす (アトラクト)。pause/craft は完全停止
      G.time += dt * 0.5;
      for (var i = 0; i < G.rocks.length; i++) G.rocks[i].update(dt * 0.6);
      if (G.state === 'title' && Math.random() < dt * 0.12 && G.rocks.length < 10) spawnRock(rndInt(0, 2), false);
    }
    var frozen = (G.state === 'pause' || G.state === 'craft');
    if (!frozen) {
      if (G.stars) G.stars.rotation.y += dt * 0.004;
      G.fx.update(dt);
      // カメラシェイク
      if (G.shakeT > 0) {
        G.shakeT = Math.max(0, G.shakeT - dt * 2.6);
        var amp = G.shakeT * 2.4;
        G.camera.position.set(G.camBase.x + rnd(-amp, amp), G.camBase.y + rnd(-amp, amp) * 0.5, G.camBase.z + rnd(-amp, amp) * 0.6);
      } else {
        G.camera.position.copy(G.camBase);
      }
    }
    if (G.state === 'play' || G.state === 'craft') UI.hud(snapshot());
    G.renderer.render(G.scene, G.camera);
  }

  function updatePlay(dt) {
    G.time += dt;
    var st = L.engineStats(G.upg.engine);
    var shipPos = G.ship.group.position;

    /* --- 自機 --- */
    if (!G.shipDead) {
      G.ship.update(dt, G.input, st, G.time);
      if (wrapPos(shipPos, 1.4)) G.fx.ring(shipPos, C.colors.bound, 3, 15, 0.4);
      updateOptionDrones(dt, G.time);
      if (G.invuln > 0) {
        G.invuln -= dt;
        G.ship.group.visible = (Math.floor(G.time * 10) % 2 === 0);
        if (G.invuln <= 0) G.ship.group.visible = true;
      }
      // シールド再生
      var cap = L.shieldCap(G.upg.shield);
      if (G.shield < cap) {
        G.shieldT -= dt;
        if (G.shieldT <= 0) G.shield = Math.min(cap, G.shield + L.shieldRegen(G.upg.shield) * dt);
      } else if (cap > 0 && G.shieldT < 0) {
        G.shieldT = C.shieldGrace;
      }
    } else {
      G.respawnT -= dt;
      if (G.respawnT <= 0) respawnShip();
    }

    /* --- 射撃 --- */
    G.fireCd -= dt;
    if ((G.input.fire || G.pointer.pendingFire) && !G.shipDead && G.clearT < 0) {
      if (tryFireShip()) G.pointer.pendingFire = false;
    }

    /* --- エンティティ移動 --- */
    var j;
    for (j = 0; j < G.rocks.length; j++) {
      var rk = G.rocks[j];
      rk.update(dt);
      wrapPos(rk.mesh.position, rk.radius * 0.5);
    }
    for (j = 0; j < G.bullets.length; j++) {
      var b = G.bullets[j];
      if (!b.alive) continue;
      b.update(dt);
      if (Math.abs(b.mesh.position.x) > C.arena.halfW || Math.abs(b.mesh.position.z) > C.arena.halfD) b.kill();
    }
    var mag = L.engineStats(G.upg.engine).magnet;
    for (j = 0; j < G.pickups.length; j++) {
      var p = G.pickups[j];
      if (!p.active) continue;
      if (p.update(dt, G.time, shipPos, mag)) {
        collectPickup(p);
      } else if (wrapPos(p.mesh.position, 0.8)) {
        var col = p.kind === 'fe' ? C.colors.pickFe : C.colors.pickCr;
        G.fx.ring(p.mesh.position, col, 1.5, 10, 0.3);
      }
    }
    // レイド機
    if (G.raidersQueue > 0) {
      G.raiderT -= dt;
      if (G.raiderT <= 0 && G.raiders.length < G.plan.raiders) {
        spawnRaider();
        G.raidersQueue--;
        G.raiderT = C.raider.spawnEvery * rnd(0.8, 1.3);
      }
    }
    for (j = G.raiders.length - 1; j >= 0; j--) {
      var rd = G.raiders[j];
      var ev = rd.update(dt, shipPos);
      if (ev && ev.fire && !G.shipDead) {
        var rp = rd.mesh.position;
        var t = Math.max(0.4, Math.min(1.6, dist2(rp.x, rp.z, shipPos.x, shipPos.z) / 900));
        var px = shipPos.x + G.ship.vel.x * t * 0.5, pz = shipPos.z + G.ship.vel.z * t * 0.5;
        var ddx = px - rp.x, ddz = pz - rp.z, dl = Math.sqrt(ddx * ddx + ddz * ddz) || 1;
        var rb = acquireBullet();
        if (rb) {
          rb.reset(rp.x, rp.z, ddx / dl * C.raider.bulletSpeed, ddz / dl * C.raider.bulletSpeed, 1, 2.4, 'r');
          SFX.play('raider');
        }
      }
    }

    /* --- ドローン採掘 --- */
    var dLv = G.upg.drone;
    if (dLv > 0 && !G.shipDead) {
      G.droneT -= dt;
      if (G.droneT <= 0) {
        G.droneT = L.droneInterval(dLv);
        var y = L.droneYield(dLv);
        dropResource(shipPos.x, shipPos.z, 'fe', y.fe);
        if (y.cr) dropResource(shipPos.x + rnd(-3, 3), shipPos.z + rnd(-3, 3), 'cr', y.cr);
        UI.toast('採掘ドローン帰投 +' + y.fe + ' Fe' + (y.cr ? ' +' + y.cr + ' Cr' : ''));
      }
    }

    /* --- コンボ減衰 --- */
    if (G.chainT > 0) { G.chainT -= dt; if (G.chainT <= 0) G.chain = 0; }

    collide(shipPos);

    /* --- ステージクリア判定 --- */
    if (G.clearT < 0 && !G.shipDead && G.rocks.length === 0 && G.raiders.length === 0 && G.raidersQueue === 0) {
      G.clearT = 0;
      var bon = L.stageBonus(G.stage);
      G.res.fe += bon.fe; G.res.cr += bon.cr;
      UI.banner('STAGE ' + G.stage + ' CLEAR', '+' + bon.fe + ' Fe / +' + bon.cr + ' Cr 帯の資源を持ち帰った', 2300);
      SFX.play('clear');
      saveNow();
    } else if (G.clearT >= 0) {
      G.clearT += dt;
      if (G.clearT >= 2.4) {
        G.clearT = -1;
        G.stage++;
        G.save.stage = Math.max(G.save.stage, G.stage);
        saveNow();
        spawnWave();
        G.invuln = Math.max(G.invuln, 1.6);
        UI.banner('STAGE ' + G.stage, stageHint(G.stage), 1700);
      }
    }
  }

  /* ================= 衝突 ================= */
  function collide(shipPos) {
    var i, j;
    for (i = 0; i < G.bullets.length; i++) {
      var b = G.bullets[i];
      if (!b.alive) continue;
      var bx = b.mesh.position.x, bz = b.mesh.position.z;
      if (b.team === 'p') {
        for (j = 0; b.alive && j < G.rocks.length; j++) {
          var rk = G.rocks[j];
          var rp = rk.mesh.position;
          var rr = rk.radius + (b.isLaser ? C.bullet.radius * 1.3 : C.bullet.radius);
          if (dist2(bx, bz, rp.x, rp.z) < rr * rr) {
            if (b.onHit(rk.id)) {
              G.fx.burst(rp, rk.geode ? C.colors.geode : C.colors.rock, 6, 16);
              if (rk.hit(b.dmg)) killRock(rk, true);
              else SFX.play('hitRock');
            }
          }
        }
        for (j = 0; b.alive && j < G.raiders.length; j++) {
          var rd = G.raiders[j];
          var q = rd.mesh.position;
          var qr = C.raider.radius + (b.isLaser ? C.bullet.radius * 1.3 : C.bullet.radius);
          if (dist2(bx, bz, q.x, q.z) < qr * qr) {
            if (b.onHit(rd.id)) {
              G.fx.burst(q, C.colors.raider, 6, 18);
              rd.hp -= b.dmg;
              if (rd.hp <= 0) killRaider(rd, true); else SFX.play('hitRock');
            }
          }
        }
      } else {
        if (!G.shipDead && G.invuln <= 0) {
          var sr = C.ship.radius + C.bullet.radius + 0.6;
          if (dist2(bx, bz, shipPos.x, shipPos.z) < sr * sr) {
            b.kill();
            damageShip(1);
          }
        }
      }
    }
    // 隕石 vs 船
    if (!G.shipDead && G.invuln <= 0) {
      for (j = 0; j < G.rocks.length; j++) {
        var rk2 = G.rocks[j], rp2 = rk2.mesh.position;
        var hr = rk2.radius + C.ship.radius * 0.85;
        if (dist2(rp2.x, rp2.z, shipPos.x, shipPos.z) < hr * hr) {
          damageShip(1);
          // 弾き
          var nx = shipPos.x - rp2.x, nz = shipPos.z - rp2.z, nl = Math.sqrt(nx * nx + nz * nz) || 1;
          G.ship.vel.set(nx / nl * 34, 0, nz / nl * 34);
          break;
        }
      }
    }
    // レイド機本体 vs 船
    if (!G.shipDead && G.invuln <= 0) {
      for (j = 0; j < G.raiders.length; j++) {
        var rd2 = G.raiders[j], q2 = rd2.mesh.position;
        var hr2 = C.raider.radius + C.ship.radius;
        if (dist2(q2.x, q2.z, shipPos.x, shipPos.z) < hr2 * hr2) { damageShip(1); break; }
      }
    }
  }

  /* ================= キル/ドロップ ================= */
  function killRock(rock, byPlayer) {
    var pos = rock.mesh.position;
    var color = rock.geode ? C.colors.geode : C.colors.rock;
    G.fx.burst(pos, color, rock.size === 0 ? 16 : 10, 24, rock.size === 0 ? 2.2 : 1.6);
    if (rock.size === 0) G.fx.ring(pos, C.colors.bound, 5, 26, 0.5);
    if (rock.size > 1) SFX.play('boomSmall'); else SFX.play('boom');

    if (byPlayer) {
      addScore(C.rock.score[rock.size], pos);
      // 資源ドロップ
      var feA = [rndInt(3, 6), rndInt(1, 3), Math.random() < 0.65 ? 1 : 0][rock.size];
      if (feA > 0) dropResource(pos.x, pos.z, 'fe', feA);
      var crA = rock.geode ? rndInt(2, 2 + Math.floor(G.stage / 4)) : (Math.random() < 0.18 ? 1 : 0);
      if (crA > 0) dropResource(pos.x + rnd(-1.5, 1.5), pos.z + rnd(-1.5, 1.5), 'cr', crA);
      // 分割
      if (rock.size < 2) {
        var v = rock.vel.clone();
        spawnRock(rock.size + 1, false, pos.x + rnd(-1, 1), pos.z + rnd(-1, 1), v);
        spawnRock(rock.size + 1, false, pos.x + rnd(-1, 1), pos.z + rnd(-1, 1), v);
      }
    }
    removeRock(rock);
  }

  function killRaider(rd, byPlayer) {
    G.fx.burst(rd.mesh.position, C.colors.raider, 16, 26, 2);
    SFX.play('boom');
    if (byPlayer) {
      addScore(C.raider.score, rd.mesh.position);
      dropResource(rd.mesh.position.x, rd.mesh.position.z, 'fe', rndInt(2, 5));
      if (Math.random() < 0.8) dropResource(rd.mesh.position.x, rd.mesh.position.z, 'cr', rndInt(1, 2));
    }
    var i = G.raiders.indexOf(rd);
    if (i >= 0) G.raiders.splice(i, 1);
    rd.active = false;
    rd.mesh.visible = false;
    rd.mesh.traverse(function (o) { if (o.material && o.material.dispose) o.material.dispose(); });
    G.scene.remove(rd.mesh);
  }

  function addScore(base, pos) {
    G.chain = G.chainT > 0 ? G.chain + 1 : 1;
    G.chainT = C.combo.window;
    var mult = L.comboMult(G.chain);
    var pts = Math.round(base * mult);
    G.score += pts;
    G.fx.text(pos, '+' + pts + (G.chain >= 2 ? ' ×' + mult.toFixed(1) : ''), 0xffd75e);
  }

  function dropResource(x, z, kind, amount) {
    var p = null, i;
    for (i = 0; i < G.pickups.length; i++) if (!G.pickups[i].active && G.pickups[i].kind === kind) { p = G.pickups[i]; break; }
    if (!p && G.pickups.length < C.pickup.cap) { p = new AF.Pickup(G.scene, kind); G.pickups.push(p); }
    if (!p) p = G.pickups[0];   // 極端にプールが埋まった場合のみ先頭再利用
    p.reset(x, z, amount);
    return p;
  }

  function collectPickup(p) {
    G.res[p.kind] += p.amount;
    G.fx.text(p.mesh.position, '+' + p.amount + (p.kind === 'fe' ? ' Fe' : ' Cr'), p.kind === 'fe' ? C.colors.pickFe : C.colors.pickCr);
    SFX.play('pickup');
  }

  /* ================= ダメージ/死 ================= */
  function healFull() {
    G.hp = L.hullHp(G.upg.hull);
    G.shield = L.shieldCap(G.upg.shield);
    G.shieldT = C.shieldGrace;
  }

  function damageShip(d) {
    if (G.invuln > 0 || G.shipDead) return;
    var a = Math.min(G.shield, d);
    G.shield -= a;
    var rem = d - a;
    if (rem > 0) G.hp -= rem;
    G.shieldT = C.shieldGrace;
    G.invuln = 0.85;
    SFX.play('hurt');
    shake(0.7);
    G.fx.burst(G.ship.group.position, C.colors.ship, 12, 20, 1.8);
    if (G.hp <= 0) die();
  }

  function die() {
    G.shipDead = true;
    G.respawnT = 1.6;
    G.ship.group.visible = false;
    G.lives--;
    G.fx.burst(G.ship.group.position, C.colors.thruster, 30, 32, 2.6);
    G.fx.burst(G.ship.group.position, C.colors.ship, 18, 22, 2);
    G.fx.ring(G.ship.group.position, C.colors.ship, 4, 34, 0.7);
    SFX.play('boom');
    shake(1.2);
    if (G.lives <= 0) gameOver();
  }

  function respawnShip() {
    G.shipDead = false;
    G.ship.reset();
    healFull();
    G.invuln = C.ship.respawnInvuln;
  }

  function gameOver() {
    G.state = 'over';
    G.save.deaths++;
    if (G.score > G.save.highScore) G.save.highScore = G.score;
    saveNow();
    UI.overPanel({ score: G.score, best: G.save.highScore, stage: G.stage, deaths: G.save.deaths });
    UI.setScreen('over');
  }

  function shake(t) { G.shakeT = Math.max(G.shakeT, t); }

  /* ================= クラフト / セーブ ================= */
  function craft(id) {
    var r = L.recipeById(id);
    if (!r) return;
    var lv = G.upg[id] || 0;
    var next = lv + 1;
    var cost = L.costFor(id, next);
    if (!cost) { UI.toast(r.name + ' は最大レベル'); return; }
    if (!L.canAfford(G.res, cost)) { UI.toast('資源不足: Fe' + cost.fe + ' Cr' + cost.cr + ' 必要'); return; }
    G.res.fe -= cost.fe; G.res.cr -= cost.cr;
    G.upg[id] = next;
    if (id === 'shield') G.shield = L.shieldCap(next);
    if (id === 'hull') G.hp = Math.min(L.hullHp(next), G.hp + 1);
    SFX.play('craft');
    UI.toast(r.name + ' Lv' + next + ' に強化!');
    if (G.state === 'craft') UI.craftPanel(snapshot());
    saveNow();
  }

  function craftPanelOpen() {
    if (G.state === 'play' || G.state === 'pause') {
      G.state = 'craft';
      UI.craftPanel(snapshot(), G.craftCursor);
      UI.setScreen('craft');
      SFX.play('click');
    } else if (G.state === 'craft') {
      G.state = 'play';
      UI.setScreen(null);
    }
  }

  function saveNow() {
    G.save.stage = Math.max(G.save.stage || 1, G.stage);
    G.save.res = { fe: Math.floor(G.res.fe), cr: Math.floor(G.res.cr) };
    G.save.upgrades = G.upg;
    G.save.wpnMode = G.wpnMode;
    G.save.padLayout = G.padLayout;
    if (G.score > G.save.highScore) G.save.highScore = Math.floor(G.score);
    G.save.muted = SFX.muted();
    return S.save(G.save);
  }

  function swapWeapon() {
    if (G.upg.weapon < 2) {
      UI.toast('Lv2以上で換装可能になります');
      return false;
    }
    var cost = L.SWAP_COST;
    if (!L.canAfford(G.res, cost)) {
      UI.toast('資源不足: Fe ' + cost.fe + ' / Cr ' + cost.cr + ' が必要です');
      return false;
    }
    G.res.fe -= cost.fe;
    G.res.cr -= cost.cr;
    G.wpnMode = (G.wpnMode === 'laser' ? 'vulcan' : 'laser');
    saveNow();
    SFX.play('craft');
    var modeName = G.wpnMode === 'laser' ? '集束レーザー (直線貫通)' : '2Wayバルカン (拡散範囲)';
    UI.toast('主兵装換装: ' + modeName);
    if (G.state === 'craft') UI.craftPanel(snapshot(), G.craftCursor);
    return true;
  }

  /* ================= ヘルパ ================= */
  function acquireBullet() {
    for (var i = 0; i < G.bullets.length; i++) if (!G.bullets[i].alive) return G.bullets[i];
    var bl2 = new AF.Bullet(G.scene);
    G.bullets.push(bl2);
    return bl2;
  }

  function dist2(x1, z1, x2, z2) { var dx = x1 - x2, dz = z1 - z2; return dx * dx + dz * dz; }

  function wrapPos(pos, margin) {
    var hw = C.arena.halfW + (margin || 0), hd = C.arena.halfD + (margin || 0);
    var wrapped = false;
    if (pos.x > hw) { pos.x -= C.arena.w; wrapped = true; } else if (pos.x < -hw) { pos.x += C.arena.w; wrapped = true; }
    if (pos.z > hd) { pos.z -= C.arena.d; wrapped = true; } else if (pos.z < -hd) { pos.z += C.arena.d; wrapped = true; }
    return wrapped;
  }

  function snapshot() {
    var w = L.weaponStats(G.upg.weapon, G.wpnMode);
    return {
      score: G.score, best: Math.max(G.save ? G.save.highScore : 0, G.score),
      stage: G.stage, lives: G.lives, res: G.res,
      wpnName: w.name, engineLv: G.upg.engine, wpnMode: G.wpnMode,
      hp: Math.max(0, G.hp), maxHp: L.hullHp(G.upg.hull),
      shield: G.shield, maxShield: L.shieldCap(G.upg.shield),
      comboMult: G.chainT > 0 ? L.comboMult(G.chain) : 1,
      muted: SFX.muted(), upgrades: G.upg,
      padLayout: G.padLayout, padConnected: G.padConnected,
      craftCursor: G.craftCursor
    };
  }

  function setPadLayout(layout) {
    G.padLayout = S.setPadLayout(layout);
    if (G.save) G.save.padLayout = G.padLayout;
    if (UI.updatePadLayoutUI) UI.updatePadLayoutUI(G.padLayout);
    UI.toast('🎮 配列: ' + (G.padLayout === 'switch' ? 'Switch (A右/B下)' : 'Xbox (A下/B右)'));
    return G.padLayout;
  }
  function togglePadLayout() {
    return setPadLayout(G.padLayout === 'switch' ? 'xbox' : 'switch');
  }

  /* ================= キー入力 ================= */
  function onKey(code, down) {
    if (down && code === 'KeyM') { var m = SFX.toggleMute(); UI.toast(m ? 'ミュート ON' : 'ミュート OFF'); saveNow(); return; }
    G.keys[code] = down;
    G.input.rot = ((G.keys['ArrowRight'] || G.keys['KeyD']) ? 1 : 0) - ((G.keys['ArrowLeft'] || G.keys['KeyA']) ? 1 : 0);
    G.input.thrust = !!(G.keys['ArrowUp'] || G.keys['KeyW']);
    if (code === 'Space') G.input.fire = down;

    if (!down) return;
    if (G.state === 'title') {
      if (code === 'Enter') { S.hasSave() ? start(false) : start(true); }
      return;
    }
    if (G.state === 'over') {
      if (code === 'Enter' || code === 'KeyR') { UI.setScreen(null); runFrom(G.save); }
      return;
    }
    if (code === 'Tab' || code === 'KeyC') { craftPanelOpen(); return; }
    if (code === 'Escape') {
      if (G.state === 'craft') { G.state = 'play'; UI.setScreen(null); }
      else setPaused(G.state === 'play');
      return;
    }
    if (code === 'KeyP') { if (G.state !== 'craft') setPaused(G.state === 'play'); return; }
    if (G.state === 'craft') {
      if (code === 'KeyX') { swapWeapon(); return; }
      var n = parseInt(code.indexOf('Digit') === 0 ? code.slice(5) : '', 10);
      if (n >= 1 && n <= L.RECIPES.length) craft(L.RECIPES[n - 1].id);
    }
  }

  AF.Game = {
    init: init, onKey: onKey, snapshot: snapshot, state: function () { return G.state; },
    setPadLayout: setPadLayout, togglePadLayout: togglePadLayout,
    swapWeapon: swapWeapon, craft: craft,
    dropResource: dropResource,
    _G: G
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
