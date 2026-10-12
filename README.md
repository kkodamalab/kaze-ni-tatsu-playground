# 風に立つ PLAYGROUND

シーソーゲームと「風に立つ」を、イベント向けの共通セッション体験として統合するプロジェクトです。

## 統合方針

- 各ゲームの既存ロジックを保持し、個別アダプターで起動・停止・破棄を管理します。
- 共通シェルがゲーム選択、設定、カウントダウン、結果、PHOTO GIFT、次の参加者を管理します。
- 参加者写真はセッションメモリのみ。次の参加者で必ず破棄します。
- カメラ、MediaPipe、WebRTC はゲーム切替時に停止・解放します。

## 移植元

- https://github.com/kkodamalab/slackline-game-egg
- https://github.com/kkodamalab/kaze-ni-tatsu-body-tree

各移植元のライセンス・第三者依存関係を確認し、原著作権表示を保持します。

## 開発・検証

アプリ自体は静的ファイルのみで、依存パッケージのインストールは不要です。
`python3 -m http.server 8000` で配信できます。3D WIND LAB の Three.js r160 と
OrbitControls は `games/wind-tree/vendor/three/` に同梱し、すべて同じローカル
モジュールを参照します。カメラ用 MediaPipe とスマホ接続は別途ネットワークが必要です。

テストには Node.js 22 以降を使います。

```sh
npm ci
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Chromium がない場合は `npx playwright-core install --with-deps chromium` で導入し、
`CHROMIUM_PATH` を指定せずにブラウザーテストを実行します。
TLS 検証は有効のままにしてください。

ビルドはローカルの依存ファイル・import を検証して静的配信物を `dist/` に作ります。
ブラウザーテストは実際の WebGL 描画ピクセルを読み取り、GitHub Pages と同じ
`/kaze-ni-tatsu-playground/` 配下で DOT/KIDS/ART、PC TEST、3D AVATAR、
HAND FIELD DEBUG、異常時の診断と後始末、両ゲームと PHOTO GIFT の回帰を確認します。
写真テストは合成画像を使い、実際の撮影・スマホ間転送は実機で確認します。
描画結果は `test-results/` に保存します。

GitHub Pages は `main` のリポジトリルートから公開します。
`dist/` のコミットは不要です。main へのプッシュで Pages の再デプロイが始まります。
