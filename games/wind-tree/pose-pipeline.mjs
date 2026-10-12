// One reusable Pose model in a Worker, shared by the original game and Wind Lab.
export class PosePipeline {
  static async create(options = {}) {
    const pipeline = new PosePipeline(options);
    try {
      await pipeline.ready;
      return pipeline;
    } catch (e) {
      pipeline.close();
      throw e;
    }
  }
  constructor({
    workerFactory = () =>
      new Worker(new URL("./pose-worker.js", import.meta.url)),
    bitmapFactory = (video, options) => createImageBitmap(video, options),
  } = {}) {
    this.bitmapFactory = bitmapFactory;
    this.worker = workerFactory();
    this.result = { landmarks: [], worldLandmarks: [], pending: true };
    this.lastVideo = -1;
    this.generation = 0;
    this.closed = false;
    this.busy = false;
    this.ready = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    this.loadTimeout = setTimeout(
      () => this.fail(Error("Pose model load timeout")),
      45000,
    );
    this.worker.onmessage = ({ data }) => {
      if (this.closed) return;
      if (data.type === "ready") {
        clearTimeout(this.loadTimeout);
        this.resolve();
      }
      if (data.type === "error")
        this.fail(Error(data.message || "Pose inference failed"));
      if (data.type === "result") {
        clearTimeout(this.frameTimeout);
        this.busy = false;
        if (data.generation === this.generation)
          this.result = {
            ...data.result,
            imageWidth: data.imageWidth,
            imageHeight: data.imageHeight,
            timestamp: data.timestamp,
            inferenceMs: data.inferenceMs,
          };
      }
    };
    this.worker.onerror = () => this.fail(Error("Pose worker failed"));
    this.worker.postMessage({ type: "init" });
  }
  fail(error) {
    this.error = error;
    clearTimeout(this.loadTimeout);
    clearTimeout(this.frameTimeout);
    this.reject(error);
  }
  detectForVideo(video, timestamp) {
    if (this.error) throw this.error;
    if (this.closed) return null;
    if (
      !this.busy &&
      video.readyState >= 2 &&
      video.currentTime !== this.lastVideo
    ) {
      this.busy = true;
      this.lastVideo = video.currentTime;
      const generation = this.generation;
      const width = Math.min(640, video.videoWidth || 640),
        height = Math.max(
          1,
          Math.round(
            (width * (video.videoHeight || 480)) / (video.videoWidth || 640),
          ),
        );
      this.bitmapFactory(video, { resizeWidth: width, resizeHeight: height })
        .then((bitmap) => {
          if (this.closed || generation !== this.generation) {
            bitmap.close();
            this.busy = false;
            return;
          }
          this.worker.postMessage(
            { type: "frame", bitmap, timestamp, generation },
            [bitmap],
          );
          this.frameTimeout = setTimeout(
            () => this.fail(Error("Pose inference timeout")),
            10000,
          );
        })
        .catch((e) => {
          this.busy = false;
          this.fail(e);
        });
    }
    if (
      this.result.timestamp !== undefined &&
      timestamp - this.result.timestamp > 500
    )
      return {
        landmarks: [],
        worldLandmarks: [],
        timestamp: this.result.timestamp,
        pending: true,
      };
    return this.result;
  }
  reset() {
    this.generation++;
    this.result = { landmarks: [], worldLandmarks: [], pending: true };
    this.lastVideo = -1;
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.reset();
    clearTimeout(this.loadTimeout);
    clearTimeout(this.frameTimeout);
    this.worker.terminate();
  }
}
