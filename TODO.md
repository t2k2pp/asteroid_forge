# ASTEROID FORGE リモートリポジトリ移行 ToDo

- [x] 1. Gitリポジトリの初期化とリモート設定
  - `git init -b main` によるローカルリポジトリ初期化
  - リモート `origin` (`https://github.com/t2k2pp/asteroid_forge.git`) の登録
  - `.gitignore` の整備 (.DS_Store等の一時ファイル除外)
  - 初回コミット作成およびリモートリポジトリへの初期Push

- [ ] 2. ASTEROID FORGE プロジェクト資産一式の登録と検証
  - ゲーム本体 (HTML/CSS/JS/Vendor)、画像/ドキュメント (README/DESIGN/EVALUATION/docs)、テストコードの登録
  - テストスイート (`node tests/run-tests.mjs`) の実行検証
  - コミット作成およびリモートリポジトリへのPush

- [ ] 3. ToDo完了記録とリモート同期検証
  - `TODO.md` の完了状態更新
  - コミット作成およびリモートリポジトリへのPush
  - リモートリポジトリの状態確認と完了確認
