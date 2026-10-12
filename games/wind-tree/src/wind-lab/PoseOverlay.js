import { validLandmark } from "../wind-engine/CoordinateMapper.js";
import { POSE_CONNECTIONS } from "./PoseConnections.js";
export function drawPoseOverlay(canvas, landmarks, enabled, video) {
  canvas.width = 360;
  canvas.height = 270;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 360, 270);
  if (!enabled || !landmarks) return 0;
  const aspect = (video?.videoWidth || 4) / (video?.videoHeight || 3);
  let w = 360,
    h = 270;
  if (aspect > 4 / 3) h = w / aspect;
  else w = h * aspect;
  const x = (p) => (360 - w) / 2 + (1 - p.x) * w,
    y = (p) => (270 - h) / 2 + p.y * h;
  const finite = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#88ffe2";
  for (const [a, b] of POSE_CONNECTIONS) {
    const p = landmarks[a],
      q = landmarks[b];
    if (!finite(p) || !finite(q) || !validLandmark(p) || !validLandmark(q))
      continue;
    ctx.beginPath();
    ctx.moveTo(x(p), y(p));
    ctx.lineTo(x(q), y(q));
    ctx.stroke();
  }
  let count = 0;
  for (const p of landmarks.slice(0, 33)) {
    if (!finite(p)) continue;
    ctx.fillStyle = (p.visibility ?? 1) >= 0.45 ? "#fff8a4" : "#8aa4b480";
    ctx.beginPath();
    ctx.arc(x(p), y(p), 3, 0, Math.PI * 2);
    ctx.fill();
    count++;
  }
  return count;
}
