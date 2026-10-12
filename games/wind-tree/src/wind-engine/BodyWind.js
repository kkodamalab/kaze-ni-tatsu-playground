import { zero, clamp } from "./CoordinateMapper.js";
export class BodyWind {
  constructor() {
    this.value = zero();
    this.neutral = zero();
    this.raw = null;
    this.previous = null;
    this.rate = zero();
    this.age = Infinity;
    this.calibrated = false;
    this.rejected = 0;
    this.jumpCandidate = null;
    this.jumpCount = 0;
  }
  input(axis, dt) {
    if (axis?.length === 3 && axis.every(Number.isFinite)) {
      const next = axis.map((v) => clamp(v, -1, 1));
      if (
        this.previous &&
        dt > 0 &&
        dt <= 0.25 &&
        Math.hypot(...next.map((v, i) => v - this.previous[i])) > 0.65
      ) {
        this.rejected++;
        this.jumpCount =
          this.jumpCandidate &&
          Math.hypot(...next.map((v, i) => v - this.jumpCandidate[i])) < 0.1
            ? this.jumpCount + 1
            : 1;
        this.jumpCandidate = next;
        if (this.jumpCount < 3) {
          this.rate = zero();
          return;
        }
        this.previous = null;
      }
      this.jumpCount = 0;
      this.jumpCandidate = null;
      this.raw = next;
      this.rate = this.raw.map((v, i) =>
        dt > 0 && dt <= 0.25 && this.previous
          ? clamp((v - this.previous[i]) / dt, -3, 3)
          : 0,
      );
      this.previous = [...this.raw];
      this.age = 0;
    } else {
      this.raw = null;
      this.previous = null;
      this.rate = zero();
      this.age = Infinity;
    }
  }
  calibrate() {
    if (this.raw) {
      this.calibrated = true;
      this.neutral = [...this.raw];
      this.previous = [...this.raw];
      this.rate = zero();
      this.value = zero();
      return true;
    }
    return false;
  }
  update(dt, c) {
    this.age += dt;
    const active = c.body && this.raw && this.age <= 0.25;
    const a = 1 - Math.exp(-dt / (0.02 + (c.bodySmoothing / 100) * 0.6));
    for (let i = 0; i < 3; i++) {
      const angle = Math.atan(this.raw?.[i] || 0) - Math.atan(this.neutral[i]);
      const dead = ((c.bodyDeadZone || 0) * Math.PI) / 180;
      const outside = Math.abs(angle) > dead;
      const tilt = outside
        ? clamp(Math.tan(Math.sign(angle) * (Math.abs(angle) - dead)), -2, 2)
        : 0;
      const target =
        active && outside
          ? ((tilt * 5 + this.rate[i] * 0.35) * c.bodySensitivity) / 100
          : 0;
      this.value[i] += (target - this.value[i]) * a;
    }
    if (!c.body || c.bodySensitivity === 0) this.value.fill(0);
    return this.value;
  }
}
