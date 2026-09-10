/* ASTEROID FORGE — ブラウザ実機検証 (Playwright / headless Chromium)
 * 実行: node tests/browser-verify.mjs
 * 対象: キー入力 → ゲーム開始 / クラフト購入 / ステージクリア進行 / localStorage 永続化 / コンソールエラー */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire('/Users/osia/Documents/claude/lllmAgents/package.json');
const { chromium } = require('playwright');

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pageUrl = pathToFileURL(path.join(rootDir, 'index.html')).href;

let pass = 0, fail = 0;
const errors = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser = null;
const launchTries = [
  ['chromium(full)', { channel: 'chromium', headless: true }],
  ['chrome(system)', { channel: 'chrome' }],
  ['headless-shell', {}]
];
for (const [label, opt] of launchTries) {
  try { browser = await chromium.launch(opt); console.log('launch ok: ' + label); break; }
  catch (e) { console.log('launch failed: ' + label + ' (' + String(e.message || e).split('\n')[0] + ')'); }
}
if (!browser) { console.error('Chromium を起動できませんでした'); process.exitCode = 2; process.exit(2); }
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(pageUrl);
await sleep(1500);

/* --- 1. タイトル表示 --- */
let state = await page.evaluate(() => AF.Game.state());
ok(state === 'title', '起動してタイトル状態になる (' + state + ')');
const titleVisible = await page.isVisible('#scrTitle.show');
ok(titleVisible, 'タイトルオーバーレイ表示 (継続出撃ボタン非表示=新規時)');
const contHidden = await page.evaluate(() => document.getElementById('btnContinue').style.display === 'none');
ok(contHidden, 'セーブなし時は「继续出撃」が非表示');

/* --- 2. Enter でゲーム開始 --- */
await page.keyboard.press('Enter');
await sleep(600);
state = await page.evaluate(() => AF.Game.state());
ok(state === 'play', 'Enter で PLAY 遷移 (' + state + ')');
const rockCount = await page.evaluate(() => AF.Game._G.rocks.length);
ok(rockCount >= 4, '第1帯の隕石が湧く (n=' + rockCount + ')');

/* --- 3. 操作: 推進 + 射撃でスコア/弾プールが動く --- */
await page.keyboard.down('Space');
await page.keyboard.down('ArrowUp');
await sleep(900);
const fired = await page.evaluate(() => AF.Game._G.bullets.some(b => b.alive) || AF.Game.snapshot().score > 0);
ok(fired, '射撃で弾が発射される / 破壊スコアが入る');
await page.keyboard.up('Space');
await page.keyboard.up('ArrowUp');

/* --- 4. クラフト: 資源を積んで Tab → 数字キー1 で武器 Lv2 --- */
await page.evaluate(() => { const G = AF.Game._G; G.res.fe = 500; G.res.cr = 500; });
await page.keyboard.press('Tab');
await sleep(300);
const craftShown = await page.isVisible('#scrCraft.show');
ok(craftShown, 'Tab でクラフトパネル表示 (ゲーム停止)');
ok(await page.evaluate(() => AF.Game.state()) === 'craft', 'クラフト中は play 状態でない');
const rows = await page.locator('#craftList .craftRow').count();
ok(rows === 5, 'レシピが5系統描画 (n=' + rows + ')');
await page.keyboard.press('Digit1');
await sleep(300);
const wlv = await page.evaluate(() => AF.Game._G.upg.weapon);
ok(wlv === 2, '数字キー1 でレーザー砲 Lv2 に購入 (' + wlv + ')');
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('af_save_v1') || 'null'));
ok(stored && stored.upgrades.weapon === 2, '購入直後に localStorage へ自動セーブ');
await page.keyboard.press('Tab');
await sleep(300);
ok(await page.evaluate(() => AF.Game.state()) === 'play', 'Tab で戦闘再開');

/* --- 5. ステージクリア進行 → stage++ とボーナス・セーブ --- */
const before = await page.evaluate(() => ({ stage: AF.Game._G.stage, fe: AF.Game._G.res.fe }));
await page.evaluate(() => {
  const G = AF.Game._G;
  while (G.rocks.length) { const r = G.rocks[0]; G.scene.remove(r.mesh); G.rocks.splice(0, 1); }
  G.raidersQueue = 0;
});
await sleep(3200);
const after = await page.evaluate(() => ({ stage: AF.Game._G.stage, fe: AF.Game._G.res.fe, rocks: AF.Game._G.rocks.length }));
ok(after.stage === before.stage + 1, '全滅で STAGE クリア → 次帯へ (' + before.stage + '→' + after.stage + ')');
ok(after.fe > before.fe, 'ステージクリアボーナス資源加算 (+' + (after.fe - before.fe) + ' Fe)');
ok(after.rocks >= 4, '次帯の隕石が湧く (n=' + after.rocks + ')');

/* --- 6. 永続化: リロード後に continue 表示 & ステージ復元 --- */
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('af_save_v1') || 'null'));
ok(saved && saved.stage >= before.stage + 1, 'リロード前にセーブ済み stage=' + (saved && saved.stage));
await page.reload();
await sleep(1200);
const contShown = await page.evaluate(() => document.getElementById('btnContinue').style.display !== 'none');
ok(contShown, 'リロード後タイトルに「继续出撃」表示');
const metaText = await page.evaluate(() => document.getElementById('titleMeta').textContent);
ok(/第\s*\d+\s*の帯/.test(metaText), 'メタに保存ステージ表示: ' + metaText.trim());
await page.click('#btnContinue');
await sleep(500);
const resumed = await page.evaluate(() => ({ state: AF.Game.state(), stage: AF.Game._G.stage, wlv: AF.Game._G.upg.weapon }));
ok(resumed.state === 'play' && resumed.stage === saved.stage && resumed.wlv === 2,
  '继续出撃でステージ+' + '武器Lv を復元 (stage=' + resumed.stage + ', wlv=' + resumed.wlv + ')');

/* --- 7. デス → ゲームオーバー → 再出撃で資源維持 --- */
await page.evaluate(() => {
  const G = AF.Game._G;
  G.res.fe = 300;                    // 資源を持った状態で死なせる (持ち帰り設計の検証)
  G.lives = 1; G.shield = 0; G.hp = 1; G.invuln = 0; G.shipDead = false;
});
for (let i = 0; i < 8 && await page.evaluate(() => AF.Game.state()) === 'play'; i++) {
  await page.evaluate(() => {        // 隕石を船に衝突させる
    const G = AF.Game._G;
    if (G.rocks.length) {
      const r = G.rocks[0];
      r.mesh.position.set(G.ship.group.position.x, 1, G.ship.group.position.z);
    } else {
      G.hp = 0; G.shield = 0;        // 隕石が無い場合は同等の状況を直接再現
    }
    if (!G.shipDead && G.hp <= 0) { /* collide 経由で die させるため次フレームを待つ */ }
  });
  await sleep(500);
}
await sleep(1200);
const overState = await page.evaluate(() => ({ state: AF.Game.state(), fe: AF.Game._G.res.fe }));
ok(overState.state === 'over', '全滅で GAME_OVER 遷移 (' + overState.state + ')');
ok(await page.isVisible('#scrOver.show'), 'ゲームオーバー画面表示');
const saved2 = await page.evaluate(() => JSON.parse(localStorage.getItem('af_save_v1') || 'null'));
ok(saved2 && saved2.res.fe >= 300, 'ゲームオーバー後も資源を保持 (Fe=' + (saved2 && saved2.res.fe) + ') — 「持ち帰り」設計');
await page.keyboard.press('Enter');
await sleep(600);
const retried = await page.evaluate(() => ({ state: AF.Game.state(), lives: AF.Game._G.lives }));
ok(retried.state === 'play' && retried.lives === 3, 'Enter で同じ帯に再出撃 (lives=3)');

/* --- 8. ゲームパッド操作 & 配列切替 (Xbox / Switch) 検証 --- */
await page.evaluate(() => {
  window._mockGamepad = {
    id: 'Xbox Wireless Controller (STANDARD GAMEPAD)',
    connected: true,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    axes: [0, 0, 0, 0]
  };
  navigator.getGamepads = () => [window._mockGamepad];
});
await sleep(100);

const padConn = await page.evaluate(() => AF.Game._G.padConnected);
ok(padConn, 'ゲームパッド接続が検知される');

const h0 = await page.evaluate(() => AF.Game._G.ship.heading);
await page.evaluate(() => { window._mockGamepad.axes[0] = 0.8; });
await sleep(200);
await page.evaluate(() => { window._mockGamepad.axes[0] = 0; });
const hRight = await page.evaluate(() => AF.Game._G.ship.heading);
ok(hRight < h0, 'ゲームパッド: 左スティック右で時計回りに旋回 (' + h0.toFixed(2) + ' → ' + hRight.toFixed(2) + ')');

const bulletsBefore = await page.evaluate(() => AF.Game._G.bullets.filter(b => b.alive).length);
await page.evaluate(() => { window._mockGamepad.buttons[7] = { pressed: true, value: 1 }; });
await sleep(150);
await page.evaluate(() => { window._mockGamepad.buttons[7] = { pressed: false, value: 0 }; });
const bulletsAfter = await page.evaluate(() => AF.Game._G.bullets.filter(b => b.alive).length);
ok(bulletsAfter > bulletsBefore, 'ゲームパッド: RT で弾が発射される');

await page.evaluate(() => { window._mockGamepad.buttons[9] = { pressed: true, value: 1 }; });
await sleep(50);
await page.evaluate(() => { window._mockGamepad.buttons[9] = { pressed: false, value: 0 }; });
await sleep(150);
ok(await page.evaluate(() => AF.Game.state() === 'pause'), 'ゲームパッド: Startボタンでポーズ画面へ遷移');

await page.click('#btnPadLayoutPause');
const layoutAfterClick = await page.evaluate(() => AF.Game._G.padLayout);
ok(layoutAfterClick === 'switch', 'UIトグルクリックで Switch 配列に切り替わる');
const btnText = await page.evaluate(() => document.getElementById('btnPadLayoutPause').textContent);
ok(/Switch/.test(btnText), 'ポーズ画面のボタン表示が Switch 配列に更新される (' + btnText + ')');

await page.evaluate(() => { window._mockGamepad.buttons[9] = { pressed: true, value: 1 }; });
await sleep(50);
await page.evaluate(() => { window._mockGamepad.buttons[9] = { pressed: false, value: 0 }; });
await sleep(150);
ok(await page.evaluate(() => AF.Game.state() === 'play'), 'ゲームパッド: Startボタンでポーズ解除');

await page.evaluate(() => { window._mockGamepad.buttons[3] = { pressed: true, value: 1 }; });
await sleep(50);
await page.evaluate(() => { window._mockGamepad.buttons[3] = { pressed: false, value: 0 }; });
await sleep(150);
ok(await page.evaluate(() => AF.Game.state() === 'craft'), 'ゲームパッド: Switch配列Xボタンでクラフト開閉');

await page.evaluate(() => { window._mockGamepad.buttons[0] = { pressed: true, value: 1 }; });
await sleep(50);
await page.evaluate(() => { window._mockGamepad.buttons[0] = { pressed: false, value: 0 }; });
await sleep(150);
ok(await page.evaluate(() => AF.Game.state() === 'play'), 'ゲームパッド: Switch配列Bボタンでクラフトを閉じる');

/* --- 9. マウス / タッチ操作 (追従旋回・タップ射撃・フィールド外クラフト停止) 検証 --- */
const bulletsBeforeClick = await page.evaluate(() => AF.Game._G.bullets.filter(b => b.alive).length);
await page.mouse.click(640, 360);
await sleep(150);
const bulletsAfterClick = await page.evaluate(() => AF.Game._G.bullets.filter(b => b.alive).length);
ok(bulletsAfterClick > bulletsBeforeClick, 'マウス: フィールド内クリックで弾が発射される');

await page.evaluate(() => {
  AF.Game._G.ship.reset();
});
await sleep(100);
const hBeforeDrag = await page.evaluate(() => AF.Game._G.ship.heading);
await page.mouse.move(640, 360);
await page.mouse.down();
await page.mouse.move(950, 360, { steps: 5 });
await sleep(250);
const thrustDuringDrag = await page.evaluate(() => ({
  thrust: AF.Game._G.input.thrust,
  thrusterVisible: AF.Game._G.ship.thruster.visible,
  pointerActive: AF.Game._G.pointer.active
}));
ok(thrustDuringDrag.thrust && thrustDuringDrag.thrusterVisible && thrustDuringDrag.pointerActive, 'マウス: ドラッグ中はスラスターが起動する (thrust=true)');

await page.mouse.up();
await sleep(100);
const thrustAfterUp = await page.evaluate(() => ({
  thrust: AF.Game._G.input.thrust,
  thrusterVisible: AF.Game._G.ship.thruster.visible,
  pointerActive: AF.Game._G.pointer.active
}));
ok(!thrustAfterUp.thrust && !thrustAfterUp.thrusterVisible && !thrustAfterUp.pointerActive, 'マウス: クリック解放時にスラスターが即時停止する (thrust=false, visible=false)');

const hAfterDrag = await page.evaluate(() => AF.Game._G.ship.heading);
ok(hAfterDrag < hBeforeDrag, 'マウス: 右側へドラッグして時計回りに機首が追従旋回 (' + hBeforeDrag.toFixed(2) + ' → ' + hAfterDrag.toFixed(2) + ')');

await page.mouse.click(100, 20);
await sleep(200);
const craftOpened = await page.evaluate(() => AF.Game.state() === 'craft');
ok(craftOpened, 'マウス: フィールド外クリックでクラフト画面が開きゲームが一時停止する');
ok(await page.isVisible('#scrCraft.show'), 'クラフトパネルが表示される');

await page.mouse.click(40, 40);
await sleep(200);
const playResumed = await page.evaluate(() => AF.Game.state() === 'play');
ok(playResumed, 'マウス: クラフト外側クリックでクラフトが閉じ戦闘に復帰する');

/* --- 10. 資源 (Pickup) のスクリーンラップ (境界ワープ) 検証 --- */
await page.evaluate(() => {
  AF.Game.dropResource(AF.CFG.arena.halfW - 0.5, 0, 'fe', 10);
  var p = AF.Game._G.pickups.find(x => x.active && x.kind === 'fe');
  p.velX = 35; // 右端境界の外側へ向けて飛ばす
  p.velZ = 0;
});
await sleep(200);
const wrapCheck = await page.evaluate(() => {
  var p = AF.Game._G.pickups.find(x => x.active && x.kind === 'fe');
  return {
    active: p ? p.active : false,
    x: p ? p.mesh.position.x : 0,
    halfW: AF.CFG.arena.halfW
  };
});
ok(wrapCheck.active && wrapCheck.x < 0, '資源: 右端境界を超えた資源が反対側 (左端) からワープ出現する (x=' + wrapCheck.x.toFixed(1) + ')');
ok(Math.abs(wrapCheck.x) <= wrapCheck.halfW + 1.0, '資源: マップ外へ脱出せずアリーナ内に安全に保持される');

/* --- 11. コンソールエラーゼロ --- */
await sleep(500);
const realErrors = errors.filter(e => !/favicon|Autoplay|AudioContext/i.test(e));
ok(realErrors.length === 0, 'コンソールエラー / 未捕捉例外 ゼロ' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exitCode = fail > 0 ? 1 : 0;
