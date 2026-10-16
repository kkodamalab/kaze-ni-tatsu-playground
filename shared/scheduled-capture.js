import { mirroredFrame } from "./photos.mjs?v=seesaw-timed-capture";

export function captureTimes(duration, count = 4) {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  count = Math.max(1, Math.min(10, Math.round(count)));
  return Array.from({ length: count }, (_, i) => (duration * (i + 1)) / count);
}

// No wall-clock timer: only the game's active elapsed seconds advance the schedule.
export class ScheduledCapture {
  constructor({
    duration,
    count = 4,
    session,
    getVideo,
    hasConsent,
    isPlaying,
    isEnabled,
    onPhoto = () => {},
    onError = (detail) => console.warn("Scheduled capture failed", detail),
    createFrame = (video) =>
      video?.readyState >= 2 ? mirroredFrame(video, 960) : null,
  }) {
    Object.assign(this, {
      session,
      getVideo,
      hasConsent,
      isPlaying,
      isEnabled,
      onPhoto,
      onError,
      createFrame,
    });
    this.times = captureTimes(duration, count);
    this.next = 0;
    this.pending = new Set();
    this.encodings = new Set();
    this.generation = 0;
    this.closed = false;
    this.session.scheduledLimit = this.times.length;
  }
  advance(elapsed) {
    if (this.closed || !this.isPlaying()) return;
    while (
      this.next < this.times.length &&
      elapsed + 1e-8 >= this.times[this.next]
    ) {
      const index = this.next++;
      // Disabled/missing-consent opportunities are skipped, never backfilled on re-enable.
      if (!this.isEnabled() || !this.hasConsent()) continue;
      const pending = this.take(index, elapsed);
      this.pending.add(pending);
      pending.finally(() => this.pending.delete(pending));
    }
  }
  async take(index, elapsed) {
    const generation = this.generation,
      trialId = this.session.trialId;
    const valid = () =>
      generation === this.generation &&
      this.hasConsent() &&
      this.isEnabled() &&
      trialId === this.session.trialId;
    let canvas;
    try {
      if (!valid()) return;
      canvas = this.createFrame(this.getVideo()); // Snapshot now, before the final camera stop.
      if (!canvas) throw Error("camera frame is not ready");
      let blob;
      for (let attempt = 1; attempt <= 2 && valid(); attempt++) {
        blob = await new Promise((resolve) => {
          const done = (value) => {
            clearTimeout(timeout);
            this.encodings.delete(done);
            resolve(value);
          };
          const timeout = setTimeout(() => done(null), 2000);
          this.encodings.add(done);
          try {
            canvas.toBlob(done, "image/jpeg", 0.82);
          } catch {
            done(null);
          }
        });
        if (blob?.size) break;
        this.onError({
          slot: index + 1,
          scheduledSec: this.times[index],
          attempt,
          reason: "JPEG encoding returned no image",
        });
      }
      if (!valid()) return;
      if (!blob?.size) throw Error("JPEG encoding failed after bounded retry");
      const photo = this.session.add(
        blob,
        {
          reason: "scheduled",
          scheduledSlot: index + 1,
          scheduledSec: this.times[index],
          elapsedSec: elapsed,
          capturedAt: new Date().toISOString(),
          quality: 1,
        },
        trialId,
      );
      if (photo) this.onPhoto(photo);
    } catch (error) {
      if (valid())
        this.onError({
          slot: index + 1,
          scheduledSec: this.times[index],
          reason: error.message,
        });
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
    }
  }
  async finish(elapsed) {
    this.advance(elapsed);
    this.closed = true; // Cancels future slots, allows already-snapped frames to finish encoding.
    await Promise.allSettled([...this.pending]);
  }
  invalidate() {
    this.generation++;
    for (const done of this.encodings) done(null);
  }
  cancel() {
    this.closed = true;
    this.invalidate();
  }
}
