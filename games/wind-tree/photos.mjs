const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export function smileScore(categories = []) {
  const get = (name) =>
    clamp(categories.find((c) => c.categoryName === name)?.score || 0);
  const left = get("mouthSmileLeft"),
    right = get("mouthSmileRight");
  // Mostly the mean, with a small allowance for asymmetric smiles. Not a probability.
  return clamp((0.75 * (left + right)) / 2 + 0.25 * Math.max(left, right));
}
export class SmileGate {
  constructor(threshold = 0.6) {
    this.threshold = threshold;
    this.reset();
  }
  reset() {
    this.score = 0;
    this.lastTime = null;
    this.aboveSince = null;
    this.lastCapture = -Infinity;
    this.armed = true;
  }
  update(rawScore, timeMs, detected = true) {
    const dt = this.lastTime === null ? 0 : Math.max(0, timeMs - this.lastTime),
      gap = dt > 400;
    this.lastTime = timeMs;
    if (!detected) {
      this.score *= Math.exp(-dt / 150);
      this.aboveSince = null;
      this.armed = true;
      return false;
    }
    if (gap) {
      this.score = 0;
      this.aboveSince = null;
      this.armed = true;
    }
    this.score +=
      (clamp(rawScore) - this.score) * (1 - Math.exp(-Math.max(1, dt) / 100));
    if (Math.abs(this.score - clamp(rawScore)) < 0.0005)
      this.score = clamp(rawScore);
    if (this.score < Math.max(0, this.threshold - 0.08)) {
      this.armed = true;
      this.aboveSince = null;
    }
    if (this.threshold === 0 && timeMs - this.lastCapture >= 2000)
      this.armed = true;
    if (this.score >= this.threshold && this.armed) {
      if (this.aboveSince === null) this.aboveSince = timeMs;
      if (
        timeMs - this.aboveSince >= 200 &&
        timeMs - this.lastCapture >= 2000
      ) {
        this.lastCapture = timeMs;
        this.armed = false;
        this.aboveSince = null;
        return true;
      }
    } else this.aboveSince = null;
    return false;
  }
}
export class PhotoSession {
  constructor(urls = URL) {
    this.urls = urls;
    this.photos = [];
    this.selectedId = null;
    this.trialId = null;
    this.serial = 0;
  }
  start(trialId) {
    this.clear();
    this.trialId = trialId;
  }
  add(blob, metadata, trialId) {
    if (trialId !== this.trialId || !blob?.size) return null;
    const quality = clamp(metadata.quality);
    if (this.photos.length >= 10) {
      const worst = this.photos.reduce((a, b) =>
        a.quality <= b.quality ? a : b,
      );
      if (quality <= worst.quality) return null;
      this.remove(worst.id);
    }
    const photo = {
      ...metadata,
      quality,
      blob,
      id: `photo-${++this.serial}`,
      url: this.urls.createObjectURL(blob),
    };
    this.photos.push(photo);
    return photo;
  }
  select(id) {
    this.selectedId = this.photos.some((p) => p.id === id) ? id : null;
  }
  remove(id) {
    const p = this.photos.find((p) => p.id === id);
    if (p) this.urls.revokeObjectURL(p.url);
    this.photos = this.photos.filter((p) => p.id !== id);
    if (this.selectedId === id) this.selectedId = null;
  }
  clear() {
    for (const p of this.photos) this.urls.revokeObjectURL(p.url);
    this.photos = [];
    this.selectedId = null;
    this.trialId = null;
  }
  getSelectedGift(result = {}) {
    const p = this.photos.find((p) => p.id === this.selectedId);
    return p
      ? {
          blob: p.blob,
          trialId: this.trialId,
          gameName: "kaze-ni-tatsu-body-tree",
          capturedAt: p.capturedAt,
          elapsedSec: p.elapsedSec,
          smileScore: p.smileScore,
          result: structuredClone(result),
        }
      : null;
  }
}
// Quality uses landmark completeness/face size and frame-to-frame stability;
// capture quality also adds a small image-sharpness term.
export function faceObservation(result, previous = null, elapsedMs = 125) {
  const points = result.faceLandmarks?.[0];
  if (!points?.length)
    return { detected: false, score: 0, quality: 0, center: null };
  const finite = points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (finite.length < points.length * 0.9)
    return { detected: false, score: 0, quality: 0, center: null };
  const xs = finite.map((p) => p.x),
    ys = finite.map((p) => p.y),
    minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    area = (maxX - minX) * (maxY - minY);
  const inside = minX >= 0 && maxX <= 1 && minY >= 0 && maxY <= 1;
  const stability = previous
    ? clamp(
        1 -
          Math.hypot(center.x - previous.x, center.y - previous.y) /
            (Math.max(0.01, elapsedMs / 1000) * 1.5),
      )
    : 1;
  return {
    detected: inside && area > 0.008,
    score: smileScore(result.faceBlendshapes?.[0]?.categories),
    quality: clamp(Math.min(1, area / 0.08) * 0.45 + stability * 0.55),
    center,
  };
}
export function mirroredFrame(
  video,
  maxSize = 960,
  createCanvas = () => document.createElement("canvas"),
  aspect = video.videoWidth / video.videoHeight,
) {
  if (!video.videoWidth || !video.videoHeight) return null;
  const canvas = createCanvas();
  // Center crop matches the cover-fitted preview, then mirror the saved frame.
  let sw = video.videoWidth,
    sh = video.videoHeight;
  if (sw / sh > aspect) sw = sh * aspect;
  else sh = sw / aspect;
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const ctx = canvas.getContext("2d");
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(
    video,
    (video.videoWidth - sw) / 2,
    (video.videoHeight - sh) / 2,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}
export function sharpness(canvas) {
  const small = document.createElement("canvas");
  small.width = 96;
  small.height = 72;
  const ctx = small.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 96, 72);
  const pixels = ctx.getImageData(0, 0, 96, 72).data;
  let total = 0;
  for (let y = 1; y < 71; y++)
    for (let x = 1; x < 95; x++) {
      const i = (y * 96 + x) * 4;
      total +=
        Math.abs(pixels[i] - pixels[i - 4]) +
        Math.abs(pixels[i] - pixels[i - 96 * 4]);
    }
  small.width = small.height = 0;
  return clamp(total / (70 * 94 * 40));
}
