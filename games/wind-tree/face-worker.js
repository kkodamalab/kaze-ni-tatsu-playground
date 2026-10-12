let faceObservation;
let face,
  previous = null,
  lastTime = null;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      ({ faceObservation } = await import("./photos.mjs"));
      const { FaceLandmarker, FilesetResolver } =
        await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/+esm");
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm",
      );
      face = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      self.postMessage({ type: "ready" });
    } catch {
      self.postMessage({
        type: "error",
        message:
          "笑顔モデルを読み込めませんでした。撮影なしでゲームを続けます。",
      });
    }
  }
  if (data.type === "frame") {
    try {
      const result = face.detectForVideo(data.bitmap, data.timestamp);
      const observation = faceObservation(
        result,
        previous,
        lastTime === null ? 125 : data.timestamp - lastTime,
      );
      previous = observation.center;
      lastTime = data.timestamp;
      self.postMessage({
        type: "result",
        observation,
        timestamp: data.timestamp,
      });
    } catch {
      self.postMessage({
        type: "error",
        message: "笑顔推定を停止しました。撮影なしでゲームを続けます。",
      });
    } finally {
      data.bitmap.close();
    }
  }
};
