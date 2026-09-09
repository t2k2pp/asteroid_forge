# ASTEROID FORGE リモートリポジトリ移行 ToDo

- [x] 1. Gitリポジトリの初期化とリモート設定
  - `git init -b main` によるローカルリポジトリ初期化
  - リモート `origin` (`https://github.com/t2k2pp/asteroid_forge.git`) の登録
  - `.gitignore` の整備 (.DS_Store等の一時ファイル除外)
  - 初回コミット作成およびリモートリポジトリへの初期Push

- [x] 2. ASTEROID FORGE プロジェクト資産一式の登録と検証
  - ゲーム本体 (HTML/CSS/JS/Vendor)、画像/ドキュメント (README/DESIGN/EVALUATION/docs)、テストコードの登録
  - テストスイート (`node tests/run-tests.mjs`) の実行検証
  - コミット作成およびリモートリポジトリへのPush

- [x] 3. ToDo完了記録とリモート同期検証
  - `TODO.md` の完了状態更新
  - コミット作成およびリモートリポジトリへのPush
  - リモートリポジトリの状態確認と完了確認

---

# ゲーム挙動補正・設計書更新の差分反映 ToDo

- [x] 1. 差分精査・コード量増減および機能削除の確認、ユニットテスト実行
- [x] 2. 自機旋回方向補正・ポーズ/クラフト完全停止・DESIGN.md 更新のコミットとmainへのPush
- [x] 3. ToDo完了記録の更新とmainへのPush

---

# ゲームパッド対応 (Xbox / Switch 配列切替) 実装 ToDo

- [x] 1. 設計書更新・永続化ロジック (padLayout: 'xbox'|'switch') 実装と単体テスト検証
  - `DESIGN.md` にコントローラー入力仕様および配列切り替え（Xbox/Switch）の仕様を追記
  - `js/storage.js` のスキーマ・サニタイズに `padLayout` を追加
  - `tests/run-tests.mjs` に `padLayout` の保存・サニタイズテストを追加・検証
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [x] 2. Gamepad API 入力ポーリング・アクションマッピング実装
  - `js/game.js` にコントローラー入力（アナログスティック、十字キー、ボタン、トリガー）処理を実装
  - Xbox配列 / Switch配列のボタン配置切替ロジックの実装
  - クラフト・ポーズ・タイトル・ゲームオーバーのコントローラー操作対応
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [x] 3. UI切替トグル・操作ガイドの追加とブラウザ実機検証 (Playwright)
  - `index.html` / `js/ui.js` / `css/style.css` にコントローラー配列切替ボタンを追加
  - ヘルプモーダルにゲームパッド操作説明（Xbox/Switch）を追加
  - コントローラー接続・切断時のトースト通知の追加
  - `tests/browser-verify.mjs` にゲームパッドエミュレーション検証を追加・実行
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [x] 4. ToDo完了記録の更新と最終リモート同期
  - `TODO.md` の完了状態更新
  - コミット作成およびリモートリポジトリ（origin/main）へのPush

---

# マウス・タッチ操作対応 (追従旋回・タップ射撃・フィールド外クラフト停止) 実装 ToDo

- [x] 1. 設計書更新とポインター入力仕様の策定
  - `DESIGN.md` にマウス・タッチ操作仕様（ドラッグ追従旋回、タップ射撃、フィールド外タップによるクラフト画面呼び出し＆完全停止）を追記
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [x] 2. 3D座標投影・ポインター入力（旋回追従・推進・射撃・フィールド外判定）の実装
  - `js/game.js` にスクリーン→ワールド平面（Y=1）レイキャスト交差計算を実装
  - フィールド内タップ/ドラッグ時の機首旋回追従・推進・射撃処理を実装
  - フィールド外タップ時のクラフト画面呼び出し（完全時間停止）およびクラフト外側タップによる閉じる処理を実装
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [ ] 3. モバイル・タッチUI最適化とPlaywrightブラウザ実機検証
  - `css/style.css` にキャンバスの `touch-action: none;` 等を追加
  - `index.html` のヘルプモーダルにマウス/タッチ操作案内を追記
  - `tests/browser-verify.mjs` にマウスクリック/ドラッグ旋回、フィールド外クリックでのクラフト停止のE2Eテストを追加・実行
  - コミット作成およびリモートリポジトリ（origin/main）へのPush
- [ ] 4. ToDo完了記録の更新と最終リモート同期
  - `TODO.md` の完了状態更新
  - コミット作成およびリモートリポジトリ（origin/main）へのPush



