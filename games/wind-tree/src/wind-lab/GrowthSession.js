import { validDuration } from "../../trial.mjs";
// A heartbeat means valid input even when the participant is completely still.
// This module owns time only; the shared WindEngine owns all particle physics.
export class GrowthSession {
  constructor({ graceMs = 750 } = {}) {
    this.graceMs = graceMs;
    this.reset();
  }
  reset() {
    this.phase = "idle";
    this.elapsedMs = 0;
    this.durationSec = 30;
    this.lastNow = null;
    this.lastInput = null;
    this.paused = false;
    this.hidden = false;
    this.active = false;
    this.source = "none";
  }
  start(now, durationSec) {
    if (validDuration(durationSec) === null)
      throw new RangeError("プレイ時間は1〜60秒です");
    this.reset();
    this.phase = "playing";
    this.durationSec = durationSec;
    this.lastNow = now;
  }
  heartbeat(now, { valid, source = "pose" } = {}) {
    if (!Number.isFinite(now)) return;
    this.tick(now);
    if (valid) {
      this.lastInput = now;
      this.source = source;
    }
    this.active = !!valid;
  }
  tick(now) {
    if (!Number.isFinite(now)) return this.snapshot();
    const current = Math.max(now, this.lastNow ?? now),
      previous = this.lastNow ?? current;
    this.lastNow = current;
    let finishedNow = false;
    if (this.phase === "playing" && !this.paused && !this.hidden) {
      const until =
        this.lastInput === null
          ? previous
          : Math.min(current, this.lastInput + this.graceMs);
      this.elapsedMs = Math.min(
        this.durationSec * 1000,
        this.elapsedMs + Math.max(0, until - previous),
      );
      if (this.elapsedMs >= this.durationSec * 1000) {
        this.phase = "finished";
        finishedNow = true;
      }
    }
    return { ...this.snapshot(), finishedNow };
  }
  setPaused(paused, now) {
    this.tick(now);
    this.paused = paused;
  }
  setHidden(hidden, now) {
    this.tick(now);
    this.hidden = hidden;
    this.lastInput = null;
    this.active = false;
  }
  snapshot() {
    return {
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      durationSec: this.durationSec,
      growth: Math.max(
        0,
        Math.min(1, this.elapsedMs / (this.durationSec * 1000)),
      ),
      remainingSec: Math.ceil(
        Math.max(0, this.durationSec - this.elapsedMs / 1000),
      ),
      paused: this.paused,
      waiting:
        this.phase === "playing" &&
        (this.lastInput === null ||
          this.lastNow - this.lastInput > this.graceMs),
      source: this.source,
    };
  }
}
