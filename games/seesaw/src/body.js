import { VBFInput, clamp } from './input.js?v=20261009-ui-physics';
export const poseVersion = '0.10.32';
export const poseRoot = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${poseVersion}`;
export const poseModel = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

// Convert normalized image coordinates to pixels before measuring an angle.
// Image y points down: leaning toward image right is positive, independently of preview mirroring.
export function bodyAxis(landmarks, width = 1, height = 1, threshold = .6) {
  const points = [11, 12, 23, 24].map(i => landmarks?.[i]);
  if (!points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
  const confidence = Math.min(...points.map(p => Math.min(p.visibility ?? 0, p.presence ?? p.visibility ?? 0)));
  if (confidence < threshold) return null;
  const [ls, rs, lh, rh] = points;
  const shoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const dx = (shoulder.x - hip.x) * width, dy = (hip.y - shoulder.y) * height;
  if (dy <= 0 || Math.hypot(dx, dy) < height * .02) return null;
  return { angle: Math.atan2(dx, dy) * 180 / Math.PI, confidence, shoulder, hip };
}
export class BodyInput extends VBFInput {
  constructor() { super(); this.sensitivity = 1; this.invert = false; this.confidence = 0; }
  accept(landmarks, width, height, now = performance.now()) {
    const axis = bodyAxis(landmarks, width, height);
    this.axis = axis; this.confidence = axis?.confidence ?? 0;
    if (axis) this.push(axis.angle * (this.invert ? -1 : 1), now);
    else this.ready = false;
    return axis;
  }
  read() {
    const value = super.read();
    value.bodyAxisAngle = value.relativeAngle;
    value.trackingConfidence = this.confidence;
    value.gameAngle = clamp(value.relativeAngle * this.sensitivity, -30, 30);
    value.normalizedTilt = value.gameAngle / 30;
    return value;
  }
}
const connections = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
export class BodyCamera {
  constructor(video, canvas, input, onError = () => {}) {
    this.video = video; this.canvas = canvas; this.input = input; this.onError = onError;
    this.generation = 0; this.skeleton = true; this.debug = false;
  }
  async connect() {
    this.disconnect(); const generation = this.generation;
    let stream, detector;
    try {
      // Request permission immediately within the initiating user action.
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream; this.video.srcObject = stream; await this.video.play();
      const { FilesetResolver, PoseLandmarker } = await import(`${poseRoot}/vision_bundle.mjs`);
      const files = await FilesetResolver.forVisionTasks(`${poseRoot}/wasm`);
      detector = await PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: poseModel }, runningMode: 'VIDEO', numPoses: 1 });
      if (generation !== this.generation) { detector.close(); stream.getTracks().forEach(t => t.stop()); return; }
      this.detector = detector; this.lastTime = -1;
      this.tick(generation);
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop()); detector?.close();
      if (generation === this.generation) this.disconnect();
      throw error;
    }
  }
  tick(generation) {
    if (generation !== this.generation) return;
    try {
      if (this.video.readyState >= 2 && this.video.currentTime !== this.lastTime) {
        this.lastTime = this.video.currentTime;
        const now = performance.now();
        const result = this.detector.detectForVideo(this.video, now);
        const landmarks = result.landmarks[0];
        this.input.accept(landmarks, this.video.videoWidth, this.video.videoHeight, now);
        this.draw(landmarks);
      }
      this.frame = requestAnimationFrame(() => this.tick(generation));
    } catch (error) { this.disconnect(); this.onError(error); }
  }
  draw(points) {
    const canvas = this.canvas; canvas.width = this.video.videoWidth; canvas.height = this.video.videoHeight;
    const ctx = canvas.getContext('2d'); ctx.lineWidth = 4; ctx.strokeStyle = '#a5ff75';
    const line = (a,b) => { ctx.beginPath(); ctx.moveTo(a.x*canvas.width,a.y*canvas.height); ctx.lineTo(b.x*canvas.width,b.y*canvas.height); ctx.stroke(); };
    if (this.skeleton && points) for (const [a,b] of connections) if (points[a]?.visibility > .6 && points[b]?.visibility > .6) line(points[a],points[b]);
    if (this.debug && this.input.axis) {
      ctx.strokeStyle = '#ff537a'; line(this.input.axis.hip,this.input.axis.shoulder);
      for (const i of [11,12,23,24]) { ctx.beginPath(); ctx.arc(points[i].x*canvas.width,points[i].y*canvas.height,8,0,Math.PI*2); ctx.stroke(); }
    }
  }
  disconnect() {
    this.generation++; cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.detector?.close(); this.detector = null; this.video.srcObject = null; this.input.reset(); this.input.confidence = 0;
  }
}
