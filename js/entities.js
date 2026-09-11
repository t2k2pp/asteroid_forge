/* ASTEROID FORGE — エンティティ & FX (Three.js r147) */
(function (root) {
  var AF = root.AF, C = AF.CFG, T = root.THREE;

  /* ---------- 共有テクスチャ / ジオメトリ ------------------------------- */
  var _glowTex = null;
  function glowTexture() {
    if (_glowTex) return _glowTex;
    var cv = document.createElement('canvas'); cv.width = cv.height = 64;
    var g = cv.getContext('2d');
    var rad = g.createRadialGradient(32, 32, 1, 32, 32, 31);
    rad.addColorStop(0, 'rgba(255,255,255,1)');
    rad.addColorStop(0.35, 'rgba(255,255,255,0.6)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rad; g.fillRect(0, 0, 64, 64);
    _glowTex = new T.CanvasTexture(cv);
    return _glowTex;
  }

  var _rockWire = null, _rockFill = null;
  function rockGeos() {
    if (!_rockWire) {
      _rockFill = new T.IcosahedronGeometry(1, 0);
      _rockWire = new T.WireframeGeometry(_rockFill);
    }
    return { wire: _rockWire, fill: _rockFill };
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }

  /* ---------- Ship ------------------------------------------------------- */
  function Ship(scene) {
    this.group = new T.Group();
    var N = new T.Vector3(0, 0, -3.2), R = new T.Vector3(2.15, 0, 2.0),
      M = new T.Vector3(0, 0, 0.95), L = new T.Vector3(-2.15, 0, 2.0);

    var outline = new T.LineLoop(
      new T.BufferGeometry().setFromPoints([N, R, M, L]),
      new T.LineBasicMaterial({ color: C.colors.ship, transparent: true, opacity: 0.95 })
    );
    var fillGeo = new T.BufferGeometry();
    fillGeo.setAttribute('position', new T.Float32BufferAttribute([
      N.x, N.y, N.z, R.x, R.y, R.z, M.x, M.y, M.z,
      N.x, N.y, N.z, M.x, M.y, M.z, L.x, L.y, L.z
    ], 3));
    var fill = new T.Mesh(fillGeo, new T.MeshBasicMaterial({
      color: C.colors.shipFill, transparent: true, opacity: 0.5, side: T.DoubleSide
    }));

    this.thruster = new T.Mesh(
      new T.ConeGeometry(0.85, 2.8, 4),
      new T.MeshBasicMaterial({ color: C.colors.thruster, transparent: true, opacity: 0.75, blending: T.AdditiveBlending, depthWrite: false })
    );
    this.thruster.rotation.x = Math.PI / 2;   // 先端が +Z (後方) を向く
    this.thruster.position.set(0, 0, 2.6);
    this.thruster.visible = false;

    var glow = new T.Sprite(new T.SpriteMaterial({
      map: glowTexture(), color: C.colors.ship, transparent: true, opacity: 0.5,
      blending: T.AdditiveBlending, depthWrite: false
    }));
    glow.scale.setScalar(9);

    this.group.add(outline); this.group.add(fill); this.group.add(this.thruster); this.group.add(glow);
    scene.add(this.group);

    this.vel = new T.Vector3();
    this.heading = 0;           // 0 = -Z 方向 (画面上方向)
    this.reset();
  }
  Ship.prototype.reset = function () {
    this.group.position.set(0, 1, -4);
    this.vel.set(0, 0, 0);
    this.heading = 0;
    this.group.rotation.y = 0;
    this.group.visible = true;
  };
  Ship.prototype.forward = function (out) { out.x = -Math.sin(this.heading); out.z = -Math.cos(this.heading); return out; };
  Ship.prototype.update = function (dt, input, st, tSec) {
    // heading 増分は -= : この座標系 (+X=右 / -Z=画面上) では heading 減少が時計回り (=Right キー) になる
    if (input.rot) this.heading -= input.rot * C.ship.turnBase * st.turnMul * dt;
    this.group.rotation.y = this.heading;
    if (input.thrust) {
      var f = this.forward(Ship._tmp);
      var a = C.ship.thrustBase * st.thrustMul;
      this.vel.x += f.x * a * dt; this.vel.z += f.z * a * dt;
    }
    this.vel.multiplyScalar(Math.max(0, 1 - C.ship.drag * dt));
    var max = C.ship.maxSpeed * st.speedMul;
    if (this.vel.lengthSq() > max * max) this.vel.setLength(max);
    this.group.position.x += this.vel.x * dt;
    this.group.position.z += this.vel.z * dt;
    // 推進炎のちらつき
    var on = !!input.thrust;
    this.thruster.visible = on;
    if (on) {
      var k = 0.75 + 0.45 * Math.abs(Math.sin(tSec * 26));
      this.thruster.scale.set(1, 1, k * (1 + st.turnMul * 0.08));
    }
    return this.group.position;
  };
  Ship._tmp = { x: 0, z: 0 };

  /* ---------- Rock -------------------------------------------------------- */
  function Rock(scene, sizeIdx, hp, geode, speedMul) {
    this.size = sizeIdx;
    this.radius = C.rock.radii[sizeIdx];
    this.hp = hp;
    this.geode = !!geode;
    var geos = rockGeos();
    var col = this.geode ? C.colors.geode : C.colors.rock;

    this.mesh = new T.Group();
    var w = new T.LineSegments(geos.wire, new T.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9 }));
    var f = new T.Mesh(geos.fill, new T.MeshBasicMaterial({ color: col, transparent: true, opacity: this.geode ? 0.18 : 0.09 }));
    var sx = rnd(0.75, 1.35), sy = rnd(0.75, 1.35), sz = rnd(0.75, 1.35);
    w.scale.set(sx, sy, sz); f.scale.set(sx * 0.98, sy * 0.98, sz * 0.98);
    if (this.geode) {
      var gs = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: col, transparent: true, opacity: 0.55, blending: T.AdditiveBlending, depthWrite: false }));
      gs.scale.setScalar(this.radius * 3.2);
      this.mesh.add(gs);
    }
    this.mesh.add(w); this.mesh.add(f);
    this.mesh.scale.setScalar(this.radius);
    scene.add(this.mesh);

    var ang = rnd(0, Math.PI * 2);
    var spd = C.rock.spd[sizeIdx] * speedMul * rnd(0.7, 1.3);
    this.vel = new T.Vector3(Math.cos(ang) * spd, 0, Math.sin(ang) * spd);
    this.mesh.position.set(0, rnd(-C.rock.yJitter, C.rock.yJitter), 0);
    this.spin = { x: rnd(-0.5, 0.5), y: rnd(-0.9, 0.9), z: rnd(-0.5, 0.5) };
  }
  Rock.prototype.hit = function (d) { this.hp -= d; return this.hp <= 0; };
  Rock.prototype.update = function (dt) {
    this.mesh.rotation.x += this.spin.x * dt;
    this.mesh.rotation.y += this.spin.y * dt;
    this.mesh.rotation.z += this.spin.z * dt;
    this.mesh.position.addScaledVector(this.vel, dt);
  };
  Rock.prototype.dispose = function (scene) { scene.remove(this.mesh); };

  /* ---------- Bullet ------------------------------------------------------ */
  var _bulletGeo = null;
  function bulletGeo() { if (!_bulletGeo) _bulletGeo = new T.SphereGeometry(0.55, 6, 6); return _bulletGeo; }
  var _matBullet = {};
  function bulletMat(team) {
    if (!_matBullet[team]) {
      _matBullet[team] = new T.MeshBasicMaterial({ color: team === 'p' ? C.colors.bulletP : C.colors.bulletR });
    }
    return _matBullet[team];
  }
  function glowMat(team) {
    if (!_matBullet[team + '_g']) {
      _matBullet[team + '_g'] = new T.SpriteMaterial({
        map: glowTexture(), color: team === 'p' ? C.colors.bulletP : C.colors.bulletR,
        transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false
      });
    }
    return _matBullet[team + '_g'];
  }
  function Bullet(scene) {
    this.mesh = new T.Mesh(bulletGeo(), bulletMat('p'));
    var g = new T.Sprite(glowMat('p')); g.scale.setScalar(3.4);
    this.mesh.add(g);
    scene.add(this.mesh);
    this.reset(0, 0, 0, 0, 0, 0, 'p', 1);
    this.kill();   // プール用の初期化 (非活性)
  }
  Bullet.prototype.reset = function (x, z, vx, vz, dmg, life, team) {
    this.alive = true;
    this.team = (team === 'r') ? 'r' : 'p';
    this.dmg = dmg || 1;
    this.life = life || C.bullet.life;
    this.velX = vx; this.velZ = vz;
    this.mesh.position.set(x, 0.8, z);
    this.mesh.material = bulletMat(team);
    this.mesh.children[0].material = glowMat(team);
    var s = 0.7 + this.dmg * 0.35;
    this.mesh.scale.setScalar(s);
    this.mesh.visible = true;
  };
  Bullet.prototype.update = function (dt) {
    if (!this.alive) return;
    this.mesh.position.x += this.velX * dt;
    this.mesh.position.z += this.velZ * dt;
    this.life -= dt;
    if (this.life <= 0) this.kill();
  };
  Bullet.prototype.kill = function () { this.alive = false; this.mesh.visible = false; };

  /* ---------- Pickup (資源ドロップ) --------------------------------------- */
  var _pickGeo = null, _pickWire = null;
  function pickGeos() {
    if (!_pickGeo) { _pickGeo = new T.OctahedronGeometry(1, 0); _pickWire = new T.WireframeGeometry(_pickGeo); }
    return { solid: _pickGeo, wire: _pickWire };
  }
  var _pickMat = {};
  function pickMats(kind) {
    if (!_pickMat[kind]) {
      var col = kind === 'fe' ? C.colors.pickFe : C.colors.pickCr;
      _pickMat[kind] = {
        solid: new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85 }),
        wire: new T.LineBasicMaterial({ color: col })
      };
    }
    return _pickMat[kind];
  }
  function Pickup(scene, kind) {
    var geos = pickGeos(), mats = pickMats(kind);
    this.kind = kind;
    this.mesh = new T.Group();
    this.mesh.add(new T.Mesh(geos.solid, mats.solid));
    this.mesh.add(new T.LineSegments(geos.wire, mats.wire));
    var gs = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: kind === 'fe' ? C.colors.pickFe : C.colors.pickCr, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    gs.scale.setScalar(4.2);
    this.mesh.add(gs);
    scene.add(this.mesh);
    this.active = false;
    this.phase = Math.random() * 6.28;
  }
  Pickup.prototype.reset = function (x, z, amount) {
    this.active = true;
    this.amount = amount;
    var a = rnd(0, 6.28), s = rnd(3, 9);
    this.velX = Math.cos(a) * s; this.velZ = Math.sin(a) * s;
    this.mesh.position.set(x, 0.9, z);
    this.mesh.visible = true;
  };
  /* 磁石吸着。回収したら true */
  Pickup.prototype.update = function (dt, tSec, shipPos, magnetR) {
    if (!this.active) return false;
    var p = this.mesh.position;
    var dx = shipPos.x - p.x, dz = shipPos.z - p.z;
    if (C.arena && C.arena.w && C.arena.d) {
      if (dx > C.arena.halfW) dx -= C.arena.w;
      else if (dx < -C.arena.halfW) dx += C.arena.w;
      if (dz > C.arena.halfD) dz -= C.arena.d;
      else if (dz < -C.arena.halfD) dz += C.arena.d;
    }
    var d = Math.sqrt(dx * dx + dz * dz);
    if (d < magnetR && d > 0.001) {
      var acc = C.pickup.accel * dt;
      this.velX += (dx / d) * acc; this.velZ += (dz / d) * acc;
      var sp = Math.sqrt(this.velX * this.velX + this.velZ * this.velZ);
      if (sp > C.pickup.maxSpeed) { this.velX *= C.pickup.maxSpeed / sp; this.velZ *= C.pickup.maxSpeed / sp; }
    } else {
      this.velX *= Math.max(0, 1 - 1.4 * dt); this.velZ *= Math.max(0, 1 - 1.4 * dt);
    }
    p.x += this.velX * dt; p.z += this.velZ * dt;
    p.y = 0.9 + Math.sin(tSec * 3 + this.phase) * 0.5;
    this.mesh.rotation.y += 2.6 * dt;
    var pulse = (d < magnetR) ? 1.25 + 0.15 * Math.sin(tSec * 14) : 1;
    this.mesh.scale.setScalar(C.pickup.radius * pulse);
    if (d < C.pickup.collectDist) { this.active = false; this.mesh.visible = false; return true; }
    return false;
  };

  /* ---------- Raider (レイド機) ------------------------------------------- */
  var _raiderGeo = null, _raiderWire = null;
  function raiderGeos() {
    if (!_raiderGeo) { _raiderGeo = new T.TetrahedronGeometry(1.8, 0); _raiderWire = new T.WireframeGeometry(_raiderGeo); }
    return { solid: _raiderGeo, wire: _raiderWire };
  }
  function Raider(scene) {
    var geos = raiderGeos();
    this.mesh = new T.Group();
    this.mesh.add(new T.Mesh(geos.solid, new T.MeshBasicMaterial({ color: C.colors.raider, transparent: true, opacity: 0.35 })));
    this.mesh.add(new T.LineSegments(geos.wire, new T.LineBasicMaterial({ color: C.colors.raider })));
    var gs = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: C.colors.raider, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false }));
    gs.scale.setScalar(8);
    this.mesh.add(gs);
    scene.add(this.mesh);
    this.active = false;
    this.orbit = 0;
  }
  Raider.prototype.reset = function (x, z) {
    this.active = true;
    this.hp = C.raider.hp;
    this.fireT = rnd(0.8, 1.6);
    this.orbit = rnd(0, 6.28);
    this.dirSign = Math.random() < 0.5 ? -1 : 1;
    this.mesh.position.set(x, 1.2, z);
    this.mesh.visible = true;
  };
  /* 船の周りを keepDist で周回。発射タイミングなら {fire:true} */
  Raider.prototype.update = function (dt, shipPos) {
    if (!this.active) return null;
    this.orbit += this.dirSign * 0.85 * dt;
    var k = C.raider.keepDist + Math.sin(this.orbit * 2 + this.phaseOrb || 0) * 7;
    var tx = shipPos.x + Math.cos(this.orbit) * k;
    var tz = shipPos.z + Math.sin(this.orbit) * k;
    var p = this.mesh.position;
    var dx = tx - p.x, dz = tz - p.z, d = Math.sqrt(dx * dx + dz * dz);
    var sp = Math.min(d * 3, 26);
    if (d > 0.01) { p.x += (dx / d) * sp * dt; p.z += (dz / d) * sp * dt; }
    this.mesh.rotation.y += 1.8 * dt;
    this.mesh.rotation.x += 0.6 * dt;
    this.fireT -= dt;
    if (this.fireT <= 0) {
      this.fireT = C.raider.fireEvery * rnd(0.75, 1.3);
      return { fire: true };
    }
    return null;
  };
  Raider.prototype.disposeHit = function () { };

  /* ---------- FXManager (パーティクル / リング / floating text) ------------ */
  function FXManager(scene) {
    this.scene = scene;
    this.pool = [];   // スプライトパーティクル
    for (var i = 0; i < 96; i++) {
      var sp = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      sp.visible = false; scene.add(sp);
      this.pool.push({ sprite: sp, life: 0, max: 1, vx: 0, vy: 0, vz: 0, base: 1 });
    }
    this.rings = [];
    for (var j = 0; j < 8; j++) {
      var r = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), transparent: true, blending: T.AdditiveBlending, depthWrite: false, rotation: 0 }));
      r.visible = false; scene.add(r);
      this.rings.push({ sprite: r, t: 0, dur: 1, from: 1, to: 2 });
    }
    this.texts = [];
    for (var k = 0; k < 10; k++) {
      var cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
      var tex = new T.CanvasTexture(cv);
      var mat = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
      var ts = new T.Sprite(mat); ts.scale.set(14, 3.5, 1); ts.visible = false;
      scene.add(ts);
      this.texts.push({ sprite: ts, canvas: cv, tex: tex, ctx: cv.getContext('2d'), life: 0, dur: 1 });
    }
    this._pi = 0; this._ri = 0; this._ti = 0;
  }
  FXManager.prototype._acquireP = function () {
    for (var n = 0; n < this.pool.length; n++) {
      var e = this.pool[(this._pi + n) % this.pool.length];
      if (e.life <= 0) { this._pi = (this._pi + n + 1) % this.pool.length; return e; }
    }
    this._pi = (this._pi + 1) % this.pool.length;
    return this.pool[this._pi];
  };
  FXManager.prototype.burst = function (pos, color, count, speed, baseScale) {
    for (var i = 0; i < count; i++) {
      var e = this._acquireP();
      var a = rnd(0, Math.PI * 2), up = rnd(-0.4, 1);
      var s = speed * rnd(0.35, 1);
      e.vx = Math.cos(a) * s; e.vz = Math.sin(a) * s; e.vy = up * s * 0.6;
      e.life = e.max = rnd(0.4, 0.85);
      e.base = (baseScale || 1.6) * rnd(0.7, 1.5);
      e.sprite.position.set(pos.x, pos.y + 0.6, pos.z);
      e.sprite.material.color.setHex(color);
      e.sprite.material.opacity = 1;
      e.sprite.scale.setScalar(e.base);
      e.sprite.visible = true;
    }
  };
  FXManager.prototype.ring = function (pos, color, from, to, dur) {
    var r = this.rings[this._ri]; this._ri = (this._ri + 1) % this.rings.length;
    r.t = 0; r.dur = dur || 0.45; r.from = from || 3; r.to = to || 14;
    r.sprite.position.set(pos.x, pos.y + 0.5, pos.z);
    r.sprite.material.color.setHex(color);
    r.sprite.material.opacity = 0.9;
    r.sprite.scale.setScalar(r.from);
    r.sprite.visible = true;
  };
  FXManager.prototype.text = function (pos, str, color) {
    var t = this.texts[this._ti]; this._ti = (this._ti + 1) % this.texts.length;
    var c = t.ctx;
    c.clearRect(0, 0, 256, 64);
    c.font = 'bold 42px Consolas, "Courier New", monospace';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(str, 128, 34);
    t.tex.needsUpdate = true;
    t.sprite.material.color.setHex(color == null ? 0xffd75e : color);
    t.sprite.position.set(pos.x, pos.y + 3, pos.z);
    t.sprite.visible = true;
    t.life = t.dur = 1.05;
  };
  FXManager.prototype.update = function (dt) {
    var i, e;
    for (i = 0; i < this.pool.length; i++) {
      e = this.pool[i];
      if (e.life <= 0) continue;
      e.life -= dt;
      if (e.life <= 0) { e.sprite.visible = false; continue; }
      var k = e.life / e.max;
      e.sprite.position.x += e.vx * dt; e.sprite.position.y += e.vy * dt; e.sprite.position.z += e.vz * dt;
      e.vx *= Math.max(0, 1 - 2.4 * dt); e.vz *= Math.max(0, 1 - 2.4 * dt); e.vy -= 6 * dt;
      e.sprite.material.opacity = k;
      e.sprite.scale.setScalar(e.base * (0.35 + 0.65 * k));
    }
    for (i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      if (!r.sprite.visible) continue;
      r.t += dt;
      var kk = Math.min(1, r.t / r.dur);
      r.sprite.scale.setScalar(r.from + (r.to - r.from) * kk);
      r.sprite.material.opacity = 0.9 * (1 - kk);
      if (kk >= 1) r.sprite.visible = false;
    }
    for (i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) { t.sprite.visible = false; continue; }
      t.sprite.position.y += 5 * dt;
      t.sprite.material.opacity = Math.min(1, t.life / 0.35);
    }
  };

  /* ---------- ワールド装飾 ----------------------------------------------- */
  function buildStars() {
    var n = 2200, pos = new Float32Array(n * 3), colArr = new Float32Array(n * 3);
    var c = new T.Color();
    for (var i = 0; i < n; i++) {
      // カメラの最大後退位置 (dist ≈ 400) より十分に遠い深宇宙 (r = 680〜980) に配置
      var r = rnd(680, 980);
      var x, y, z;
      if (Math.random() < 0.75) {
        // カメラの視界前方 (奥・上空 Z < 40, Y > -30) に高密度集中
        var theta = (Math.random() - 0.5) * Math.PI * 1.4;
        var phi = 0.15 + Math.random() * 1.35;
        x = r * Math.sin(theta) * Math.sin(phi);
        y = r * Math.cos(phi) - 20;
        z = -r * Math.cos(theta) * Math.sin(phi);
      } else {
        // 全周囲スカイスフィア
        var a = rnd(0, Math.PI * 2), b = Math.acos(rnd(-1, 1));
        x = r * Math.sin(b) * Math.cos(a);
        y = r * Math.cos(b);
        z = r * Math.sin(b) * Math.sin(a);
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;

      var t = Math.random();
      c.setHex(t < 0.65 ? C.colors.star : (t < 0.85 ? 0xffd9a8 : 0xa8c9ff));
      colArr[i * 3] = c.r; colArr[i * 3 + 1] = c.g; colArr[i * 3 + 2] = c.b;
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(colArr, 3));
    var m = new T.PointsMaterial({
      size: 9,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: T.AdditiveBlending,
      depthWrite: false,
      fog: false
    });
    return new T.Points(g, m);
  }

  function buildFloor() {
    var grp = new T.Group();
    var grid = new T.GridHelper(C.arena.w, 12, C.colors.bound, C.colors.grid);
    grid.material.transparent = true; grid.material.opacity = 0.3;
    grid.position.y = -1.4;
    grp.add(grid);
    // 境界ライン (ワープゲート感)
    var hw = C.arena.halfW, hd = C.arena.halfD;
    var pts = [new T.Vector3(-hw, 0.1, -hd), new T.Vector3(hw, 0.1, -hd), new T.Vector3(hw, 0.1, hd), new T.Vector3(-hw, 0.1, hd)];
    var bound = new T.LineLoop(
      new T.BufferGeometry().setFromPoints(pts),
      new T.LineBasicMaterial({ color: C.colors.bound, transparent: true, opacity: 0.85 })
    );
    grp.add(bound);
    return grp;
  }

  function buildNebula() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var g = cv.getContext('2d');
    function blob(x, y, r, col) {
      var rad = g.createRadialGradient(x, y, 1, x, y, r);
      rad.addColorStop(0, col); rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad; g.fillRect(0, 0, 256, 256);
    }
    blob(70, 80, 90, 'rgba(40,120,160,0.5)');
    blob(180, 150, 80, 'rgba(140,60,180,0.35)');
    blob(120, 210, 70, 'rgba(200,110,50,0.25)');
    var tex = new T.CanvasTexture(cv);
    var m = new T.Mesh(
      new T.PlaneGeometry(460, 420),
      new T.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, fog: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = -34;
    return m;
  }

  AF.Ship = Ship; AF.Rock = Rock; AF.Bullet = Bullet; AF.Pickup = Pickup; AF.Raider = Raider;
  AF.FXManager = FXManager;
  AF.glowTexture = glowTexture;
  AF.world = { buildStars: buildStars, buildFloor: buildFloor, buildNebula: buildNebula };
})(typeof globalThis !== 'undefined' ? globalThis : this);
