// Host-side staff calibration. Sensor adapters and the phone wire protocol stay unchanged.
export const tuningKey = 'keep-the-egg:device-tuning';
export const tuningRanges = Object.freeze({
  angleGain: [0.5, 5, 0.1], maxGameAngle: [10, 35, 1],
  boardLength: [0.25, 1, 0.01], objectResponse: [0.5, 2, 0.1],
});
export const tuningDefaults = Object.freeze({angleGain: 1, maxGameAngle: 30, boardLength: 1, objectResponse: 1});
export function sanitizeTuning(value = {}) {
  return Object.fromEntries(Object.entries(tuningRanges).map(([key, [min, max]]) => {
    const number = value?.[key];
    return [key, typeof number === 'number' && Number.isFinite(number)
      ? Math.max(min, Math.min(max, number)) : tuningDefaults[key]];
  }));
}
export function tuneSample(sample, tuning, sensitivity = 1) {
  const {angleGain, maxGameAngle} = tuning;
  // BODY AXIS retains its independent, existing sensitivity before the staff gain.
  const gameAngle = Math.max(-maxGameAngle, Math.min(maxGameAngle, sample.relativeAngle * sensitivity * angleGain));
  return {...sample, gameAngle, normalizedTilt: gameAngle / maxGameAngle};
}
export class DeviceTuning {
  constructor(storage) {
    this.storage = storage;
    try { this.values = sanitizeTuning(JSON.parse(storage?.getItem(tuningKey) || '{}')); }
    catch { this.values = {...tuningDefaults}; }
  }
  configure(value) {
    this.values = sanitizeTuning({...this.values, ...value});
    try { this.storage?.setItem(tuningKey, JSON.stringify(this.values)); this.saved = Boolean(this.storage); }
    catch { this.saved = false; }
    return this.values;
  }
  reset() { return this.configure(tuningDefaults); }
}
