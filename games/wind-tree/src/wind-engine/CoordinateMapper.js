import { SPACE_SIZE } from "./WindConfig.js";
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const zero = () => [0, 0, 0];
export function windFromBearing(direction, speed, gain = 1) {
  const r = (direction * Math.PI) / 180; // +X east, +Y up, -Z north. Meteorological FROM -> motion TO.
  return [-Math.sin(r) * speed * gain, 0, Math.cos(r) * speed * gain];
}
export function validLandmark(p) {
  return (
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.min(p.visibility ?? 1, p.presence ?? 1) >= 0.45
  );
}
export class CoordinateMapper {
  constructor(size = SPACE_SIZE) {
    this.size = size;
    this.cameraAspect = 1;
    this.avatarSize = 100;
  }
  resetAvatar() {
    this.cameraAspect = 1;
    this.avatarReference = null;
    this.avatarOrigin = null;
    this.worldFrames = 0;
    this.worldHoldUntil = 0;
    this.fullFrames = 0;
    this.frameKey = null;
    this.transition = null;
    this.lastPose = null;
    this.jointHistory = null;
  }
  point(p) {
    return [
      (0.5 - p.x) * this.size,
      (0.5 - p.y) * this.size,
      clamp(Number.isFinite(p.z) ? -p.z : 0, -0.5, 0.5) * this.size,
    ];
  }
  // Select one input coordinate system for the whole frame, then one similarity transform.
  avatarPose(landmarks, worldLandmarks, time = performance.now()) {
    const lm = landmarks || [];
    const aspect =
      Number.isFinite(this.cameraAspect) && this.cameraAspect > 0
        ? this.cameraAspect
        : 1;
    const visible = (p) =>
      validLandmark(p) &&
      p.x >= -0.15 &&
      p.x <= 1.15 &&
      p.y >= -0.15 &&
      p.y <= 1.15;
    if (![11, 12].every((i) => visible(lm[i]))) return null;
    const full = [23, 24, 25, 26, 27, 28].every(
      (i) =>
        visible(lm[i]) &&
        Math.min(lm[i].visibility ?? 1, lm[i].presence ?? 1) >= 0.55,
    );
    this.fullFrames = full ? (this.fullFrames || 0) + 1 : 0;
    const trackingMode = this.fullFrames >= 3 ? "FULL BODY" : "UPPER BODY";
    const indices = Array.from({ length: 33 }, (_, i) => i).filter(
      (i) => (trackingMode === "FULL BODY" || i < 23) && visible(lm[i]),
    );
    const usedIndices = [
      ...new Set([...indices, ...[23, 24].filter((i) => visible(lm[i]))]),
    ];
    const finiteWorld = (p) =>
      validLandmark(p) &&
      Number.isFinite(p.z) &&
      Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) < 3;
    const span = (input) =>
      Math.hypot(
        (input[11].x - input[12].x) * (input === lm ? aspect : 1),
        input[11].y - input[12].y,
      );
    const comparable =
      worldLandmarks?.length >= 33 &&
      [
        [11, 13],
        [13, 15],
        [12, 14],
        [14, 16],
        [11, 23],
        [12, 24],
        [0, 11],
        [0, 12],
        [23, 25],
        [25, 27],
        [24, 26],
        [26, 28],
      ].every(([a, b]) => {
        if (!usedIndices.includes(a) || !usedIndices.includes(b)) return true;
        if (!finiteWorld(worldLandmarks[a]) || !finiteWorld(worldLandmarks[b]))
          return false;
        const ratio = (p) =>
          Math.hypot(
            (p[a].x - p[b].x) * (p === lm ? aspect : 1),
            p[a].y - p[b].y,
          ) / Math.max(0.001, span(p));
        const expected = ratio(lm),
          actual = ratio(worldLandmarks);
        return (
          actual <= Math.max(0.1, expected) * 2 && actual >= expected * 0.5
        );
      });
    const worldUsable =
      comparable &&
      worldLandmarks?.length >= 33 &&
      usedIndices.every((i) => finiteWorld(worldLandmarks[i])) &&
      span(worldLandmarks) > 0.08 &&
      Math.sign(worldLandmarks[11].x - worldLandmarks[12].x) ===
        Math.sign(lm[11].x - lm[12].x);
    this.worldFrames = worldUsable ? (this.worldFrames || 0) + 1 : 0;
    if (!worldUsable && this.lastPose?.coordinateSource === "WORLD")
      this.worldHoldUntil = time + 1000;
    const world =
      worldUsable &&
      (this.lastPose?.coordinateSource === "WORLD" ||
        (this.worldFrames >= 5 && time >= (this.worldHoldUntil || 0)));
    const input = world ? worldLandmarks : lm;
    const source = world ? "POSE WORLD" : "POSE NORMALIZED";
    const xScale = world ? 1 : aspect;
    const projectionKey = source + (world ? "" : "/" + aspect);
    const root = trackingMode === "FULL BODY" ? [23, 24] : [11, 12];
    const center = ["x", "y", "z"].map(
      (k) => ((input[root[0]][k] || 0) + (input[root[1]][k] || 0)) / 2,
    );
    const raw = Array.from({ length: 33 }, (_, i) =>
      indices.includes(i)
        ? [
            (center[0] - input[i].x) * xScale,
            center[1] - input[i].y,
            clamp(
              (center[2] - (input[i].z || 0)) * xScale,
              -span(input),
              span(input),
            ) * 0.45,
          ]
        : null,
    );
    const extent = Math.max(
      0.01,
      ...raw.filter(Boolean).flatMap((p) => p.map(Math.abs)),
    );
    const desired = Math.min(
      4 / Math.max(0.05, span(input)),
      (this.size * 0.15) / extent,
    );
    const referenceKey = projectionKey + "/" + trackingMode;
    if (this.avatarReference?.key !== referenceKey)
      this.avatarReference = { key: referenceKey, scale: desired };
    // A single uniform fit preserves arm proportions; no individual coordinate clipping.
    const scale = Math.min(
      (this.avatarReference.scale * (this.avatarSize || 100)) / 100,
      (this.size * 0.44) / extent,
    );
    const handVelocityScale = scale / this.avatarReference.scale;
    let points = raw.map((p) => (p ? p.map((v) => v * scale) : null));
    const key = referenceKey + "/" + (this.avatarSize || 100);
    if (this.frameKey && this.frameKey !== key)
      this.transition = { start: time, points: this.lastPose.points };
    const progress = this.transition
      ? clamp((time - this.transition.start) / 250, 0, 1)
      : 1;
    if (progress < 1)
      points = points.map((p, i) =>
        p && this.transition.points[i]
          ? p.map(
              (v, k) =>
                this.transition.points[i][k] +
                (v - this.transition.points[i][k]) * progress,
            )
          : p,
      );
    else this.transition = null;
    const validCount = points.filter(Boolean).length;
    const wrists = { left: points[15], right: points[16] };
    // Briefly retain missing upper joints for display only; physical input remains missing.
    this.jointHistory ||= Array(33).fill(null);
    points = points.map((p, i) => {
      if (p) {
        this.jointHistory[i] = { point: p, time };
        return p;
      }
      if (
        i < 23 &&
        this.jointHistory[i] &&
        time - this.jointHistory[i].time < 150
      )
        return this.jointHistory[i].point;
      return null;
    });
    let bodyAxis = null;
    if ([23, 24].every((i) => visible(lm[i]) && validLandmark(input[i]))) {
      const shoulder = ["x", "y", "z"].map(
        (k) => ((input[11][k] || 0) + (input[12][k] || 0)) / 2,
      );
      const hip = ["x", "y", "z"].map(
        (k) => ((input[23][k] || 0) + (input[24][k] || 0)) / 2,
      );
      const height = Math.max(0.05, hip[1] - shoulder[1]);
      bodyAxis = [
        clamp(((hip[0] - shoulder[0]) * xScale) / height, -1, 1),
        0,
        clamp(((hip[2] - shoulder[2]) * xScale * 0.45) / height, -1, 1),
      ];
    }
    const frame = {
      points,
      coherentPose: true,
      handVelocityScale,
      bodyAxis,
      source,
      coordinateSource: world ? "WORLD" : "NORMALIZED",
      trackingMode,
      origin: trackingMode === "FULL BODY" ? "HIP CENTER" : "SHOULDER CENTER",
      validCount,
      transitioning: progress < 1,
      windHands: wrists,
    };
    this.frameKey = key;
    this.lastPose = frame;
    return frame;
  }
  syntheticPose(sample) {
    if (
      !sample?.body ||
      sample.body.length !== 3 ||
      !sample.body.every(Number.isFinite)
    )
      return null;
    const [x, y, z] = sample.body;
    const points = Array.from({ length: 33 }, () => [0, 0, 0]);
    const upper = (px, py, pz = 0) => [px + x * py, py + y * 0.4, pz + z * py];
    for (let i = 0; i <= 10; i++)
      points[i] = upper(
        ((i % 3) - 1) * 0.18,
        3.5 + (i === 0 ? 0.15 : 0),
        -0.12,
      );
    points[11] = upper(-1, 2.5);
    points[12] = upper(1, 2.5);
    points[23] = [-0.65, 0, 0];
    points[24] = [0.65, 0, 0];
    for (const [wrist, elbow, shoulder, side] of [
      [15, 13, 11, "left"],
      [16, 14, 12, "right"],
    ]) {
      const hand =
        sample[side]?.length === 3 && sample[side].every(Number.isFinite)
          ? sample[side].map((v) => clamp(v, -this.size / 2, this.size / 2))
          : null;
      points[wrist] = hand;
      points[elbow] = hand
        ? hand.map((v, i) => (v + points[shoulder][i]) / 2)
        : null;
      for (const i of side === "left" ? [17, 19, 21] : [18, 20, 22])
        points[i] = hand ? hand.map((v, k) => v + (k === 1 ? 0.12 : 0)) : null;
    }
    for (const [knee, ankle, heel, toe, px] of [
      [25, 27, 29, 31, -0.65],
      [26, 28, 30, 32, 0.65],
    ]) {
      points[knee] = [px, -1.8, 0.12];
      points[ankle] = [px, -3.6, 0];
      points[heel] = [px, -3.7, 0.2];
      points[toe] = [px, -3.7, -0.45];
    }
    return {
      points,
      source: "PC TEST SYNTHETIC",
      windHands: { left: points[15], right: points[16] },
    };
  }
  fromPose(landmarks, worldLandmarks, acceptedFrame) {
    const lm = landmarks || [];
    const frame =
      acceptedFrame === undefined
        ? this.avatarPose(lm, worldLandmarks)
        : acceptedFrame;
    if (frame?.bodyAxis)
      return {
        detected: true,
        rebase: frame.transitioning,
        handVelocityScale: frame.handVelocityScale,
        body: frame.bodyAxis,
        left: frame.windHands.left,
        right: frame.windHands.right,
      };
    let body = null;
    if (
      frame?.trackingMode === "FULL BODY" &&
      [11, 12, 23, 24].every((i) => frame.points[i])
    ) {
      const shoulder = [0, 1, 2].map(
        (k) => (frame.points[11][k] + frame.points[12][k]) / 2,
      );
      const height = Math.max(0.1, shoulder[1]);
      body = [
        clamp(shoulder[0] / height, -1, 1),
        0,
        clamp(shoulder[2] / height, -1, 1),
      ];
    }
    return {
      detected: !!frame && frame.validCount > 0,
      body,
      rebase: !!frame?.transitioning,
      handVelocityScale: frame?.handVelocityScale || 1,
      left: frame?.windHands.left || null,
      right: frame?.windHands.right || null,
    };
  }
}
