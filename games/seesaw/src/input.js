import { config } from './config.js?v=20261009-ui-physics';
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const angleDifference = (angle, baseline) => ((angle - baseline + 540) % 360) - 180;

// Screen-relative roll: portrait gamma, landscape -beta / +beta.
export function screenRoll(beta, gamma, screenAngle = 0) {
  const orientation = ((screenAngle % 360) + 360) % 360;
  const axis = orientation === 90 || orientation === 270 ? beta : gamma;
  if (typeof axis !== 'number' || !Number.isFinite(axis)) return null;
  return orientation === 90 || orientation === 180 ? -axis : axis;
}

// Common VBF input adapter. CameraBodyAxisInput can feed the same push/read interface.
export class VBFInput {
  constructor() { this.reset(); }
  reset() { this.rawAngle = 0; this.filteredAngle = 0; this.baselineAngle = 0; this.ready = false; this.calibrated = false; this.lastSample = -Infinity; }
  push(angle, now = performance.now()) {
    if (!Number.isFinite(angle)) return;
    this.filteredAngle = this.ready ? this.filteredAngle + config.alpha * angleDifference(angle, this.filteredAngle) : angle;
    this.rawAngle = angle;
    this.lastSample = now;
    this.ready = true;
  }
  calibrate() {
    if (!this.ready) return false;
    this.baselineAngle = this.rawAngle;
    this.filteredAngle = this.rawAngle;
    this.calibrated = true;
    return true;
  }
  read() {
    const relativeAngle = angleDifference(this.filteredAngle, this.baselineAngle);
    const gameAngle = clamp(relativeAngle, -config.maxAngle, config.maxAngle);
    return { rawAngle: this.rawAngle, relativeAngle, gameAngle, normalizedTilt: gameAngle / config.maxAngle };
  }
}

export class TiltInput extends VBFInput {
  constructor(onRotate = () => {}) {
    super();
    this.onRotate = onRotate; this.generation = 0;
    this.onSample = event => {
      const angle = screenRoll(event.beta, event.gamma, screen.orientation?.angle ?? window.orientation ?? 0);
      if (angle !== null) this.push(angle);
    };
    this.rotation = () => { this.reset(); this.onRotate(); };
  }
  async connect() {
    this.disconnect(); const generation = this.generation;
    if (!window.isSecureContext) throw new Error('スマホではHTTPSのページで開いてください。');
    const api = window.DeviceOrientationEvent;
    if (!api) throw new Error('この端末ではセンサーを使えません。PCテストを選んでください。');
    if (typeof api.requestPermission === 'function' && await api.requestPermission() !== 'granted') {
      throw new Error('センサーが許可されませんでした。ブラウザーの設定を確認してください。');
    }
    if (generation !== this.generation) return;
    window.addEventListener('deviceorientation', this.onSample);
    if (screen.orientation?.addEventListener) screen.orientation.addEventListener('change', this.rotation);
    else window.addEventListener('orientationchange', this.rotation);
  }
  disconnect() {
    this.generation++;
    window.removeEventListener('deviceorientation', this.onSample);
    screen.orientation?.removeEventListener?.('change', this.rotation);
    window.removeEventListener('orientationchange', this.rotation);
  }
}
