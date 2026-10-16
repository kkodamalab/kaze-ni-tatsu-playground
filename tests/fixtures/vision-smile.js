// Test double for the MediaPipe model runtime; workers and capture code stay real.
function landmarks() {
  const p = Array.from({ length: 33 }, () => ({
    x: 0.5,
    y: 0.2,
    z: 0,
    visibility: 1,
    presence: 1,
  }));
  for (const [i, x, y] of [
    [11, 0.4, 0.32],
    [12, 0.6, 0.32],
    [23, 0.45, 0.62],
    [24, 0.55, 0.62],
    [13, 0.3, 0.4],
    [14, 0.7, 0.4],
    [15, 0.25, 0.5],
    [16, 0.75, 0.5],
    [25, 0.44, 0.8],
    [26, 0.56, 0.8],
    [27, 0.44, 0.96],
    [28, 0.56, 0.96],
  ])
    p[i] = { x, y, z: 0, visibility: 1, presence: 1 };
  return p;
}
export const FilesetResolver = { forVisionTasks: async () => ({}) };
export const FaceLandmarker = {
  createFromOptions: async () => {
    let begin;
    return {
      detectForVideo(bitmap, t) {
        begin ??= t;
        const score = (t - begin) % 2000 < 1200 ? 0.98 : 0;
        return {
          faceLandmarks: [
            [
              { x: 0.3, y: 0.25 },
              { x: 0.7, y: 0.25 },
              { x: 0.7, y: 0.7 },
              { x: 0.3, y: 0.7 },
            ],
          ],
          faceBlendshapes: [
            {
              categories: [
                { categoryName: "mouthSmileLeft", score },
                { categoryName: "mouthSmileRight", score },
              ],
            },
          ],
        };
      },
      close() {
        globalThis.__modelCloses = (globalThis.__modelCloses || 0) + 1;
      },
    };
  },
};
export const PoseLandmarker = {
  createFromOptions: async () => ({
    detectForVideo() {
      return { landmarks: [landmarks()], worldLandmarks: [] };
    },
    close() {
      globalThis.__modelCloses = (globalThis.__modelCloses || 0) + 1;
    },
  }),
};
