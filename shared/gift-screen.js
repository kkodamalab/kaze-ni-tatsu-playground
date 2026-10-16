export function ensureGiftScreen() {
  let root = document.getElementById("gift");
  if (!root) {
    root = document.createElement("section");
    root.id = "gift";
    root.hidden = true;
    document.body.append(root);
  }
  if (!root.querySelector("#gift-editor"))
    root.innerHTML =
      '<h1>おみやげフォト</h1><div id="gift-editor"></div><canvas id="gift-canvas" width="1080" height="1620"></canvas><p id="gift-status" role="status"></p><button id="gift-save" class="primary">PNGを保存</button><button id="gift-send" class="secondary">スマホにおくる</button><p id="gift-transfer-status" role="status"></p><section id="gift-transfer" hidden><h2>写真を受け取るQR</h2><div id="gift-qr"></div><a id="gift-link" target="_blank" rel="noopener"></a><p>PCを開いたまま受信してください。10分間有効。通信できない場合はPCのPNG保存を使えます。</p><button id="gift-transfer-stop" class="quiet">転送終了・一時データを破棄</button></section><button id="gift-back" class="secondary">結果にもどる</button><button id="gift-discard" class="quiet">写真・作品を消す</button><button id="new-participant" class="secondary participant-button">次の参加者</button><p class="participant-help">写真・作品・個人データを削除して最初に戻ります</p>';
  return root;
}
