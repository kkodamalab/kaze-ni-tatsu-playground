import { sanitizeConfig, SPACE_SIZE } from "./WindConfig.js";
import { BodyWind } from "./BodyWind.js";
import { HandWind } from "./HandWind.js";
import { WeatherWind } from "./WeatherWind.js";
import { zero } from "./CoordinateMapper.js";
export class WindEngine {
  constructor(config = {}, weather = new WeatherWind()) {
    this.config = sanitizeConfig(config);
    this.weather = weather;
    this.body = new BodyWind();
    this.left = new HandWind("left");
    this.right = new HandWind("right");
    this.maxSpeed = 25;
    this.damping = 6;
    this.inputTime = null;
    this.reset();
  }
  reset() {
    const c = this.config;
    this.count = c.gridX * c.gridY * c.gridZ;
    this.positions = new Float32Array(this.count * 3);
    this.velocities = new Float32Array(this.count * 3);
    let i = 0;
    for (let x = 0; x < c.gridX; x++)
      for (let y = 0; y < c.gridY; y++)
        for (let z = 0; z < c.gridZ; z++) {
          this.positions[i++] = (x / (c.gridX - 1) - 0.5) * SPACE_SIZE * 0.9;
          this.positions[i++] = (y / (c.gridY - 1) - 0.5) * SPACE_SIZE * 0.9;
          this.positions[i++] = (z / (c.gridZ - 1) - 0.5) * SPACE_SIZE * 0.9;
        }
    this.generations = new Uint32Array(this.count);
    this.recycleVersion = 0;
    this.time = 0;
    this.motionWindow = [];
    this.motion = {
      meanSpeed: 0,
      meanDisplacement: 0,
      displacement1s: 0,
      leftCount: 0,
      rightCount: 0,
      appliedWindMagnitude: 0,
    };
  }
  configure(config) {
    const old = this.config;
    this.config = sanitizeConfig(config);
    if (["gridX", "gridY", "gridZ"].some((k) => old[k] !== this.config[k]))
      this.reset();
  }
  // Both MediaPipe and PC TEST use this timestamped position/axis sample contract.
  input(sample, time) {
    if (
      !Number.isFinite(time) ||
      (this.inputTime !== null && time <= this.inputTime)
    )
      return;
    const dt = this.inputTime === null ? 0 : (time - this.inputTime) / 1000;
    this.inputTime = time;
    if (sample?.rebase) {
      this.left.previous = this.right.previous = null;
      this.body.previous = null;
    }
    this.body.input(sample?.body, dt);
    this.left.input(sample?.left, dt, this.config, sample?.handVelocityScale);
    this.right.input(sample?.right, dt, this.config, sample?.handVelocityScale);
  }
  suspend() {
    this.inputTime = null;
    this.input(null, 0);
    this.inputTime = null;
  }
  step(elapsed) {
    if (!Number.isFinite(elapsed) || elapsed <= 0) return;
    let remaining = Math.min(elapsed, 0.1);
    let frameDistance = 0;
    while (remaining > 1e-8) {
      const dt = Math.min(remaining, 1 / 60);
      this.integrate(dt);
      frameDistance += this.motion.meanDisplacement;
      remaining -= dt;
    }
    this.motion.meanDisplacement = frameDistance;
  }
  integrate(dt) {
    const c = this.config,
      w = this.weather.update(dt, c),
      b = this.body.update(dt, c);
    this.left.update(dt, c);
    this.right.update(dt, c);
    this.components = {
      ambient: this.ambientAt(0, 0, 0),
      weather: w,
      body: [...b],
      left: [...this.left.velocity],
      right: [...this.right.velocity],
    };
    const l = zero(),
      r = zero(),
      target = zero(),
      a = 1 - Math.exp(-this.damping * dt);
    const p = this.positions,
      v = this.velocities;
    let sumSpeed = 0,
      sumDistance = 0,
      sumWind = 0,
      leftCount = 0,
      rightCount = 0;
    const radius2 = ((SPACE_SIZE * c.handRadius) / 100) ** 2;
    for (let j = 0; j < p.length; j += 3) {
      this.left.at(p[j], p[j + 1], p[j + 2], c, l);
      this.right.at(p[j], p[j + 1], p[j + 2], c, r);
      for (let k = 0; k < 3; k++)
        target[k] =
          ((this.ambientAt(p[j], p[j + 1], p[j + 2], k) +
            w[k] +
            b[k] +
            l[k] +
            r[k]) *
            c.speed) /
          100;
      const lp = this.left.position,
        rp = this.right.position;
      if (
        c.left &&
        lp &&
        (p[j] - lp[0]) ** 2 +
          (p[j + 1] - lp[1]) ** 2 +
          (p[j + 2] - lp[2]) ** 2 <=
          radius2
      )
        leftCount++;
      if (
        c.right &&
        rp &&
        (p[j] - rp[0]) ** 2 +
          (p[j + 1] - rp[1]) ** 2 +
          (p[j + 2] - rp[2]) ** 2 <=
          radius2
      )
        rightCount++;
      const magnitude = Math.hypot(...target),
        scale = magnitude > this.maxSpeed ? this.maxSpeed / magnitude : 1;
      for (let k = 0; k < 3; k++)
        v[j + k] += (target[k] * scale - v[j + k]) * a;
      const speed = Math.hypot(v[j], v[j + 1], v[j + 2]);
      if (speed > this.maxSpeed)
        for (let k = 0; k < 3; k++) v[j + k] *= this.maxSpeed / speed;
      sumSpeed += Math.min(speed, this.maxSpeed);
      sumWind += Math.min(magnitude, this.maxSpeed);
      let distance2 = 0,
        crossed = 0;
      for (let k = 0; k < 3; k++) {
        const before = p[j + k];
        p[j + k] += v[j + k] * dt;
        distance2 += (p[j + k] - before) ** 2;
        if (p[j + k] < -SPACE_SIZE / 2 || p[j + k] >= SPACE_SIZE / 2)
          crossed |= 1 << k;
      }
      if (crossed) {
        for (let k = 0; k < 3; k++)
          p[j + k] =
            crossed & (1 << k)
              ? ((((p[j + k] + SPACE_SIZE / 2) % SPACE_SIZE) + SPACE_SIZE) %
                  SPACE_SIZE) -
                SPACE_SIZE / 2
              : (Math.random() - 0.5) * SPACE_SIZE;
        this.generations[j / 3]++;
        this.recycleVersion++;
      }
      sumDistance += Math.sqrt(distance2);
    }
    this.time += dt;
    const distance = sumDistance / this.count;
    this.motionWindow.push({ time: this.time, dt, distance });
    while (this.motionWindow[0]?.time <= this.time - 1)
      this.motionWindow.shift();
    const displacement1s = this.motionWindow.reduce(
      (sum, entry) =>
        sum +
        entry.distance *
          Math.min(1, Math.max(0, (entry.time - (this.time - 1)) / entry.dt)),
      0,
    );
    this.motion = {
      meanSpeed: sumSpeed / this.count,
      meanDisplacement: distance,
      displacement1s,
      leftCount,
      rightCount,
      appliedWindMagnitude: sumWind / this.count,
    };
  }
  ambientAt(x, y, z, axis) {
    const c = this.config,
      a = c.ambient ? (0.7 * c.ambientSpeed) / 100 : 0;
    if (axis === undefined)
      return [
        this.ambientAt(x, y, z, 0),
        this.ambientAt(x, y, z, 1),
        this.ambientAt(x, y, z, 2),
      ];
    if (!a) return 0;
    if (axis === 1)
      return c.verticalFlow === "DOWN" ? -a : c.verticalFlow === "UP" ? a : 0;
    return (
      ((a * c.drift) / 100) *
      0.5 *
      (axis === 0
        ? Math.sin(this.time * 0.45 + z * 0.23 + y * 0.17)
        : Math.cos(this.time * 0.37 + x * 0.19 - y * 0.11))
    );
  }
  dispose() {
    this.weather.dispose();
    this.suspend();
    this.positions = new Float32Array();
    this.velocities = new Float32Array();
  }
}
