import { PhotoSession } from "./photos.mjs?v=seesaw-counted-capture";
import { SharedSmileCapture } from "./smile-capture.mjs?v=seesaw-counted-capture";
import { ScheduledCapture } from "./scheduled-capture.js?v=seesaw-counted-capture";
import { photoSettings } from "./photo-settings.js?v=seesaw-counted-capture";

// Seesaw host capture: one camera, independent scheduled/smile allowances.
export class SharedCaptureSession {
  constructor({ settingsUI, isPlaying, getElapsed, onPhoto = () => {} }) {
    Object.assign(this, { settingsUI, isPlaying, getElapsed, onPhoto });
    this.photos = new PhotoSession(URL, { gameName: "シーソーゲーム" });
    this.generation = 0;
    this.active = false;
    this.faceFailed = false;
  }
  enabled() {
    return photoSettings.value.scheduledEnabled || photoSettings.value.enabled;
  }
  status(message = "") {
    this.settingsUI.status(
      `${message} · 定時 ${this.photos.count("scheduled")}/${this.schedule?.times.length ?? photoSettings.value.scheduledCount}枚 · 笑顔 ${this.photos.count()}/${this.photos.maxPhotos}枚`,
    );
  }
  async begin(video = null, { reset = true, duration = 30 } = {}) {
    if (reset) {
      this.clear();
      this.photos.start(crypto.randomUUID());
      this.duration = duration;
      this.schedule = new ScheduledCapture({
        duration,
        count: photoSettings.value.scheduledCount,
        session: this.photos,
        getVideo: () =>
          this.video?.srcObject
            ?.getVideoTracks()
            .some((t) => t.readyState === "live")
            ? this.video
            : null,
        hasConsent: () => this.settingsUI.hasConsent(),
        isPlaying: this.isPlaying,
        isEnabled: () => photoSettings.value.scheduledEnabled,
        onPhoto: (photo) => {
          this.onPhoto(photo);
          this.status("定時撮影しました");
        },
        onError: (detail) => {
          console.warn("Scheduled capture failed", detail);
          this.status(`定時撮影を見送りました：${detail.reason}`);
        },
      });
    }
    this.photos.maxPhotos = photoSettings.value.maxPhotos;
    if (this.starting) return;
    if (this.active) {
      this.configure();
      return;
    }
    if (!this.enabled() || !this.settingsUI.hasConsent()) return;
    this.starting = true;
    const generation = this.generation;
    try {
      if (
        !video?.srcObject?.getVideoTracks().some((t) => t.readyState === "live")
      ) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
        if (
          generation !== this.generation ||
          !this.settingsUI.hasConsent() ||
          !this.enabled()
        ) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        this.stream = stream;
        video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        video.className = "shared-camera-preview";
        this.settingsUI.consent.closest("fieldset").append(video);
        this.ownedVideo = video;
        await video.play();
      }
      if (generation !== this.generation) return;
      this.video = video;
      this.active = true;
      this.configure();
      this.status("カメラ準備OK");
    } catch (error) {
      if (generation !== this.generation) return;
      console.warn("Host photo camera unavailable", error);
      this.releaseCamera();
      this.settingsUI.status(
        "カメラを使えません。撮影なしでゲームを続けます。",
      );
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }
  configure() {
    const value = photoSettings.value;
    this.photos.maxPhotos = value.maxPhotos;
    if (!this.settingsUI.hasConsent() || !this.enabled()) {
      this.releaseCamera();
      return;
    }
    if (!value.enabled) this.stopFace();
    else if (this.face?.enabled) this.face.configure(value);
    else if (this.active && !this.faceFailed && this.photos.canAdd()) {
      const generation = this.generation;
      this.face = new SharedSmileCapture({
        video: this.video,
        session: this.photos,
        hasConsent: () =>
          this.settingsUI.hasConsent() && photoSettings.value.enabled,
        onStatus: (message) => this.status(message),
        getElapsed: this.getElapsed,
        isPlaying: this.isPlaying,
        getAspect: () => this.video.videoWidth / this.video.videoHeight,
        onPhoto: () => {
          this.onPhoto();
          this.status("笑顔撮影しました");
          if (!this.photos.canAdd() && !photoSettings.value.scheduledEnabled)
            queueMicrotask(() => {
              if (generation === this.generation) this.releaseCamera();
            });
        },
        onFailure: () => {
          this.faceFailed = true;
          if (!photoSettings.value.scheduledEnabled) this.releaseCamera();
        },
      });
      this.face.start(value.threshold / 100, {
        holdMs: value.holdSeconds * 1000,
        cooldownMs: value.cooldownSeconds * 1000,
        faceFps: value.faceFps,
      });
      if (this.face?.gate)
        this.face.gate.lastCapture = this.lastCapture ?? -Infinity;
    }
  }
  tick(elapsed) {
    this.schedule?.advance(elapsed);
  }
  async finish(elapsed) {
    // Reserve/snapshot the last due slot before terminating the camera or changing screens.
    this.tick(elapsed);
    this.stopFace();
    await this.schedule?.finish(elapsed);
    this.releaseCamera();
  }
  stopFace() {
    this.lastCapture =
      this.face?.gate?.lastCapture ?? this.lastCapture ?? -Infinity;
    this.face?.stop();
    this.face = null;
  }
  releaseCamera() {
    this.starting = false;
    this.generation++;
    this.schedule?.invalidate();
    this.stopFace();
    this.active = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ownedVideo) {
      this.ownedVideo.srcObject = null;
      this.ownedVideo.remove();
      this.ownedVideo = null;
    }
    this.video = null;
  }
  stop() {
    this.schedule?.cancel();
    this.releaseCamera();
  }
  clear() {
    this.stop();
    this.schedule = null;
    this.lastCapture = -Infinity;
    this.faceFailed = false;
    this.photos.clear();
  }
  pause() {
    this.face?.pause();
  }
}
