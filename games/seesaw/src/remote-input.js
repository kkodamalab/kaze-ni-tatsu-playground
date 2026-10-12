import { config } from './config.js?v=20261009-ui-physics';
import { clamp } from './input.js?v=20261009-ui-physics';
export const protocol = 'keep-the-egg/1';

export function tiltPacket(input, { sequence, sessionId, sensorOn, calibrationId, visible = true, test = false,
  timestamp = Date.now(), now = performance.now() }) {
  const sample = input.read();
  const fresh = input.ready && now - input.lastSample < config.staleMs;
  return { type: 'input', protocol, playerId: 'A', inputType: test ? 'test' : 'tilt',
    sequenceNumber: sequence, sessionId, clientTimestamp: timestamp, timestamp,
    rawValue: sample.rawAngle, normalizedValue: (sample.normalizedTilt + 1) * 50,
    rawAngle: sample.rawAngle, relativeAngle: sample.relativeAngle, filteredAngle: input.filteredAngle,
    baselineAngle: input.baselineAngle, sensorOn: Boolean(sensorOn && fresh && visible),
    calibrated: Boolean(input.calibrated), calibrationId, sampleAgeMs: Math.max(0, now - input.lastSample),
  };
}

export class RemoteTiltInput {
  constructor() { this.reset(); }
  reset() {
    this.connected = false; this.ready = false; this.calibrated = false; this.sensorOn = false;
    this.lastSample = -Infinity; this.sequence = -1; this.sessionId = null; this.calibrationId = 0;
    this.rawAngle = this.filteredAngle = this.relativeAngle = this.baselineAngle = 0;
    this.inputType = 'tilt'; this.timestamp = 0;
  }
  setConnected(connected) { this.reset(); this.connected = connected; }
  receive(packet, now = performance.now()) {
    if (!this.connected || packet?.protocol !== protocol || packet.type !== 'input' || packet.playerId !== 'A') return false;
    if (!['tilt', 'test'].includes(packet.inputType) || typeof packet.sessionId !== 'string' || !packet.sessionId) return false;
    if (!Number.isSafeInteger(packet.sequenceNumber) || packet.sequenceNumber <= this.sequence) return false;
    if (this.sessionId && this.sessionId !== packet.sessionId) return false;
    if (!['rawAngle', 'relativeAngle', 'filteredAngle', 'baselineAngle', 'timestamp'].every(key => Number.isFinite(packet[key]))) return false;
    if (Math.abs(packet.relativeAngle) > 180 || Math.abs(packet.rawAngle) > 180 || Math.abs(packet.filteredAngle) > 10000) return false;
    if (typeof packet.sensorOn !== 'boolean' || typeof packet.calibrated !== 'boolean' || !Number.isSafeInteger(packet.calibrationId) || packet.calibrationId < 0) return false;
    if (packet.sensorOn && (!Number.isFinite(packet.sampleAgeMs) || packet.sampleAgeMs < 0 || packet.sampleAgeMs >= config.staleMs)) return false;
    this.sessionId = packet.sessionId; this.sequence = packet.sequenceNumber;
    for (const key of ['rawAngle', 'relativeAngle', 'filteredAngle', 'baselineAngle', 'sensorOn', 'calibrated', 'calibrationId', 'inputType', 'timestamp']) this[key] = packet[key];
    this.lastSample = now; this.ready = this.sensorOn;
    return true;
  }
  fresh(now = performance.now()) { return this.connected && this.sensorOn && this.ready && now - this.lastSample < config.staleMs; }
  canStart(now = performance.now()) { return this.fresh(now) && this.calibrated; }
  read() {
    const gameAngle = clamp(this.relativeAngle, -config.maxAngle, config.maxAngle);
    return { rawAngle: this.rawAngle, relativeAngle: this.relativeAngle, gameAngle,
      normalizedTilt: gameAngle / config.maxAngle, filteredAngle: this.filteredAngle };
  }
}
