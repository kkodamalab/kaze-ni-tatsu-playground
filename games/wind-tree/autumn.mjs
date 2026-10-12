// All interaction coordinates are CSS pixels in the mirrored, cover-cropped screen.
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function screenPoint(
  p,
  width,
  height,
  videoWidth = width,
  videoHeight = height,
) {
  const scale = Math.max(width / videoWidth, height / videoHeight);
  return {
    x: width - (p.x * videoWidth * scale + (width - videoWidth * scale) / 2),
    y: p.y * videoHeight * scale + (height - videoHeight * scale) / 2,
  };
}
export function screenAxis(shoulder, hip) {
  return (Math.atan2(shoulder.x - hip.x, hip.y - shoulder.y) * 180) / Math.PI;
}
export class HandWind {
  constructor() {
    this.reset();
  }
  reset() {
    this.previous = null;
    this.x = this.y = this.vx = this.vy = this.strength = 0;
    this.active = false;
  }
  update(point, seconds, confidence = 1, gain = 1) {
    const dt = clamp(seconds, 0.001, 0.25),
      alpha = 1 - Math.exp(-dt / 0.08);
    if (!point || confidence < 0.45) {
      this.previous = null;
      this.active = false;
      this.vx *= Math.exp(-dt / 0.12);
      this.vy *= Math.exp(-dt / 0.12);
      this.strength = 0;
      return;
    }
    this.x = point.x;
    this.y = point.y;
    this.active = true;
    let vx = 0,
      vy = 0;
    if (this.previous && seconds > 0 && seconds <= 0.25) {
      const dx = point.x - this.previous.x,
        dy = point.y - this.previous.y;
      // Ignore discontinuous detections; seed the next valid sample without a gust.
      if (Math.hypot(dx, dy) <= 180) {
        const speed = Math.hypot(dx, dy) / dt,
          limit = Math.min(1, 1200 / (speed || 1));
        vx = (dx / dt) * limit * clamp(gain, 0, 1);
        vy = (dy / dt) * limit * clamp(gain, 0, 1);
      } else {
        this.vx = this.vy = 0;
      }
    }
    this.previous = { ...point };
    this.vx += (vx - this.vx) * alpha;
    this.vy += (vy - this.vy) * alpha;
    this.strength = clamp(Math.hypot(this.vx, this.vy) / 900, 0, 1);
  }
}
export class AutumnLeaves {
  constructor(width, height, random = Math.random) {
    this.random = random;
    this.width = width;
    this.height = height;
    this.bodyWind = 0;
    this.leaves = [];
    this.reset();
  }
  makeLeaf(initial = false) {
    const r = this.random;
    return {
      x: r() * this.width,
      y: initial ? r() * this.height : -30 - r() * 80,
      vx: 0,
      vy: 25 + r() * 35,
      fall: 28 + r() * 38,
      phase: r() * Math.PI * 2,
      age: r() * 10,
      sway: 8 + r() * 16,
      rotation: r() * Math.PI * 2,
      spin: (r() - 0.5) * 3,
      size: 8 + r() * 10,
      color: ["#b84228", "#de761b", "#e9b72c", "#8b4e2d"][Math.floor(r() * 4)],
    };
  }
  reset() {
    this.bodyWind = 0;
    // Fixed bound: small screens use fewer leaves, never more than 64.
    this.leaves = Array.from(
      { length: clamp(Math.round((this.width * this.height) / 14000), 28, 64) },
      () => this.makeLeaf(true),
    );
  }
  resize(width, height) {
    for (const p of this.leaves) {
      p.x *= width / this.width;
      p.y *= height / this.height;
    }
    this.width = width;
    this.height = height;
  }
  update(seconds, axis, hands = [], gains = { body: 1, left: 1, right: 1 }) {
    const elapsed = clamp(seconds, 0, 0.25);
    const target =
      Math.abs(axis) <= 1.5 ? 0 : Math.sign(axis) * (Math.abs(axis) - 1.5) * 13;
    this.bodyWind +=
      (clamp(target * gains.body, -500, 500) - this.bodyWind) *
      (1 - Math.exp(-elapsed / 0.22));
    // Substeps keep drag and local forces stable when the frame rate falls.
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 60))),
      dt = elapsed / steps;
    const radius = clamp(Math.min(this.width, this.height) * 0.23, 90, 190);
    for (let s = 0; s < steps; s++)
      for (let i = 0; i < this.leaves.length; i++) {
        const p = this.leaves[i];
        p.age += dt;
        let ax =
          (this.bodyWind +
            7 +
            Math.sin(p.age * 1.7 + p.phase) * p.sway -
            p.vx) *
          2;
        let ay = 85 - p.vy * (85 / p.fall);
        for (const [index, hand] of hands.entries())
          if (hand.active) {
            const distance = Math.hypot(p.x - hand.x, p.y - hand.y);
            if (distance < radius) {
              const weight =
                (1 - distance / radius) ** 2 *
                (index === 0 ? gains.left : gains.right);
              ax += hand.vx * weight * 7;
              ay += hand.vy * weight * 7;
            }
          }
        p.vx = clamp(p.vx + ax * dt, -600, 600);
        p.vy = clamp(p.vy + ay * dt, -500, 300);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += (p.spin + p.vx * 0.003) * dt;
        if (
          p.y > this.height + 35 ||
          p.y < -180 ||
          p.x < -100 ||
          p.x > this.width + 100
        )
          this.leaves[i] = this.makeLeaf();
      }
  }
  draw(ctx, stride = 1) {
    for (let i = 0; i < this.leaves.length; i += stride) {
      const p = this.leaves[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(0.55 + Math.abs(Math.cos(p.age * 2 + p.phase)) * 0.45, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, -p.size);
      ctx.bezierCurveTo(
        p.size,
        -p.size * 0.4,
        p.size * 0.7,
        p.size * 0.6,
        0,
        p.size,
      );
      ctx.bezierCurveTo(
        -p.size * 0.7,
        p.size * 0.6,
        -p.size,
        -p.size * 0.4,
        0,
        -p.size,
      );
      ctx.fill();
      ctx.strokeStyle = "#633a25";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -p.size * 0.7);
      ctx.lineTo(0, p.size * 1.2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
