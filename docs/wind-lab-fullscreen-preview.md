# WIND LAB 全画面とプレビュー独立制御

- 全画面はラボ全体（操作バー＋3Dステージ）を対象とし、標準/接頭辞付きFullscreen APIを優先。非対応・拒否時はCSSの100dvh疑似全画面を使う。
- EXIT、Esc、ブラウザ戻るで元の表示へ復帰。historyは全画面用の同一ページ内エントリを1つ追加する。画面回転・ウィンドウ/VisualViewportのリサイズ・ResizeObserverから既存resizeを呼び、rendererサイズとcamera.aspectを更新する。
- CAMERAはストリーム/Poseの所有操作。PREVIEWはvideoの表示位置だけを変更し、画面外でも再生/フレーム供給を維持する。SKELETONは2Dオーバーレイだけを変更する。3D AVATARの設定には触れない。
- PREVIEW OFFではCAMERA ACTIVEを表示。全画面/プレビューの切替はカメラ、Worker、ゲーム時計、写真、WindEngine、OrbitControlsを再作成しない。ゲームへ戻る/参加者切替では既存の破棄処理を使う。
- 自動テストは実際のPosePipeline Workerと合成Pose/カメラを使用し、切替前後のPose FPS、手首座標、BODY/左右手の風、粒子速度/変位を比較する。身体風検証では肩腰が見えるfull-body入力を使用する。
- 標準API、非対応/拒否フォールバック、Esc/戻る、1440/390/844/412px、縦横回転、回転ドラッグ/2指ピンチ、進行中の時計・写真セッション・感度保持を検証する。
- 実人物・実カメラ、iPhone Safari/Android Chrome実機のAPI/セーフエリア/バック操作・プレビュー非表示時の継続性は未検証。Chromiumのサイズ変更とタッチイベントによる代替テストと区別する。
- 公開URLの直接ブラウザー検証は実行環境の証明書制約により未検証。証明書登録・TLS検証無効化は行わない。
