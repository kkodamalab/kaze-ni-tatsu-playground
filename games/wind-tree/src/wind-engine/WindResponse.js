// Shared across DOT/KIDS/ART. No separate physics or input path.
export const RESPONSE_PRESETS = Object.freeze({
  SOFT: {
    bodySensitivity: 100,
    bodyDeadZone: 2,
    bodySmoothing: 30,
    leftSensitivity: 100,
    rightSensitivity: 100,
    handSpeedThreshold: 0.08,
    handSmoothing: 25,
    handRadius: 20,
    handGain: 100,
  },
  NORMAL: {
    bodySensitivity: 175,
    bodyDeadZone: 1,
    bodySmoothing: 18,
    leftSensitivity: 175,
    rightSensitivity: 175,
    handSpeedThreshold: 0.04,
    handSmoothing: 12,
    handRadius: 28,
    handGain: 200,
  },
  STRONG: {
    bodySensitivity: 250,
    bodyDeadZone: 0.6,
    bodySmoothing: 12,
    leftSensitivity: 225,
    rightSensitivity: 225,
    handSpeedThreshold: 0.03,
    handSmoothing: 10,
    handRadius: 30,
    handGain: 250,
  },
});
export const RESPONSE_KEYS = Object.keys(RESPONSE_PRESETS.NORMAL);
export function responseName(config) {
  return (
    Object.entries(RESPONSE_PRESETS).find(([, p]) =>
      RESPONSE_KEYS.every((k) => config[k] === p[k]),
    )?.[0] || "CUSTOM"
  );
}
