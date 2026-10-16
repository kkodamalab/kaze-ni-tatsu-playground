import { PhotoSession } from "./photos.mjs";
import { SharedSmileCapture } from "./smile-capture.mjs";
import { photoSettings } from "./photo-settings.js";
// Borrows the game's video when available; only the host may request a separate camera.
export class SharedCaptureSession {
  constructor({ settingsUI, isPlaying, getElapsed, onPhoto = () => {} }) {
    Object.assign(this, { settingsUI, isPlaying, getElapsed, onPhoto });
    this.photos = new PhotoSession(URL, { gameName: "シーソーゲーム" });
    this.generation = 0;
  }
  async begin(video = null, { reset = true } = {}) {
    if (!reset && this.starting) return;
    if (reset) {
      this.clear();
      this.photos.start(crypto.randomUUID());
    } else this.stop();
    this.photos.maxPhotos = photoSettings.value.maxPhotos;
    if (!photoSettings.value.enabled || !this.settingsUI.hasConsent()) return;
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
          !photoSettings.value.enabled
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
      this.face = new SharedSmileCapture({
        video,
        session: this.photos,
        hasConsent: () =>
          this.settingsUI.hasConsent() && photoSettings.value.enabled,
        onStatus: this.settingsUI.status,
        onPhoto: () => {
          this.onPhoto();
          if (this.photos.photos.length >= this.photos.maxPhotos)
            queueMicrotask(() => {
              if (generation === this.generation) this.stop();
            });
        },
        onFailure: () => {
          if (generation === this.generation) this.stop();
        },
        getElapsed: this.getElapsed,
        isPlaying: this.isPlaying,
        getAspect: () => video.videoWidth / video.videoHeight,
      });
      this.face.start(photoSettings.value.threshold / 100, {
        holdMs: photoSettings.value.holdSeconds * 1000,
        cooldownMs: photoSettings.value.cooldownSeconds * 1000,
        faceFps: photoSettings.value.faceFps,
      });
      if (this.face?.gate)
        this.face.gate.lastCapture = this.lastCapture ?? -Infinity;
    } catch {
      if (generation !== this.generation) return;
      this.stop();
      this.settingsUI.status("カメラを使えません。撮影OFFでゲームを続けます。");
    } finally {
      if (generation === this.generation) this.starting = false;
    }
  }
  stop() {
    this.starting = false;
    this.lastCapture =
      this.face?.gate?.lastCapture ?? this.lastCapture ?? -Infinity;
    this.generation++;
    this.face?.stop();
    this.face = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.ownedVideo) {
      this.ownedVideo.srcObject = null;
      this.ownedVideo.remove();
      this.ownedVideo = null;
    }
  }
  clear() {
    this.stop();
    this.lastCapture = -Infinity;
    this.photos.clear();
  }
  pause() {
    this.face?.pause();
  }
}
