// Synthetic test fixtures, never measurements of a real participant.
export const POSE_TESTS = {
  A: "ニュートラル",
  B: "左右傾斜",
  C: "前後傾斜",
  D: "左手左右",
  E: "右手上下",
  F: "両手",
  G: "欠損・復帰",
};
export function poseSequence(test, seconds) {
  const swing = Math.sin(seconds * 2),
    points = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.18,
      z: 0,
      visibility: 1,
    }));
  points[11] = { x: 0.4, y: 0.32, z: 0, visibility: 1 };
  points[12] = { x: 0.6, y: 0.32, z: 0, visibility: 1 };
  points[23] = { x: 0.45, y: 0.62, z: 0, visibility: 1 };
  points[24] = { x: 0.55, y: 0.62, z: 0, visibility: 1 };
  points[13] = { x: 0.32, y: 0.4, z: 0, visibility: 1 };
  points[14] = { x: 0.68, y: 0.4, z: 0, visibility: 1 };
  points[15] = { x: 0.25, y: 0.5, z: 0, visibility: 1 };
  points[16] = { x: 0.75, y: 0.5, z: 0, visibility: 1 };
  for (const [k, a, h, t, x] of [
    [25, 27, 29, 31, 0.44],
    [26, 28, 30, 32, 0.56],
  ]) {
    points[k] = { x, y: 0.8, z: 0, visibility: 1 };
    for (const i of [a, h, t]) points[i] = { x, y: 0.96, z: 0, visibility: 1 };
  }
  if (test === "B") for (let i = 0; i <= 22; i++) points[i].x -= swing * 0.1;
  if (test === "C") for (let i = 0; i <= 22; i++) points[i].z = swing * 0.1;
  if (test === "D" || test === "F") points[15].x += swing * 0.1;
  if (test === "E" || test === "F") points[16].y += swing * 0.1;
  for (const [w, ids] of [
    [15, [17, 19, 21]],
    [16, [18, 20, 22]],
  ])
    for (const i of ids) points[i] = { ...points[w] };
  if (test === "G" && seconds % 4 >= 1 && seconds % 4 < 2.4)
    return { landmarks: null, worldLandmarks: null };
  return {
    landmarks: points,
    worldLandmarks: points.map((p) => ({
      ...p,
      x: (p.x - 0.5) * 2,
      y: (p.y - 0.62) * 2,
      z: p.z * 2,
    })),
  };
}
