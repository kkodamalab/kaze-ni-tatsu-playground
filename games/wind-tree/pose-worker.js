let pose;
self.onmessage = async ({ data }) => {
  if (data.type === "init")
    try {
      const { PoseLandmarker, FilesetResolver } =
        await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
      pose = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
      });
      self.postMessage({ type: "ready" });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "Pose model unavailable: " + e.message,
      });
    }
  if (data.type === "frame")
    try {
      const start = performance.now(),
        result = pose.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({
        type: "result",
        result,
        timestamp: data.timestamp,
        generation: data.generation,
        inferenceMs: performance.now() - start,
      });
    } catch (e) {
      self.postMessage({
        type: "error",
        message: "Pose inference unavailable: " + e.message,
      });
    } finally {
      data.bitmap.close();
    }
};
