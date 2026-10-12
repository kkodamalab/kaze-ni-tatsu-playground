import { SmileGate, mirroredFrame, sharpness } from "./photos.mjs";
export class FaceCapture {
  constructor({
    video,
    session,
    onStatus,
    onPhoto,
    getElapsed,
    isPlaying,
    getAspect = () => innerWidth / innerHeight,
    workerFactory = () =>
      new Worker(new URL("./face-worker.js", import.meta.url)),
  }) {
    Object.assign(this, {
      video,
      session,
      onStatus,
      onPhoto,
      getElapsed,
      isPlaying,
      workerFactory,
      getAspect,
    });
    this.generation = 0;
    this.worker = null;
    this.pendingCapture = false;
    this.enabled = false;
  }
  start(threshold) {
    this.stop();
    this.enabled = true;
    this.gate = new SmileGate(threshold);
    this.lastVideo = -1;
    const generation = this.generation;
    this.onStatus("笑顔モデルを読み込み中…（ゲームは続けられます）");
    try {
      this.worker = this.workerFactory();
      this.worker.onmessage = ({ data }) => {
        if (generation !== this.generation) return;
        if (data.type === "ready") {
          clearTimeout(this.loadTimeout);
          this.onStatus("笑顔を待っています");
          this.interval = setInterval(() => this.frame(), 125);
        }
        if (data.type === "error") this.fail(data.message);
        if (data.type === "result") {
          this.busy = false;
          clearTimeout(this.frameTimeout);
          if (!this.isPlaying()) return;
          const observation = data.observation;
          if (performance.now() - data.timestamp > 500) {
            this.gate.update(0, data.timestamp, false);
            this.onStatus("笑顔推定が遅れています。撮影を見送ります");
            return;
          }
          const shouldCapture = this.gate.update(
            observation.score,
            data.timestamp,
            observation.detected,
          );
          this.onStatus(
            observation.detected
              ? `笑顔スコア ${Math.round(this.gate.score * 100)}% · 写真 ${this.session.photos.length}/10`
              : "顔が見つかりません。顔をカメラに向けてね",
          );
          if (shouldCapture) this.capture(observation, generation);
        }
      };
      this.worker.onerror = () =>
        this.fail("笑顔推定を利用できません。撮影なしでゲームを続けます。");
      this.loadTimeout = setTimeout(
        () =>
          this.fail(
            "笑顔モデルの読み込みがタイムアウトしました。撮影なしでゲームを続けます。",
          ),
        20000,
      );
      this.worker.postMessage({ type: "init" });
    } catch {
      this.fail(
        "この端末では笑顔推定を利用できません。撮影なしでゲームを続けます。",
      );
    }
  }
  async frame() {
    if (
      !this.enabled ||
      this.busy ||
      !this.isPlaying() ||
      this.video.readyState < 2 ||
      this.video.currentTime === this.lastVideo
    )
      return;
    this.lastVideo = this.video.currentTime;
    this.busy = true;
    const generation = this.generation;
    try {
      const scale = Math.min(
        1,
        640 / Math.max(this.video.videoWidth, this.video.videoHeight),
      );
      const bitmap = await createImageBitmap(this.video, {
        resizeWidth: Math.round(this.video.videoWidth * scale),
        resizeHeight: Math.round(this.video.videoHeight * scale),
        resizeQuality: "low",
      });
      if (generation !== this.generation || !this.isPlaying()) {
        bitmap.close();
        if (generation === this.generation) this.busy = false;
        return;
      }
      this.worker.postMessage(
        { type: "frame", bitmap, timestamp: performance.now() },
        [bitmap],
      );
      this.frameTimeout = setTimeout(
        () =>
          this.fail("笑顔推定の応答がありません。撮影なしでゲームを続けます。"),
        4000,
      );
    } catch {
      if (generation === this.generation)
        this.fail("カメラ画像を読み取れません。撮影なしでゲームを続けます。");
    }
  }
  async capture(observation, generation = this.generation) {
    if (
      !this.enabled ||
      this.pendingCapture ||
      !this.isPlaying() ||
      !observation.detected
    )
      return;
    this.pendingCapture = true;
    const trialId = this.session.trialId,
      elapsedSec = this.getElapsed() / 1000,
      capturedAt = new Date().toISOString();
    let canvas;
    try {
      canvas = mirroredFrame(this.video, 960, undefined, this.getAspect());
      if (!canvas) return;
      const quality =
          0.5 * this.gate.score +
          0.35 * observation.quality +
          0.15 * sharpness(canvas),
        smileScore = this.gate.score;
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.82),
      );
      if (generation !== this.generation || !this.enabled || !this.isPlaying())
        return;
      if (
        this.session.add(
          blob,
          { elapsedSec, capturedAt, smileScore, quality },
          trialId,
        )
      )
        this.onPhoto();
    } catch {
      if (generation === this.generation)
        this.onStatus("写真を撮れませんでした。ゲームは続けられます。");
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
      if (generation === this.generation) this.pendingCapture = false;
    }
  }
  pause() {
    if (this.gate) {
      const lastCapture = this.gate.lastCapture;
      this.gate.reset();
      this.gate.lastCapture = lastCapture;
    }
  }
  fail(message) {
    this.stop();
    this.onStatus(message);
  }
  stop() {
    this.generation++;
    this.enabled = false;
    this.busy = false;
    this.pendingCapture = false;
    clearInterval(this.interval);
    clearTimeout(this.loadTimeout);
    clearTimeout(this.frameTimeout);
    this.worker?.terminate();
    this.worker = null;
    this.gate?.reset();
  }
}
