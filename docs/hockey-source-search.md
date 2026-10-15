# アイスホッケー実装の検索結果

シーソー実機調整の作業開始時の main は
`17194f4218790d694b79834b8cb870f7a34c2e96` です。

GitHub API の全ページ取得と Git の remote refs 取得で、既存の次の範囲を確認しました。

- ブランチ `main`
- ブランチ `fix/continuous-particles-camera-pose`
- PR #1 Keep particles flowing and stabilize upper/full-body camera Pose（マージ済み）
- PR #2 Correct upper-body Pose detection diagnostics（マージ済み）
- PR #3 Preserve torso wind and finalize results before graphics release（マージ済み）
- PR #4 Preserve camera proportions, depth and coherent avatar zoom（マージ済み）
- 未マージ／open PR は0件
- 全ブランチと `refs/pull/1..4/head` を取得した非shallow履歴：到達可能80コミット

上記refsの全履歴に存在するファイル名を確認し、第三者vendorを除く
110個の一意な HTML/JS/MJS/CSS/Markdown/JSON blob を検索しました。
検索語は `hockey`, `ホッケー`, `puck`, `パック`, `P1…P2`,
`FULLSCREEN`, `RESTART`（英字は大文字小文字を区別しない）です。該当は0件でした。
リポジトリのゲーム実装は `games/seesaw/` と `games/wind-tree/` のみです。

このため、指定された P1/P2・黒いパック・青いコート・上部操作UIを持つ
既存実装は特定できていません。ユーザーの指定に従い、新規ホッケー実装は作成せず、
HUD修正は行っていません。ホッケーの対象ソースが提供されるまで、この部分の作業は停止します。
シーソーの実機調整は独立して継続します。
