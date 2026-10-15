# スタッフ用実機調整

設定画面またはプレイ画面の「スタッフ用設定 · 実機調整」を開きます。
プレイ中・PAUSE中も変更できます。難易度や物体固有係数とは独立しています。

| 設定 | 範囲・刻み | 初期値 |
| --- | --- | --- |
| ANGLE GAIN | 0.5–5.0、0.1刻み | 1.0 |
| MAX GAME ANGLE | 10–35°、1°刻み | 30° |
| BOARD LENGTH | 70–130%、1%刻み | 100% |
| OBJECT RESPONSE | 0.5–2.0、0.1刻み | 1.0 |

PHONE CONTROLLER / LOCAL TILT / PC TEST のゲーム角度は
`clamp(relativeAngle * angleGain, -maxGameAngle, maxGameAngle)` です。
`rawAngle` と中央補正後の `relativeAngle` は書き換えません。
BODY AXIS は従来の左右反転と BODY 感度を維持し、その後にスタッフ倍率と最終clampを適用します。
PC TEST のスライダー値もセンサーと同じ平滑化を通るため、変更直後は表示が収束します。
カウントダウン中の板は従来どおり水平で、リアルタイム角度表示は入力値を表示します。

板長は `sceneWidth * 0.7 * boardLength`、物理位置は引き続き ±1 を板端とします。
基準板長単位の物理加速度を計算してから板長で割り、正規化速度・位置に変換します。
最大速度も板長で換算し、板長の変更だけで実際の物体速度が変わらないようにします。
中央復帰力は基準板長換算の変位に適用し、最終板方向加速度全体に OBJECT RESPONSE を掛けます。
同じ係数で短い板の端までの実移動距離は短くなり、落下までの時間も短くなります。
板・オブジェクト・板端は同じ幾何計算を使います。支点高さは変更していません。

設定は `keep-the-egg:device-tuning` に保存します。保存できない環境では画面にその旨を表示し、
セッション内では適用します。「次の参加者」では保持し、「実機調整を初期値に戻す」で戻します。
試行のサンプルCSVには既存列に加えて次を記録します。
`rawSensorAngle`, `relativeSensorAngle`, `gameAngle`, `angleGain`, `maxGameAngle`, `boardLength`, `objectResponse`。
各サンプルにその時点の設定を記録し、途中変更は試行メタデータにも保持します。
集計CSVの角度・設定は最終サンプル／最終設定です。従来の角度統計はセンサー相対角度のままです。

## 検証

`npm test` と `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` で検証します。
ブラウザーテストは GitHub Pages と同じ `/kaze-ni-tatsu-playground/` で配信します。
PHONE CONTROLLER のUI・パケット・再接続テストはローカルの決定的な通信代替を使い、
センサー入力をホスト側で増幅してもコントローラーの角度や通信形式が変わらないことを確認します。
実際の PeerJS シグナリング・WebRTC と iPhone センサーの接続性は実機確認が必要です。

EASY / EGG / 板長100% / OBJECT RESPONSE=1 で、一定の ±5°入力を与えた結果：

- ANGLE GAIN=1：ゲーム±5°。60秒で落下なし（従来挙動）。
- ANGLE GAIN=3：ゲーム±15°。左右とも約6.44秒で落下。
- ANGLE GAIN=4：ゲーム±20°。左右とも約4.96秒で落下。
- GAIN=3で板長70/100/130%：約4.62/6.44/8.26秒で落下。

実GiBoard/iPhoneでは装着状態・中央補正・画面方向変更・小傾斜時の表示・落下・再接続、
PAUSE、音響、PHOTO GIFT、次の参加者での設定保持を確認してください。
