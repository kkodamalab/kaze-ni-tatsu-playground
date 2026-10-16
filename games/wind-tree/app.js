import {
  mountPhotoSettings,
  photoSettings,
} from "../../shared/photo-settings.js?v=seesaw-timed-capture";
import { getSharedGift } from "../../shared/photo-gift.js?v=seesaw-timed-capture";
import { registerCleanup, nextParticipant } from "../../shared/participant.js";
import { PosePipeline } from "./pose-pipeline.mjs";
import { screenPoint, screenAxis, HandWind, AutumnLeaves } from "./autumn.mjs";
import {
  TrialClock,
  validDuration,
  sensitivityGain,
  restoreSensitivities,
} from "./trial.mjs";
import { PhotoSession } from "../../shared/photos.mjs?v=seesaw-timed-capture";
import { PhotoUI } from "../../shared/photo-ui.mjs";
import { SharedSmileCapture as FaceCapture } from "../../shared/smile-capture.mjs?v=seesaw-timed-capture";
const $ = (s) => document.querySelector(s),
  canvas = $("#world"),
  ctx = canvas.getContext("2d"),
  video = $("#camera");
const cfg = {
  easy: { tol: 10, hand: 0.1 },
  normal: { tol: 6, hand: 0.14 },
  hard: { tol: 3, hand: 0.18 },
};
let pose,
  stream,
  running = false,
  test = false,
  lastT = 0,
  lastVideo = -1,
  growth = 0,
  wind = 0,
  axis = 0,
  prev,
  rows = [],
  particles = [],
  difficulty = "normal",
  good = 0;
let skeleton = false,
  currentLandmarks = null,
  poseDetected = false,
  leftHandMotion = 0,
  rightHandMotion = 0;
const POSE_CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 7],
  [0, 4],
  [4, 5],
  [5, 6],
  [6, 8],
  [9, 10],
  [11, 12],
  [11, 13],
  [13, 15],
  [15, 17],
  [15, 19],
  [15, 21],
  [17, 19],
  [12, 14],
  [14, 16],
  [16, 18],
  [16, 20],
  [16, 22],
  [18, 20],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 29],
  [28, 30],
  [29, 31],
  [30, 32],
  [27, 31],
  [28, 32],
];
const hands = [new HandWind(), new HandWind()];
const autumn = new AutumnLeaves(innerWidth, innerHeight);
let lastPoseT = 0,
  lastInputT = 0;
const clock = new TrialClock(),
  photos = new PhotoSession(),
  photoUI = new PhotoUI(photos);
let configuredDurationSec = 30,
  lastSimulationMs = 0,
  finishCount = 0,
  starting = false,
  trialGeneration = 0,
  resultInfo = {};
let sensitivities = { body: 70, left: 70, right: 70 };
try {
  sensitivities = restoreSensitivities(localStorage);
} catch {}
let gains = Object.fromEntries(
  Object.entries(sensitivities).map(([key, value]) => [
    key,
    sensitivityGain(value),
  ]),
);
let faceCapture;
const sharedGift = getSharedGift();
const sharedPhotoUI = mountPhotoSettings($("#shared-photo-settings"), {
  onRevoke: (erase = true) => {
    faceCapture?.stop();
    if (erase) {
      photoUI.clear();
      sharedGift.clear();
    }
  },
  onChange: (value) => {
    faceCapture?.configure(value);
    if (!value.enabled) faceCapture?.stop();
    else if (
      faceCapture &&
      running &&
      !test &&
      stream &&
      sharedPhotoUI.hasConsent() &&
      !faceCapture.enabled &&
      photos.photos.length < value.maxPhotos
    ) {
      const last = faceCapture.gate?.lastCapture;
      faceCapture.start(value.threshold / 100, {
        holdMs: value.holdSeconds * 1000,
        cooldownMs: value.cooldownSeconds * 1000,
        faceFps: value.faceFps,
      });
      if (Number.isFinite(last)) faceCapture.gate.lastCapture = last;
    }
    $("#wind-gift-open").hidden = !value.giftEnabled;
  },
});
faceCapture = new FaceCapture({
  video,
  session: photos,
  hasConsent: () => sharedPhotoUI.hasConsent() && photoSettings.value.enabled,
  onStatus: (message) => {
    $("#photoStatus").textContent = message;
    sharedPhotoUI.status(message);
  },
  onPhoto: () => photoUI.render(),
  getElapsed: () => clock.snapshot().elapsedMs,
  isPlaying: () => running && !clock.paused && !document.hidden,
});
window.windTreePhotoGift = Object.freeze({
  getSelectedGift: () =>
    labActive
      ? labInstance?.getSelectedGift() || null
      : photos.getSelectedGift(resultInfo),
});
for (const side of ["body", "left", "right"]) {
  const input = $(`#${side}Sensitivity`);
  input.value = sensitivities[side];
  $(`#${side}SensitivityValue`).textContent = `${input.value}%`;
  input.addEventListener("input", () => {
    sensitivities[side] = +input.value;
    gains[side] = sensitivityGain(input.value);
    $(`#${side}SensitivityValue`).textContent = `${input.value}%`;
    try {
      localStorage.setItem(
        "windTreeSensitivities",
        JSON.stringify(sensitivities),
      );
    } catch {}
  });
}
$("#durationRange").oninput = () => {
  $("#durationNumber").value = $("#durationRange").value;
  $("#durationError").textContent = "";
  $("#durationNumber").setAttribute("aria-invalid", "false");
  if (clock.phase === "idle")
    $("#timer").textContent = $("#durationRange").value;
};
$("#durationNumber").oninput = () => {
  const value = validDuration($("#durationNumber").value);
  $("#durationError").textContent =
    value === null ? "1〜60秒の整数を入力してください" : "";
  $("#durationNumber").setAttribute("aria-invalid", String(value === null));
  if (value !== null) {
    $("#durationRange").value = value;
    if (clock.phase === "idle") $("#timer").textContent = value;
  }
};
$("#stopPhotoBtn").onclick = () => {
  faceCapture.stop();
  $("#stopPhotoBtn").classList.add("hidden");
  $("#photoStatus").textContent = "撮影を停止しました";
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp = (a, b, t) => a + (b - a) * t;
function resize() {
  if (typeof autumn !== "undefined") {
    autumn.resize(innerWidth, innerHeight);
    hands.forEach((h) => h.reset());
  }
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener("resize", resize);
resize();
async function initPose() {
  if (pose?.error) {
    pose.close();
    pose = null;
  }
  if (pose) return;
  pose = await PosePipeline.create();
}
let cameraGeneration = 0;
async function cameraStart() {
  const generation = ++cameraGeneration;
  const acquired = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "user",
      width: { ideal: 960 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  if (generation !== cameraGeneration) {
    acquired.getTracks().forEach((t) => t.stop());
    throw Error("Camera request cancelled");
  }
  stream = acquired;
  video.srcObject = stream;
  await video.play();
  const pipeline = pose && !pose.error ? pose : await PosePipeline.create();
  if (generation !== cameraGeneration) {
    pipeline.close();
    acquired.getTracks().forEach((t) => t.stop());
    throw Error("Pose request cancelled");
  }
  pose = pipeline;
}
function confidence(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.y)
    ? Math.min(p.visibility ?? 1, p.presence ?? 1)
    : 0;
}
function feat(lm, dt) {
  const points = lm.map(landmarkPoint),
    S1 = lm[11],
    S2 = lm[12],
    H1 = lm[23],
    H2 = lm[24];
  for (const [i, index] of [15, 16].entries())
    hands[i].update(
      confidence(lm[index]) >= 0.45 ? points[index] : null,
      dt / 1000,
      confidence(lm[index]),
    );
  if ([S1, S2, H1, H2].some((p) => confidence(p) < 0.45)) {
    prev = null;
    return {
      axis: null,
      left: 0,
      right: 0,
      dir: Math.sign(hands[0].vx + hands[1].vx) || 1,
    };
  }
  const shoulder = {
      x: (points[11].x + points[12].x) / 2,
      y: (points[11].y + points[12].y) / 2,
    },
    hip = {
      x: (points[23].x + points[24].x) / 2,
      y: (points[23].y + points[24].y) / 2,
    };
  // Preserve the existing shoulder-normalized motion metrics for growth/research.
  const sw = Math.hypot(S1.x - S2.x, S1.y - S2.y) || 0.1;
  let l = 0,
    r = 0;
  if (prev && dt > 0) {
    const scale = Math.max(0.35, dt / 16.67);
    for (const [i, index, key] of [
      [0, 15, "L"],
      [1, 16, "R"],
    ]) {
      const p = lm[index],
        old = prev[key];
      if (confidence(p) >= 0.45 && old) {
        const v = clamp(
          Math.hypot(p.x - old.x, p.y - old.y) / sw / scale,
          0,
          1,
        );
        if (i === 0) l = v;
        else r = v;
      }
    }
  }
  prev = {
    L: confidence(lm[15]) >= 0.45 ? { ...lm[15] } : null,
    R: confidence(lm[16]) >= 0.45 ? { ...lm[16] } : null,
  };
  return {
    axis: screenAxis(shoulder, hip),
    left: l,
    right: r,
    dir: Math.sign(hands[0].vx + hands[1].vx) || 1,
  };
}
function demoInput(dt) {
  const positions = ["left", "right"].map((side) => ({
    x: (+$(`#${side}X`).value / 100) * innerWidth,
    y: (+$(`#${side}Y`).value / 100) * innerHeight,
  }));
  positions.forEach((p, i) =>
    hands[i].update(
      p,
      dt / 1000,
      1,
      +$(i ? "#rightSlider" : "#leftSlider").value,
    ),
  );
  return {
    axis: +$("#axisSlider").value,
    left: +$("#leftSlider").value,
    right: +$("#rightSlider").value,
    dir: Math.sign(hands[0].vx + hands[1].vx) || 1,
  };
}
function spawn(kind, s, d) {
  particles.push({
    kind,
    x: d > 0 ? -40 : innerWidth + 40,
    y: innerHeight * (0.25 + Math.random() * 0.55),
    vx: (1 + s * 5) * d,
    vy: -0.3 - Math.random() * 0.5,
    life: 300,
  });
}
function updateP(dt, s, d) {
  if (Math.random() < s * 0.12) spawn("🍃", s, d);
  if (s > 0.4 && Math.random() < 0.018) spawn("🦋", s, d);
  if (s > 0.72 && Math.random() < 0.012) spawn("🎈", s, d);
  for (const p of particles) {
    p.x += (p.vx * dt) / 16;
    p.y += (p.vy * dt) / 16 - (p.kind === "🎈" ? s * 0.7 : 0);
    p.life -= dt;
  }
  particles = particles.filter(
    (p) => p.life > 0 && p.x > -100 && p.x < innerWidth + 100 && p.y > -100,
  );
}
function tree(g, w) {
  const W = innerWidth,
    H = innerHeight,
    cx = W / 2,
    base = H * 0.88,
    height = 70 + g * Math.min(H * 0.58, 470),
    tr = 12 + g * 24;
  ctx.save();
  ctx.translate(cx, base);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#654321";
  ctx.lineWidth = tr;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(axis * 1.1, -height * 0.45, axis * 1.5, -height);
  ctx.stroke();
  const n = Math.floor(2 + g * 7);
  for (let i = 0; i < n; i++) {
    const yy = -height * (0.3 + (i / (n + 2)) * 0.65),
      side = i % 2 ? 1 : -1,
      len = (35 + g * 70) * (1 - (i / n) * 0.3),
      sway = Math.sin(performance.now() / 180 + i) * w * 18;
    ctx.strokeStyle = "#76502b";
    ctx.lineWidth = Math.max(5, tr * 0.38);
    ctx.beginPath();
    ctx.moveTo(axis * (1 + i / n), yy);
    ctx.quadraticCurveTo(
      side * len * 0.5 + sway,
      yy - 15,
      side * len + sway,
      yy - 35,
    );
    ctx.stroke();
  }
  ctx.fillStyle = "#3d9b48";
  for (let i = 0; i < 8 + g * 30; i++) {
    const a = i * 2.4,
      r = (20 + g * 90) * ((i % 5) / 5 + 0.25);
    ctx.beginPath();
    ctx.arc(
      axis * 1.5 +
        Math.cos(a) * r +
        Math.sin(performance.now() / 250 + i) * w * 9,
      -height + Math.sin(a) * r * 0.55,
      7 + g * 7,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  if (g > 0.82) {
    ctx.fillStyle = "#ff7db1";
    for (let i = 0; i < 12; i++) {
      const a = i * 0.9;
      ctx.beginPath();
      ctx.arc(
        axis * 1.5 + Math.cos(a) * 70,
        -height + Math.sin(a) * 42,
        6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}
function landmarkPoint(p) {
  return screenPoint(
    p,
    innerWidth,
    innerHeight,
    video.videoWidth || innerWidth,
    video.videoHeight || innerHeight,
  );
}
function drawHandWind() {
  if (!skeleton) return;
  ctx.save();
  for (const [i, h] of hands.entries()) {
    if (!h.active) continue;
    ctx.strokeStyle = i ? "#ff4fd8" : "#38f8ff";
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      h.x,
      h.y,
      clamp(Math.min(innerWidth, innerHeight) * 0.23, 90, 190),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    const ex = h.x + h.vx * 0.12,
      ey = h.y + h.vy * 0.12,
      a = Math.atan2(h.vy, h.vx);
    ctx.beginPath();
    ctx.moveTo(h.x, h.y);
    ctx.lineTo(ex, ey);
    ctx.moveTo(ex - 12 * Math.cos(a - 0.5), ey - 12 * Math.sin(a - 0.5));
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 12 * Math.cos(a + 0.5), ey - 12 * Math.sin(a + 0.5));
    ctx.stroke();
    ctx.font = "bold 13px system-ui";
    ctx.fillText(
      `${i ? "RIGHT" : "LEFT"} WIND ${h.strength.toFixed(2)}`,
      h.x + 10,
      h.y - 12,
    );
  }
  ctx.restore();
}
function drawSkeleton() {
  if (!skeleton || test || !currentLandmarks) return;
  const points = currentLandmarks.map(landmarkPoint);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#38f8ff";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#001d2a";
  ctx.shadowBlur = 4;
  for (const [a, b] of POSE_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
    ctx.stroke();
  }
  for (let i = 0; i < points.length; i++) {
    ctx.fillStyle = i < 11 ? "#ffed4a" : "#ff4fd8";
    ctx.beginPath();
    ctx.arc(points[i].x, points[i].y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#17242a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const shoulder = {
      x: (points[11].x + points[12].x) / 2,
      y: (points[11].y + points[12].y) / 2,
    },
    hip = {
      x: (points[23].x + points[24].x) / 2,
      y: (points[23].y + points[24].y) / 2,
    };
  ctx.strokeStyle =
    Math.abs(axis) <= cfg[difficulty].tol ? "#7dff63" : "#ff704d";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(shoulder.x, shoulder.y);
  ctx.lineTo(hip.x, hip.y);
  ctx.stroke();
  ctx.shadowBlur = 5;
  ctx.font = "800 14px system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#142c32";
  ctx.lineWidth = 4;
  for (const [label, index, value] of [
    ["LEFT", 15, leftHandMotion],
    ["RIGHT", 16, rightHandMotion],
  ]) {
    const p = points[index],
      text = `${label} ${value.toFixed(2)}`;
    ctx.strokeText(text, p.x, p.y - 15);
    ctx.fillText(text, p.x, p.y - 15);
  }
  const axisText = `BODY AXIS: ${axis >= 0 ? "+" : ""}${axis.toFixed(1)}°${Math.abs(axis) <= cfg[difficulty].tol ? " ✓" : ""}`;
  ctx.strokeText(axisText, shoulder.x, shoulder.y - 18);
  ctx.fillText(axisText, shoulder.x, shoulder.y - 18);
  ctx.restore();
}
function updateSkeletonHud() {
  if (!skeleton) return;
  const axisText = `${axis >= 0 ? "+" : ""}${axis.toFixed(1)}°${Math.abs(axis) <= cfg[difficulty].tol ? " ✓" : ""}`;
  $("#poseStatus").textContent =
    `POSE: ${test ? "TEST MODE" : poseDetected ? "DETECTED" : "NOT DETECTED"}`;
  $("#axisStatus").textContent = `BODY AXIS: ${axisText}`;
  $("#leftStatus").textContent = `LEFT HAND: ${leftHandMotion.toFixed(2)}`;
  $("#rightStatus").textContent = `RIGHT HAND: ${rightHandMotion.toFixed(2)}`;
  $("#windStatus").textContent = `WIND: ${wind.toFixed(2)}`;
  $("#treeStatus").textContent = `TREE GROWTH: ${growth.toFixed(2)}`;
}
function staffMetrics() {
  const speeds = autumn.leaves.map((p) => Math.hypot(p.vx, p.vy));
  return {
    bodyGain: gains.body,
    leftGain: gains.left,
    rightGain: gains.right,
    maxLeafSpeed: Math.max(0, ...speeds),
    leftWindX: hands[0].vx * gains.left,
    leftWindY: hands[0].vy * gains.left,
    rightWindX: hands[1].vx * gains.right,
    rightWindY: hands[1].vy * gains.right,
  };
}
function render() {
  const W = innerWidth,
    H = innerHeight;
  ctx.clearRect(0, 0, W, H);
  if (!$("#start").classList.contains("hidden")) {
    ctx.save();
    ctx.translate(
      Math.sin(performance.now() / 4500) * 8,
      Math.sin(performance.now() / 3000) * 12,
    );
    autumn.draw(ctx, 4);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(255,255,255,.65)";
  for (let i = 0; i < 4; i++) {
    const x = ((performance.now() / 70 + (i * W) / 3) % (W + 180)) - 90,
      y = 70 + (i % 2) * 75;
    ctx.beginPath();
    ctx.ellipse(x, y, 65, 24, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#6ab44e";
  ctx.fillRect(0, H * 0.88, W, H * 0.12);
  tree(growth, wind);
  ctx.font = "28px sans-serif";
  for (const p of particles) ctx.fillText(p.kind, p.x, p.y);
  autumn.draw(ctx);
  drawSkeleton();
  drawHandWind();
  updateSkeletonHud();
  if (skeleton) {
    const m = staffMetrics();
    $("#gainStatus").textContent =
      `GAIN body ${m.bodyGain.toFixed(2)} / L ${m.leftGain.toFixed(2)} / R ${m.rightGain.toFixed(2)}`;
    $("#leafVelocityStatus").textContent =
      `LEAF MAX ${m.maxLeafSpeed.toFixed(1)} px/s`;
    $("#windVectorStatus").textContent =
      `WIND body ${autumn.bodyWind.toFixed(0)} | L (${m.leftWindX.toFixed(0)},${m.leftWindY.toFixed(0)}) R (${m.rightWindX.toFixed(0)},${m.rightWindY.toFixed(0)})`;
  }
}
function stopCamera() {
  cameraGeneration++;
  pose?.close();
  pose = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
}
function finish() {
  if (finishCount) return;
  finishCount++;
  running = false;
  faceCapture.stop();
  stopCamera();
  $("#stopPhotoBtn").classList.add("hidden");
  resultInfo = {
    treeGrowth: growth,
    difficulty,
    configuredDurationSec,
    activePlayTimeSec: clock.elapsedMs / 1000,
    sensitivities: { ...sensitivities },
  };
  $("#testPanel").classList.add("hidden");
  $("#finish").classList.remove("hidden");
  $("#result").textContent =
    growth > 0.8 ? "🌸✨🌳✨🦋" : growth > 0.5 ? "🌿🌳🍃" : "🌱🌿";
  photoUI.render();
}
function syncClock(t) {
  const state = clock.tick(t);
  if (state.phase === "countdown")
    $("#message").textContent = state.paused
      ? "ひとやすみ"
      : String(state.countdown);
  if (state.phase === "playing" && !running) {
    running = true;
    lastT = t;
    lastInputT = t;
    $("#message").textContent = "スタート！";
  }
  if (state.phase === "playing" || state.phase === "finished")
    $("#timer").textContent = state.remainingSec;
  if (state.phase === "playing" && state.paused)
    $("#message").textContent = "ひとやすみ";
  if (state.finishedNow) {
    recordRow(clamp(1 - Math.abs(axis) / cfg[difficulty].tol, 0, 1));
    finish();
  }
  return state;
}
function recordRow(stability) {
  rows.push({
    time_ms: Math.round(clock.elapsedMs),
    bodyAxisAngle: axis.toFixed(3),
    bodyStability: stability.toFixed(3),
    leftHandMotion: leftHandMotion.toFixed(4),
    rightHandMotion: rightHandMotion.toFixed(4),
    handMotion: ((leftHandMotion + rightHandMotion) / 2).toFixed(4),
    windStrength: wind.toFixed(3),
    treeGrowth: growth.toFixed(3),
    bodyAxisWind: autumn.bodyWind.toFixed(3),
    leftHandWind: hands[0].strength.toFixed(4),
    rightHandWind: hands[1].strength.toFixed(4),
    leafCount: autumn.leaves.length,
    configuredDurationSec,
    activePlayTimeSec: (clock.elapsedMs / 1000).toFixed(3),
    bodySensitivityPercent: sensitivities.body,
    leftSensitivityPercent: sensitivities.left,
    rightSensitivityPercent: sensitivities.right,
  });
}
function handleVisibility() {
  const now = performance.now();
  syncClock(now);
  clock.setPaused(document.hidden, now);
  lastSimulationMs = clock.elapsedMs;
  lastT = 0;
  lastPoseT = 0;
  prev = null;
  hands.forEach((h) => h.reset());
  faceCapture.pause();
  if (!document.hidden && clock.phase === "playing")
    $("#message").textContent = "再開！";
}
document.addEventListener("visibilitychange", handleVisibility);
// The clock is independent of video frames and inference. Hidden time is excluded.
setInterval(() => syncClock(performance.now()), 100);
let gameFrame,
  labActive = false,
  labInstance = null,
  labOpening = false;
function loop(t) {
  if (labActive) return;
  const state = syncClock(t),
    dt = Math.min(250, Math.max(0, state.elapsedMs - lastSimulationMs));
  lastSimulationMs = state.elapsedMs;
  lastT = t;
  if (running && !state.paused) {
    let f = null;
    if (test) {
      poseDetected = false;
      currentLandmarks = null;
      f = demoInput(dt);
    } else if (
      pose &&
      video.readyState >= 2 &&
      video.currentTime !== lastVideo &&
      t - lastPoseT >= 33
    ) {
      lastVideo = video.currentTime;
      try {
        const res = pose.detectForVideo(video, t);
        currentLandmarks = res.landmarks?.[0] || null;
        poseDetected = !!currentLandmarks;
        const poseDt = lastPoseT ? t - lastPoseT : 0;
        lastPoseT = t;
        if (currentLandmarks) f = feat(currentLandmarks, poseDt);
        else {
          hands.forEach((h) => h.update(null, dt / 1000));
          prev = null;
        }
      } catch (e) {
        currentLandmarks = null;
        poseDetected = false;
        hands.forEach((h) => h.update(null, dt / 1000));
        prev = null;
      }
    }
    if (f) {
      if (f.axis !== null) {
        axis = lerp(axis, f.axis, 1 - Math.exp(-dt / 100));
        lastInputT = t;
      }
      leftHandMotion = f.left;
      rightHandMotion = f.right;
    }
    if (!test && t - lastInputT > 250) {
      axis *= Math.exp(-dt / 250);
      leftHandMotion *= Math.exp(-dt / 120);
      rightHandMotion *= Math.exp(-dt / 120);
    }
    if (!test && t - lastPoseT > 250) {
      poseDetected = false;
      currentLandmarks = null;
      prev = null;
      hands.forEach((h) => h.update(null, dt / 1000));
    }
    const hand = clamp((leftHandMotion + rightHandMotion) / 2, 0, 1),
      c = cfg[difficulty],
      stability = clamp(1 - Math.abs(axis) / c.tol, 0, 1);
    wind = lerp(
      wind,
      clamp((hand - 0.025) / 0.45, 0, 1),
      1 - Math.exp(-dt / 110),
    );
    if ((test || t - lastInputT <= 250) && Math.abs(axis) <= c.tol)
      growth = clamp(
        growth +
          (dt / (configuredDurationSec * 1000)) * (0.55 + 0.65 * stability),
        0,
        1,
      );
    good = stability > 0.55 && hand > c.hand ? good + dt : 0;
    $("#message").textContent = good > 800 ? "いいかぜ！ ✨" : "";
    updateP(dt, wind, f?.dir || 1);
    autumn.update(dt / 1000, axis, hands, gains);
    const metrics = {
      bodyAxisAngle: +axis.toFixed(2),
      bodyStability: +stability.toFixed(2),
      leftHandMotion: +leftHandMotion.toFixed(3),
      rightHandMotion: +rightHandMotion.toFixed(3),
      windStrength: +wind.toFixed(2),
      treeGrowth: +growth.toFixed(2),
      bodyAxisWind: +autumn.bodyWind.toFixed(2),
      leftHandWind: +hands[0].strength.toFixed(3),
      rightHandWind: +hands[1].strength.toFixed(3),
      leafCount: autumn.leaves.length,
      configuredDurationSec,
      activePlayTimeSec: clock.elapsedMs / 1000,
      bodySensitivityPercent: sensitivities.body,
      leftSensitivityPercent: sensitivities.left,
      rightSensitivityPercent: sensitivities.right,
      ...staffMetrics(),
    };
    recordRow(stability);
    $("#metrics").textContent = JSON.stringify(metrics, null, 2);
  }
  render();
  gameFrame = requestAnimationFrame(loop);
}
function resetTrial() {
  sharedGift.clear();
  trialGeneration++;
  running = false;
  starting = false;
  faceCapture.stop();
  stopCamera();
  photoUI.clear();
  clock.reset();
  resultInfo = {};
  finishCount = 0;
  lastSimulationMs = 0;
  growth = wind = axis = good = 0;
  particles = [];
  rows = [];
  prev = null;
  currentLandmarks = null;
  poseDetected = false;
  leftHandMotion = rightHandMotion = 0;
  hands.forEach((h) => h.reset());
  autumn.reset();
  lastVideo = -1;
  lastPoseT = lastT = lastInputT = 0;
  $("#photoConsent").checked = false;
  $("#smileEnabled").checked = photoSettings.value.enabled;
  $("#finish").classList.add("hidden");
  $("#start").classList.remove("hidden");
  $("#testPanel").classList.add("hidden");
  $("#stopPhotoBtn").classList.add("hidden");
  $("#message").textContent = "";
  $("#startStatus").textContent = "";
  $("#research").classList.add("hidden");
  $("#timer").textContent = $("#durationNumber").value;
  $("#photoStatus").textContent = "撮影は同意確認後に有効になります";
}
async function begin(useTest) {
  if (
    labActive ||
    labOpening ||
    labCameraBusy ||
    starting ||
    running ||
    clock.phase === "countdown"
  )
    return;
  const duration = validDuration($("#durationNumber").value);
  if (duration === null) {
    $("#durationError").textContent = "1〜60秒の整数を入力してください";
    $("#durationNumber").focus();
    return;
  }
  $("#startStatus").textContent = "";
  starting = true;
  const generation = ++trialGeneration;
  faceCapture.stop();
  stopCamera();
  photoUI.clear();
  photos.maxPhotos = photoSettings.value.maxPhotos;
  photos.start(crypto.randomUUID());
  configuredDurationSec = duration;
  test = useTest;
  difficulty = $("#difficulty").value;
  finishCount = 0;
  resultInfo = {};
  lastSimulationMs = 0;
  growth = wind = axis = good = 0;
  rows = [];
  particles = [];
  prev = null;
  currentLandmarks = null;
  poseDetected = false;
  leftHandMotion = rightHandMotion = 0;
  hands.forEach((h) => h.reset());
  autumn.reset();
  lastVideo = -1;
  lastPoseT = lastT = 0;
  const consent = $("#photoConsent").checked,
    enablePhotos = $("#smileEnabled").checked && consent && !test;

  $("#start").classList.add("hidden");
  $("#testPanel").classList.toggle("hidden", !test);
  $("#timer").textContent = duration;
  $("#photoStatus").textContent = test
    ? "PCテストモード：撮影なし"
    : enablePhotos
      ? "カメラを準備しています…"
      : "撮影OFFで遊びます";
  try {
    if (!test) await cameraStart();
  } catch {
    stopCamera();
    if (generation !== trialGeneration) return;
    test = true;
    $("#testPanel").classList.remove("hidden");
    $("#photoStatus").textContent =
      "カメラを使えないためPCテストに切り替えました。撮影OFFで遊べます。";
  }
  if (generation !== trialGeneration) {
    stopCamera();
    return;
  }
  starting = false;
  clock.start(performance.now(), duration);
  clock.setPaused(document.hidden, performance.now());
  lastInputT = performance.now();
  $("#message").textContent = "3";
  if (enablePhotos && !test) {
    faceCapture.start(photoSettings.value.threshold / 100, {
      holdMs: photoSettings.value.holdSeconds * 1000,
      cooldownMs: photoSettings.value.cooldownSeconds * 1000,
      faceFps: photoSettings.value.faceFps,
    });
    $("#stopPhotoBtn").classList.remove("hidden");
  }
}
$("#startBtn").onclick = () => begin(false);
$("#testBtn").onclick = () => begin(true);
$("#againBtn").onclick = resetTrial;
$("#wind-gift-open").onclick = () => {
  faceCapture.stop();
  stopCamera();
  $("#app").classList.add("hidden");
  sharedGift.open({
    session: photos,
    gameName: "風に立つ",
    result: resultInfo,
    hasConsent: sharedPhotoUI.hasConsent(),
    onBack: () => $("#app").classList.remove("hidden"),
    onNext: nextParticipant,
  });
};
$("#wind-next-participant").onclick = nextParticipant;
registerCleanup(() => {
  trialGeneration++;
  starting = running = false;
  faceCapture.stop();
  stopCamera();
  photoUI.clear();
  sharedGift.clear();
  clock.reset();
  cancelAnimationFrame(gameFrame);
  labInstance?.dispose();
  labInstance = null;
  labActive = false;
  labOpening = false;
});

$("#skeletonToggle").onclick = () => {
  skeleton = !skeleton;
  $("#skeletonToggle").textContent = `SKELETON ${skeleton ? "ON" : "OFF"}`;
  $("#skeletonToggle").setAttribute("aria-pressed", String(skeleton));
  $("#skeletonHud").classList.toggle("hidden", !skeleton);
  updateSkeletonHud();
};
$("#researchToggle").onclick = () => $("#research").classList.toggle("hidden");
$("#csvBtn").onclick = () => {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]),
    csv = [
      keys.join(","),
      ...rows.map((r) => keys.map((k) => r[k]).join(",")),
    ].join("\n"),
    a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "wind-tree-trial.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
window.addEventListener("pagehide", () => {
  resetTrial();
  pose?.close();
  pose = null;
});
gameFrame = requestAnimationFrame(loop);

let draggedHand = null;
canvas.addEventListener("pointerdown", (e) => {
  if (!test || !running || clock.paused) return;
  const distances = hands.map((h) =>
    Math.hypot(h.x - e.clientX, h.y - e.clientY),
  );
  draggedHand = distances[0] < distances[1] ? 0 : 1;
  canvas.setPointerCapture(e.pointerId);
  moveDemoHand(e);
});
function moveDemoHand(e) {
  if (draggedHand === null) return;
  const side = draggedHand ? "right" : "left";
  $(`#${side}X`).value = clamp((e.clientX / innerWidth) * 100, 0, 100);
  $(`#${side}Y`).value = clamp((e.clientY / innerHeight) * 100, 0, 100);
}
canvas.addEventListener("pointermove", moveDemoHand);
for (const name of ["pointerup", "pointercancel"])
  canvas.addEventListener(name, () => (draggedHand = null));

// The Lab borrows this game's camera and single Pose instance. No second model.
let labCameraBusy = false,
  exitLab = () => {};
$("#windLabBtn").onclick = async () => {
  if (labActive || labOpening || starting || running) return;
  labOpening = true;
  try {
    const { WindLab } = await import("./wind-lab.js?v=seesaw-timed-capture");
    resetTrial();
    labActive = true;
    cancelAnimationFrame(gameFrame);
    $("#app").classList.add("hidden");
    $("#windLab").classList.remove("hidden");
    const exit = () => {
      if (!labActive) return;
      labInstance?.dispose();
      labInstance = null;
      $("#app").prepend(video);
      $("#app").classList.remove("hidden");
      $("#windLab").classList.add("hidden");
      labActive = false;
      gameFrame = requestAnimationFrame(loop);
      $("#windLabBtn").focus();
    };
    exitLab = exit;
    labInstance = new WindLab({
      root: $("#windLab"),
      initialDuration: validDuration($("#durationNumber").value) || 30,
      video,
      onExit: exit,
      camera: {
        async start() {
          if (labCameraBusy) throw new Error("camera initialization pending");
          labCameraBusy = true;
          try {
            await cameraStart();
          } finally {
            labCameraBusy = false;
          }
        },
        stop: stopCamera,
        detect: (t) => pose?.detectForVideo(video, t),
        release() {
          if (!labCameraBusy) {
            pose?.close();
            pose = null;
          }
        },
      },
    });
  } catch (e) {
    console.error("3D WIND LAB startup failed", e);
    labInstance?.dispose();
    labInstance = null;
    $("#app").prepend(video);
    $("#app").classList.remove("hidden");
    $("#windLab").classList.add("hidden");
    if (labActive) gameFrame = requestAnimationFrame(loop);
    labActive = false;
    const reason = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    $("#startStatus").textContent =
      `3D WIND LABを開始できませんでした。原因: ${reason}。` +
      "ネットワーク・必要なファイル・ブラウザーのWebGL対応を確認してください。";
  } finally {
    labOpening = false;
  }
};
window.addEventListener("pagehide", () => exitLab());
