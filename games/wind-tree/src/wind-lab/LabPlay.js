import { GrowthSession } from "./GrowthSession.js";
import { validDuration } from "../../trial.mjs";
import { PhotoSession } from "../../photos.mjs";
import { PhotoUI } from "../../photo-ui.mjs";
import { FaceCapture } from "../../face-capture.mjs";
import { trackingSnapshot } from "./TrackingReport.js";
export class LabPlay {
  constructor(lab, initialDuration = 30) {
    this.lab = lab;
    this.growth = new GrowthSession();
    this.photos = new PhotoSession();
    this.rows = [];
    this.finished = false;
    this.photoRequested = false;
    this.initialDuration = initialDuration;
    this.mount();
    this.photoUI = new PhotoUI(this.photos, lab.root, { prefix: "lab-" });
    this.face = new FaceCapture({
      video: lab.video,
      session: this.photos,
      onStatus: (text) => (this.$("#labPhotoStatus").textContent = text),
      onPhoto: () => this.photoUI.render(),
      getElapsed: () => this.growth.elapsedMs,
      isPlaying: () => this.isActive(),
      getAspect: () => lab.video.videoWidth / lab.video.videoHeight,
    });
    this.timer = setInterval(() => this.sync(performance.now()), 100);
  }
  $(s) {
    return this.lab.$(s);
  }
  mount() {
    const section = document.createElement("section");
    section.className = "lab-play";
    section.id = "labPlay";
    section.hidden = true;
    section.innerHTML = `<div class="lab-primary"></div><div class="lab-play-setup"><label>プレイ時間 <input id="labDuration" type="number" min="1" max="60" step="1" value="${this.initialDuration}"> 秒</label><label><input id="labSmileEnabled" type="checkbox" checked> 笑顔撮影ON</label><label>笑顔の閾値 <output id="labSmileValue">60%</output><input id="labSmileThreshold" type="range" min="0" max="100" value="60"></label><label class="lab-consent"><input id="labPhotoConsent" type="checkbox"> 本人・保護者の撮影同意を今回の参加者について確認しました</label><p>写真はカメラ映像を鏡像で撮影し、ブラウザのメモリに最大10枚保持します。外部送信・自動保存しません。笑顔スコアは確率ではありません。</p></div><div class="lab-play-actions"><button id="labStartPlay">START / はじめる</button><button id="labPausePlay" disabled>PAUSE / ひとやすみ</button><button id="labResetPlay">RESET / 次の参加者</button><button id="labStopPhoto">撮影を止める</button><button id="labPlayCsv">CSV</button></div><p id="labPlayStatus" role="status"></p><p id="labPhotoStatus" role="status">撮影は同意確認後に有効になります</p><div id="labResult" hidden><h2>風の木が育ったね！</h2><p id="labResultText"></p><p id="lab-noPhotos">今回は写真がありません</p><div id="lab-photoGrid" class="photoGrid"></div><button id="lab-savePhotoBtn" disabled>写真を保存</button><button id="lab-deletePhotoBtn" disabled>写真を削除</button><button id="labAgain">もういっかい</button><button id="labTop">トップへ戻る</button></div><dialog id="lab-photoDialog"><img id="lab-photoPreview" alt="撮影した写真の拡大"><p id="lab-photoCaption"></p><button id="lab-choosePhotoBtn">PHOTO GIFTに選ぶ</button><button id="lab-closePhotoBtn">閉じる</button></dialog>`;
    this.lab.root.querySelector(".lab-details").before(section);
    const hud = document.createElement("div");
    hud.className = "lab-growth-hud";
    hud.id = "labGrowthHud";
    hud.hidden = true;
    hud.innerHTML =
      '<strong id="labRemaining">30</strong><span>秒</span><progress id="labGrowth" max="1" value="0" aria-label="木の成長"></progress><span id="labInputStatus">入力待ち</span>';
    this.lab.stage.append(hud);
    for (const [key, label] of [
      ["bodySensitivity", "からだの感度"],
      ["leftSensitivity", "左手の感度"],
      ["rightSensitivity", "右手の感度"],
      ["weather", "気象の風"],
    ]) {
      const original = this.$("#lab-" + key);
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = original.cloneNode();
      input.id = "lab-primary-" + key;
      delete input.dataset.key;
      wrapper.append(input);
      this.$(".lab-primary").append(wrapper);
      input.oninput = () => {
        original.value = input.value;
        original.checked = input.checked;
        original.dispatchEvent(new Event("input"));
      };
    }
    this.$("#labStartPlay").onclick = () => this.start();
    this.$("#labPausePlay").onclick = () => {
      this.growth.setPaused(!this.growth.paused, performance.now());
      this.face.pause();
      this.sync(performance.now());
    };
    this.$("#labResetPlay").onclick = this.$("#labAgain").onclick = () =>
      this.reset();
    this.$("#labTop").onclick = () => this.lab.onExit();
    this.$("#labStopPhoto").onclick = () => this.stopPhotos();
    this.$("#labPlayCsv").onclick = () => this.downloadCsv();
    this.$("#labSmileThreshold").oninput = () => {
      this.$("#labSmileValue").value = this.$("#labSmileThreshold").value + "%";
      if (this.face?.gate)
        this.face.gate.threshold =
          Number(this.$("#labSmileThreshold").value) / 100;
    };
    for (const id of ["labPhotoConsent", "labSmileEnabled"])
      this.$("#" + id).onchange = () => {
        if (!this.$("#" + id).checked) this.stopPhotos();
      };
  }
  isActive() {
    const s = this.growth.snapshot();
    return (
      this.lab.mode !== "DOT" &&
      s.phase === "playing" &&
      !s.paused &&
      !s.waiting &&
      !document.hidden &&
      this.lab.cameraOn
    );
  }
  acceptInput(sample, time, source) {
    const valid =
      sample?.detected === true ||
      (!!sample?.body && sample.body.every(Number.isFinite));
    this.growth.heartbeat(time, { valid, source });
  }
  start() {
    const duration = validDuration(this.$("#labDuration").value);
    if (duration === null) {
      this.$("#labPlayStatus").textContent = "1〜60秒の整数を入力してください";
      return;
    }
    if (this.growth.phase === "playing") {
      this.growth.setPaused(false, performance.now());
      return;
    }
    this.reset(false);
    this.growth.start(performance.now(), duration);
    this.photos.start(crypto.randomUUID());
    this.finished = false;
    this.photoRequested =
      this.$("#labSmileEnabled").checked &&
      this.$("#labPhotoConsent").checked &&
      this.lab.cameraOn &&
      !this.lab.pc;
    this.$("#labPhotoStatus").textContent = this.photoRequested
      ? "笑顔撮影を準備しています…"
      : this.lab.pc
        ? "PC TEST：撮影なし"
        : "撮影OFFで遊びます";
    if (this.photoRequested)
      this.face.start(Number(this.$("#labSmileThreshold").value) / 100);
    this.sync(performance.now());
  }
  stopPhotos() {
    this.photoRequested = false;
    this.face.stop();
    this.$("#labPhotoStatus").textContent = "撮影を停止しました";
  }
  setMode(mode) {
    this.$("#labPlay").hidden = this.$("#labGrowthHud").hidden = mode === "DOT";
    this.growth.setHidden(mode === "DOT" || document.hidden, performance.now());
    this.face.pause();
    this.sync(performance.now());
  }
  sync(now) {
    if (this.lab.disposed) return;
    const state = this.growth.tick(now);
    if (state.phase === "finished" && !this.finished) {
      this.finished = true;
      this.face.stop();
      this.photoRequested = false;
      this.$("#labResult").hidden = false;
      this.photoUI.render();
      this.$("#labResultText").textContent =
        `${this.lab.mode} · ${state.durationSec}秒 · 成長 ${Math.round(state.growth * 100)}%`;
    }
    this.$("#labRemaining").textContent = state.remainingSec;
    this.$("#labGrowth").value = state.growth;
    this.$("#labStartPlay").disabled = state.phase === "finished";
    this.$("#labResult h2").textContent =
      this.lab.mode === "ART" ? "WIND / BODY / FIELD" : "風の木が育ったね！";
    this.$("#labPausePlay").disabled = state.phase !== "playing";
    this.$("#labPausePlay").textContent = state.paused
      ? "RESUME / つづける"
      : "PAUSE / ひとやすみ";
    this.$("#labInputStatus").textContent = state.waiting
      ? "からだが見える場所に戻ってね"
      : this.lab.pc
        ? "PC TEST"
        : this.lab.cameraOn && this.lab.avatar?.state === "DETECTED"
          ? "からだを見つけたよ"
          : "入力待ち";
    this.$("#labPlayStatus").textContent =
      state.phase === "finished"
        ? "木が育ちました！"
        : state.phase === "playing"
          ? state.paused
            ? "ひとやすみ中"
            : state.waiting
              ? "入力が戻ると成長を再開します"
              : `成長 ${Math.round(state.growth * 100)}%`
          : "STARTで木を育てよう";
    this.$("#labPlayCsv").disabled = this.rows.length === 0;
    this.$("#labStopPhoto").hidden = !this.face.enabled;
    this.$(".lab-play-setup").hidden = state.phase === "playing";
    if (state.phase === "playing" && now - (this.lastRow ?? -Infinity) >= 100) {
      this.lastRow = now;
      const e = this.lab.engine;
      if (this.rows.length >= 6000) this.rows.shift();
      this.rows.push({
        ...trackingSnapshot(e, this.lab.diagnostics, this.lab.avatar),
        elapsedSec: (state.elapsedMs / 1000).toFixed(3),
        configuredDurationSec: state.durationSec,
        growth: state.growth.toFixed(4),
        displayMode: this.lab.mode,
        inputSource: state.source,
        inputValid: !state.waiting,
        paused: state.paused,
        ...Object.fromEntries(
          ["weather", "body", "left", "right"].flatMap((k) =>
            (e.components?.[k] || [0, 0, 0]).map((v, i) => [
              k + "Wind" + "XYZ"[i],
              v.toFixed(4),
            ]),
          ),
        ),
      });
    }
    this.lab.modes?.update(state.growth, this.lab.engine.time);
  }
  result() {
    const s = this.growth.snapshot();
    return {
      displayMode: this.lab.mode,
      growth: s.growth,
      configuredDurationSec: s.durationSec,
      validElapsedTimeSec: s.elapsedMs / 1000,
    };
  }
  getSelectedGift() {
    return this.photos.getSelectedGift(this.result());
  }
  reset(clearConsent = true) {
    this.face?.stop();
    this.photoUI?.clear();
    this.growth.reset();
    this.rows = [];
    this.lastRow = null;
    this.finished = false;
    this.photoRequested = false;
    this.$("#labResult").hidden = true;
    if (clearConsent) {
      this.$("#labPhotoConsent").checked = false;
      this.$("#labPhotoStatus").textContent =
        "撮影は同意確認後に有効になります";
    }
    this.lab.mapper.resetAvatar();
    this.lab.avatar?.resetTracking();
    this.lab.engine?.reset();
    this.lab.field?.rebuild();
    this.lab.resumeGraphics?.();
    this.sync(performance.now());
  }
  downloadCsv() {
    if (!this.rows.length) return;
    const keys = Object.keys(this.rows[0]),
      csv = [
        keys.join(","),
        ...this.rows.map((row) => keys.map((k) => row[k]).join(",")),
      ].join("\n"),
      a = document.createElement("a"),
      url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.href = url;
    a.download = "wind-lab-" + this.photos.trialId + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  dispose() {
    clearInterval(this.timer);
    this.face.stop();
    this.photoUI.clear();
    this.growth.reset();
    this.rows = [];
  }
}
