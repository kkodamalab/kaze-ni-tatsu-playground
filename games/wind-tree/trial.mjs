export const validDuration = (value) => {
  const number = Number(value);
  return String(value).trim() !== "" &&
    Number.isInteger(number) &&
    number >= 1 &&
    number <= 60
    ? number
    : null;
};
export const sensitivityGain = (percent) =>
  3 * (Math.max(0, Math.min(100, Number(percent) || 0)) / 100) ** 1.4;
export function restoreSensitivities(storage) {
  const defaults = { body: 70, left: 70, right: 70 };
  try {
    const saved = JSON.parse(storage.getItem("windTreeSensitivities"));
    for (const key of Object.keys(defaults))
      if (Number.isFinite(saved?.[key]))
        defaults[key] = Math.round(Math.max(0, Math.min(100, saved[key])));
  } catch {
    /* Storage may be unavailable on private/shared browsers. */
  }
  return defaults;
}
export class TrialClock {
  constructor() {
    this.reset();
  }
  reset() {
    this.phase = "idle";
    this.elapsedMs = 0;
    this.countdownMs = 0;
    this.paused = false;
    this.lastNow = null;
    this.durationSec = 30;
  }
  start(now, durationSec) {
    if (validDuration(durationSec) === null)
      throw new RangeError("プレイ時間は1〜60秒の整数にしてください");
    this.reset();
    this.phase = "countdown";
    this.durationSec = durationSec;
    this.lastNow = now;
  }
  tick(now) {
    const current = Math.max(now, this.lastNow ?? now);
    let delta = this.lastNow === null ? 0 : current - this.lastNow;
    this.lastNow = current;
    let finishedNow = false;
    if (!this.paused && this.phase === "countdown") {
      const used = Math.min(delta, 3000 - this.countdownMs);
      this.countdownMs += used;
      delta -= used;
      if (this.countdownMs >= 3000) this.phase = "playing";
    }
    if (!this.paused && this.phase === "playing") {
      this.elapsedMs = Math.min(
        this.durationSec * 1000,
        this.elapsedMs + delta,
      );
      if (this.elapsedMs >= this.durationSec * 1000) {
        this.phase = "finished";
        finishedNow = true;
      }
    }
    return { ...this.snapshot(), finishedNow };
  }
  setPaused(paused, now) {
    const state = this.tick(now);
    this.paused = paused;
    return state;
  }
  snapshot() {
    return {
      phase: this.phase,
      paused: this.paused,
      elapsedMs: this.elapsedMs,
      durationSec: this.durationSec,
      remainingSec: Math.ceil(
        Math.max(0, this.durationSec - this.elapsedMs / 1000),
      ),
      countdown: Math.max(0, Math.ceil(3 - this.countdownMs / 1000)),
    };
  }
}
