# ASTEROID FORGE — アステロイド・フォージ

1979 年アタリ『ASTEROIDS』の現代版。**Three.js 2.5D × 資源採掘 × クラフト × ステージ永続化**。
隕石を砕いて Fe / Cr を採掘し、機体を育てながら小惑星帯 («the Belt») を攻略する。

## 遊び方

**開き方**: `index.html` をブラウザにドロップするだけ (サーバー不要・オフライン動作)。

| 操作 | キー |
|---|---|
| 回転 | ← → または A D |
| 推進 (慣性で滑る) | ↑ / W |
| ショット | Space (長押し連射) |
| **クラフトパネル** | Tab / C (または HUD の `CRAFT ▦` ボタン。数字キー 1〜5 で即購入) |
| ポーズ | P / Esc |
| ミュート | M |

- 隕石を壊すと **Fe (鉄鉱石)** が、緑く光るジオード隕石からは **Cr (結晶)** が採掘できる。磁石半径内自动吸引。
- 強化は 5 系統: **レーザー砲 / エンジン / シールド / 船体装甲 / 採掘ドローン** (自動採掘!)。
- 大隕石は当たると分割される。画面端はワープ。ステージ 3 以降はレイド機が迫る。
- **進行・資源・強化はブラウザに自動保存**。ゲームオーバーでも消えない — 同じ帯から再出撃できる。

## 開発

```
js/config.js    … チューニング値全集約 (バランス改変はここ)
js/logic.js     … 純ロジック: レシピ/ステータス/stagePlan (= node でテスト可)
js/storage.js   … localStorage スキーマ af_save_v1 + サニタイズ
js/entities.js  … Ship/Rock/Bullet/Pickup/Raider/FX (Three.js r147 UMD ベンダー同梱)
js/game.js      … 状態機械・ループ・衝突・クラフト適用
tests/run-tests.mjs       … 単体テスト: `node tests/run-tests.mjs` (16 pass)
tests/browser-verify.mjs  … Playwright E2E (通常のマシン向け; 要 chromium)
```

検証用フラグ: `?debugRes=300,60` で開始資源、`?autocraft=1` で出撃時クラフトパネル。

### セーブの初期化
DevTools → Application → Local Storage → `af_save_v1` を削除 (タイトル画面から「新しいキャンペーン」でもステージはリセット)。

---
設計: [DESIGN.md](./DESIGN.md) / 検証結果: [EVALUATION.md](./EVALUATION.md)
