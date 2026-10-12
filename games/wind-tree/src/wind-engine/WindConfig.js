import { RESPONSE_PRESETS, responseName } from "./WindResponse.js";
export const SPACE_SIZE = 20;
export const DEFAULTS = Object.freeze({
  gridX: 10,
  gridY: 10,
  gridZ: 10,
  dotSize: 3,
  speed: 100,
  ambient: true,
  ambientSpeed: 40,
  drift: 25,
  verticalFlow: "DOWN",
  particles: true,
  trail: true,
  trailDuration: 1,
  trailOpacity: 50,
  axes: true,
  avatar: false,
  avatarSize: 100,
  avatarStyle: "SKELETON",
  weather: true,
  weatherGain: 100,
  direction: 0,
  windSpeed: 3,
  body: true,
  left: true,
  right: true,
  handDebug: false,
  ...RESPONSE_PRESETS.NORMAL,
  responsePreset: "NORMAL",
});
export const RANGES = Object.freeze({
  ambientSpeed: [0, 100, 1],
  drift: [0, 100, 1],
  handGain: [0, 500, 1],
  avatarSize: [20, 300, 1],
  gridX: [3, 20, 1],
  gridY: [3, 20, 1],
  gridZ: [3, 20, 1],
  dotSize: [1, 10, 1],
  speed: [0, 300, 1],
  trailDuration: [0, 5, 0.1],
  trailOpacity: [0, 100, 1],
  weatherGain: [0, 300, 1],
  direction: [0, 359, 1],
  windSpeed: [0, 20, 0.1],
  bodySensitivity: [0, 300, 1],
  bodySmoothing: [0, 100, 1],
  bodyDeadZone: [0, 15, 0.1],
  handSpeedThreshold: [0, 3, 0.01],
  handSmoothing: [0, 100, 1],
  leftSensitivity: [0, 300, 1],
  rightSensitivity: [0, 300, 1],
  handRadius: [5, 50, 1],
});
export const STORAGE_KEY = "wind-tree-lab-v1";
export function sanitizeConfig(source = {}) {
  const c = { ...DEFAULTS };
  for (const key of Object.keys(c)) {
    const v = source?.[key];
    if (typeof c[key] === "boolean") {
      if (typeof v === "boolean") c[key] = v;
    } else if (key === "verticalFlow") {
      if (["DOWN", "UP", "NONE"].includes(v)) c[key] = v;
    } else if (key === "responsePreset") {
      if (["SOFT", "NORMAL", "STRONG", "CUSTOM"].includes(v)) c[key] = v;
    } else if (key === "avatarStyle") {
      if (["SKELETON", "POINTS"].includes(v)) c[key] = v;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      const [lo, hi, step] = RANGES[key];
      c[key] = Math.max(lo, Math.min(hi, v));
      if (step === 1) c[key] = Math.round(c[key]);
    }
  }
  if (c.responsePreset !== "CUSTOM") c.responsePreset = responseName(c);
  return c;
}
export class WindConfig {
  constructor(storage) {
    this.storage = storage;
    try {
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || "null");
      this.values = sanitizeConfig(
        saved
          ? {
              ...(!saved.responsePreset
                ? {
                    bodySensitivity: 100,
                    bodyDeadZone: 2,
                    bodySmoothing: 30,
                    leftSensitivity: 100,
                    rightSensitivity: 100,
                    handSpeedThreshold: 0.15,
                    handSmoothing: 30,
                    handRadius: 20,
                  }
                : {}),
              ...saved,
              handGain: saved.handGain ?? 100,
              responsePreset: saved.responsePreset || "CUSTOM",
            }
          : {},
      );
    } catch {
      this.values = { ...DEFAULTS };
    }
  }
  set(key, value) {
    return this.replace({ ...this.values, [key]: value });
  }
  replace(config) {
    this.values = sanitizeConfig(config);
    this.save();
    return this.values;
  }
  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      /* Private browsing can reject storage. */
    }
  }
  reset() {
    this.values = { ...DEFAULTS };
    this.save();
    return this.values;
  }
}
