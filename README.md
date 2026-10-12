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
