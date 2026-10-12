# Phase 6 integration architecture

- `index.html`: 共通のゲーム選択シェル
- `shared/session-manager.js`: 参加者セッションの一時IDと画面離脱時のMediaStream停止
- `games/seesaw/`: シーソーゲームをモジュール構成のまま移植
- `games/wind-tree/`: 風に立つゲームをモジュール構成のまま移植

次段階では各ゲームに `mount/start/pause/resume/stop/dispose/getResult` アダプターを配置し、結果・PHOTO GIFT・次の参加者をアプリシェルへ移します。既存ゲームのゲームロジックは変更しません。
