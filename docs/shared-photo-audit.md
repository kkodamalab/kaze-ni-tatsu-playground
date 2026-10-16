# Phase 6 共通笑顔シャッター / PHOTO GIFT 調査

調査対象コミット：統合版 `2927ee156d5c5054cc00c4ebd4342ca86ba03910`、
slackline-game-egg `805c60d0a96ac3d8a4961fefb53c6b0da8dc5a91`、
kaze-ni-tatsu-body-tree `6eee1fd9f43343bd31d953f8214eb8c1574dcce5`。
元リポジトリは読取専用で参照し、変更していません。

|機能|既存実装・調査結果|共通化先|
|---|---|---|
|写真合成・縦型1080×1620、配置/拡大、背景/フレーム|seesaw src/gift.js, gift-editor.js。移植元とバイト一致。PNGのみ、イベント日付固定|shared/gift-renderer.js, gift-editor.js|
|画像取込/切り抜き|seesaw src/images.js。JPEG/PNG/WebP、デコード後縮小、URL解放|既存images.jsを再利用|
|お絵かき|画像として作品を取り込めるが、線を描く入力は未実装|共通editorへPointer Eventsの線描画/取り消し/消去を追加|
|QR/スマホ保存|seesaw src/gift-transfer.js。移植元と一致。PeerJS 1.5.5 + QRCode 1.0.0、PNG最大12MB、48KB分割/ACK、10分期限|shared/gift-transfer.js。旧パスは再エクスポート|
|笑顔スコア/自動撮影|wind-tree photos.mjs, face-capture.mjs, face-worker.js。移植元と一致。0.2秒継続・2秒間隔、10枚品質入替え|shared/photos.mjs, smile-capture.mjs, face-worker.js|
|写真一覧/選択/破棄|wind-tree photo-ui.mjs + PhotoSession。Blob/Object URL、メモリのみ|共通PhotoSessionとPHOTO GIFT画面。旧APIは互換再エクスポート|
|カメラ|seesaw BODY: BodyCamera、wind-tree: PosePipeline。撮影設定はゲーム別|BODY/Poseと同一video共有、PHONE/LOCAL/PCは同意時だけホスト側camera。Face既定8fps、Pose上限約30fps|

調査時の統合版には共通PHOTO GIFT画面、JPEG出力、実際の線描画、両ゲーム共通の設定・終了/参加者切替がありませんでした。
既存機能をsharedへ移し、互換パスから再エクスポートすることで実装の二重保有を避けます。

写真・サムネイル・描画・送信Blob・同意はメモリにのみ保持します。
localStorageに保存するのは明示した運営者設定だけです。撮影同意は保存しません。
ゲーム終了時は撮影/不要な推論とカメラを停止し、写真を同じドキュメント内の共通編集画面へ渡します。
次の参加者・ゲーム切替・pagehideでは写真、URL、編集内容、推論Worker、カメラ、Peer接続を破棄します。
スタッフ用実機調整や写真/イベント設定は保持します。リロードで写真は復元しません。

QRには接続IDとランダム256bitの受信キーのみを入れます。写真本体は含めません。
0.peerjs.com はシグナリング、stun.l.google.com は経路探索です。
写真本体は暗号化WebRTC DataChannelで転送し、直接接続できないときはPeerJS既定のTURN（turn.peerjs.com等）を通る場合があります。
写真を保存するアプリケーションサーバーは使いません。これらの依存先は編集画面にも表示します。
転送失敗時は再試行またはローカルPNG/JPEG保存を案内します。
スマホへ保存済みのコピーはホストから削除できません。受信画面の「破棄」とページ離脱では受信メモリ/URL/接続を解放します。

自動テストでは合成画像・Face/Pose推論代替とローカルPeer通信代替を使います。
本物のモデル/CDN、iPhone Safari/Android Chromeの保存/共有UI、実回線のPeerJS/WebRTC/STUN/TURNは実機確認項目です。
証明書/TLSの設定は変更せず、公開URLの直接ブラウザー検証に証明書制約が残る場合は未検証と報告します。
