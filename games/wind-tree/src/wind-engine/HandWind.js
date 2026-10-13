import { zero, clamp } from "./CoordinateMapper.js";
import { SPACE_SIZE } from "./WindConfig.js";
export class HandWind {
  constructor(side) {
    this.side = side;
    this.position = null;
    this.previous = null;
    this.velocity = zero();
    this.target = zero();
    this.age = Infinity;
    this.rejected = 0;
    this.jumpCandidate = null;
    this.jumpCount = 0;
  }
  input(
    position,
    dt,
    c = { handSmoothing: 30, handSpeedThreshold: 0.15 },
    velocityScale = 1,
  ) {
    velocityScale =
      Number.isFinite(velocityScale) && velocityScale > 0 ? velocityScale : 1;
    if (
      !position?.length ||
      position.length !== 3 ||
      !position.every(Number.isFinite)
    ) {
      this.target = zero();
      this.wristSpeed = 0;
      return;
    }
    // Use time since this hand was last accepted, including short missing samples.
    if (dt > 0 && Number.isFinite(this.age))
      dt = Math.max(dt, Math.min(this.age, 1));
    const raw = position.map((v) => clamp(v, -SPACE_SIZE / 2, SPACE_SIZE / 2));
    let fresh = !this.previous || this.age > 1 || dt <= 0 || dt > 1;
    if (
      !fresh &&
      Math.hypot(...raw.map((v, i) => v - this.previous[i])) / velocityScale >
        Math.max(1.5, Math.min(dt, 0.25) * 40)
    ) {
      this.rejected++;
      this.jumpCount =
        this.jumpCandidate &&
        Math.hypot(...raw.map((v, i) => v - this.jumpCandidate[i])) <
          0.3 * velocityScale
          ? this.jumpCount + 1
          : 1;
      this.jumpCandidate = raw;
      if (this.jumpCount < 3) {
        this.target = zero();
        return;
      }
      fresh = true;
    }
    this.jumpCount = 0;
    this.jumpCandidate = null;
    const alpha =
      fresh || c.handSmoothing === 0
        ? 1
        : 1 - Math.exp(-dt / (0.02 + (c.handSmoothing ?? 30) * 0.0015));
    const old = this.position;
    this.position = raw.map((v, i) =>
      fresh ? v : old[i] + (v - old[i]) * alpha,
    );
    let target = this.position.map((v, i) => (fresh ? 0 : (v - old[i]) / dt));
    this.wristSpeed = Math.hypot(...target);
    target = target.map((v) => v / velocityScale);
    const speed = Math.hypot(...target);
    if (speed < (c.handSpeedThreshold ?? 0.15)) target = zero();
    else if (speed > 20) target = target.map((v) => (v * 20) / speed);
    if (!fresh) {
      const change = Math.hypot(...target.map((v, i) => v - this.target[i])),
        limit = 80 * dt;
      if (change > limit)
        target = target.map(
          (v, i) => this.target[i] + ((v - this.target[i]) * limit) / change,
        );
    }
    this.target = target;
    this.previous = raw;
    this.age = 0;
    if (fresh) this.velocity.fill(0);
  }
  update(dt, c) {
    this.age += dt;
    if (this.age > 0.25) this.wristSpeed = 0;
    const active = c[this.side] && this.age <= 0.25;
    const alpha =
      1 - Math.exp(-dt / (0.02 + (c.handSmoothing ?? 30) * 0.00333));
    this.velocity = this.velocity.map(
      (v, i) => v + ((active ? this.target[i] : 0) - v) * alpha,
    );
    if (!c[this.side] || c[this.side + "Sensitivity"] === 0)
      this.velocity.fill(0);
  }
  at(x, y, z, c, out = zero()) {
    out.fill(0);
    if (!this.position || !c[this.side]) return out;
    const radius = (SPACE_SIZE * c.handRadius) / 100,
      r2 =
        (x - this.position[0]) ** 2 +
        (y - this.position[1]) ** 2 +
        (z - this.position[2]) ** 2;
    if (r2 > radius * radius) return out;
    const weight =
      ((Math.exp(-r2 / (2 * (radius / 2) ** 2)) *
        c[this.side + "Sensitivity"]) /
        100) *
      ((c.handGain ?? 100) / 100);
    for (let i = 0; i < 3; i++) out[i] = this.velocity[i] * weight;
    return out;
  }
}
