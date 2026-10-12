export const config = Object.freeze({
  duration: 30, maxAngle: 30, alpha: 0.24, sampleInterval: 0.1,
  step: 1 / 120, respawnSeconds: 1.4, starSeconds: 2, staleMs: 2500,
});
// Positions are normalized: platform ends are -1 and +1. Times are seconds.
export const difficulties = Object.freeze({
  easy: { label: '★ かんたん', safeZoneWidth: 0.52, gravity: 1.8, damping: 2.8, centering: 1.3, maxSpeed: 0.55 },
  normal: { label: '★★ ふつう', safeZoneWidth: 0.36, gravity: 2.8, damping: 2.2, centering: 1.0, maxSpeed: 0.8 },
  hard: { label: '★★★ むずかしい', safeZoneWidth: 0.23, gravity: 4, damping: 1.8, centering: 0.8, maxSpeed: 1.1 },
});

export const gameModes = Object.freeze({
  KEEP: { label: '落とさず守ろう', duration: 30 },
  STAR: { label: '落ち葉をあつめよう 🍂', duration: 30 },
  SURVIVAL: { label: 'どこまで耐えられる？', duration: 60 },
});
export const objects = Object.freeze({
  EGG: { label: 'たまご', gravity: 1, damping: 1, speed: 1 },
  SOCCER_BALL: { label: 'サッカーボール', gravity: 1.2, damping: .85, speed: 1.15 },
  BASKETBALL: { label: 'バスケットボール', gravity: 1.2, damping: .85, speed: 1.15 },
  BALL: { legacy: true, label: 'ボール', gravity: 1.2, damping: .85, speed: 1.15 },
  APPLE: { label: 'りんご', gravity: .9, damping: 1.1, speed: .9 },
  CHICK: { label: 'ひよこ', gravity: .65, damping: 1.2, speed: .7 },
  IMAGE_FILE: { label: '画像', selectionLabel: 'ファイルを選択', gravity: 1, damping: 1, speed: 1 },
  IMAGE_CAMERA: { label: '写真', selectionLabel: '写真を撮影', gravity: 1, damping: 1, speed: 1 },
  PEAR: { label: 'なし', gravity: 1, damping: 1, speed: 1 },
  CHESTNUT: { label: 'くり', gravity: 1, damping: 1, speed: 1 },
  MAPLE: { label: 'もみじ', gravity: 1, damping: 1, speed: 1 },
  LEAF: { label: '落ち葉', gravity: 1, damping: 1, speed: 1 },
  PUMPKIN: { label: 'かぼちゃ', gravity: 1, damping: 1, speed: 1 },
  MUSHROOM: { label: 'きのこ', gravity: 1, damping: 1, speed: 1 },
  MY_FACE: { legacy: true, label: 'じぶんの顔', gravity: 1, damping: 1, speed: 1 },
  MY_DRAWING: { legacy: true, label: 'じぶんの絵', gravity: 1, damping: 1, speed: 1 },
  MY_PHOTO: { legacy: true, label: '写真', gravity: 1, damping: 1, speed: 1 },
});
export function physicsSettings(difficulty, objectType) {
  const d = difficulties[difficulty], o = objects[objectType];
  if (!d || !o) throw new Error('Unknown difficulty or object');
  return { ...d, gravity: d.gravity * o.gravity, damping: d.damping * o.damping,
    maxSpeed: Math.min(1.2, d.maxSpeed * o.speed) };
}

export const audioConfig = Object.freeze({ danger: .70, critical: .90, cooldown: 2, voiceCooldown: 4 });
export function playDuration(value) { const n = Number(value); if (!Number.isFinite(n) || n < 5 || n > 60 || n % 5) throw new Error("Duration must be 5–60 seconds in steps of 5"); return n; }

export const isImageObject = type => type.startsWith('MY_') || type.startsWith('IMAGE_');
