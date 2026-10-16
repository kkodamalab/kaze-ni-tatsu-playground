import test from "node:test";
import assert from "node:assert/strict";
import {
  SmileGate,
  PhotoSession,
  smileScore,
  faceObservation,
} from "../shared/photos.mjs";
import { SharedSmileCapture } from "../shared/smile-capture.mjs";
import {
  cleanPhotoSettings,
  PhotoSettingsStore,
  photoDefaults,
  photoSettingsKey,
  today,
} from "../shared/photo-settings.js";
import {
  giftURL,
  validManifest,
  pngBytes,
  transferLimits,
  GiftSender,
} from "../shared/gift-transfer.js";
import { giftRects, resultText } from "../shared/gift-renderer.js";

const frames = (gate, score, start, end, detected = true) => {
  const captures = [];
  for (let t = start; t <= end; t += 100)
    if (gate.update(score, t, detected)) captures.push(t);
  return captures;
};
test("shared smile score is a bounded blendshape coefficient and requires sustained smile/rearm/cooldown", () => {
  assert.equal(
    smileScore([
      { categoryName: "mouthSmileLeft", score: 1 },
      { categoryName: "mouthSmileRight", score: 1 },
    ]),
    1,
  );
  assert.equal(smileScore([]), 0);
  const gate = new SmileGate();
  assert.equal(frames(gate, 1, 0, 400).length, 0);
  const first = frames(gate, 1, 500, 1200);
  assert.equal(first.length, 1);
  assert.ok(first[0] >= 500);
  assert.equal(
    frames(gate, 1, 1300, 5000).length,
    0,
    "held smile must not spam shots",
  );
  frames(gate, 0, 5100, 5700);
  assert.equal(frames(gate, 1, 5800, 7000).length, 1);
  const cooldown = new SmileGate(0.6, { holdMs: 500, cooldownMs: 3000 });
  assert.equal(frames(cooldown, 1, 0, 1200).length, 1);
  frames(cooldown, 0, 1300, 1800);
  assert.equal(frames(cooldown, 1, 1900, 3500).length, 0);
  assert.equal(frames(cooldown, 1, 3600, 4600).length, 1);
});
test("threshold, duration, missing faces and gaps reject brief or stale smiles", () => {
  const gate = new SmileGate(0.9, { holdMs: 800, cooldownMs: 1000 });
  assert.equal(frames(gate, 0.8, 0, 2000).length, 0);
  assert.equal(frames(gate, 1, 2100, 2500).length, 0);
  frames(gate, 0, 2600, 3000, false);
  assert.equal(frames(gate, 1, 3100, 3500).length, 0);
  assert.equal(gate.update(1, 5000), false, "long frame gap resets hold");
  assert.equal(frames(gate, 1, 5100, 6500).length, 1);
  assert.equal(faceObservation({ faceLandmarks: [] }).detected, false);
});
test("photo settings persist only whitelisted operator values; consent and photo bytes never persist", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    };
  const store = new PhotoSettingsStore(storage);
  assert.deepEqual(store.value, photoDefaults);
  store.update({
    threshold: 100,
    maxPhotos: 10,
    holdSeconds: 0.8,
    cooldownSeconds: 5,
    eventName: "テスト",
    eventDate: "2026-10-18",
    consent: true,
    photos: ["secret"],
    blob: "bytes",
    image: "data:image/png;base64,private",
  });
  const saved = JSON.parse(data.get(photoSettingsKey));
  assert.ok(!("consent" in saved));
  assert.ok(!JSON.stringify(saved).includes("private"));
  assert.ok(!("photos" in saved));
  assert.deepEqual(new PhotoSettingsStore(storage).value, store.value);
  assert.equal(store.event().date, "2026-10-18");
  assert.equal(today(new Date(2026, 9, 16)), "2026-10-16");
  assert.equal(
    cleanPhotoSettings({ threshold: -1, maxPhotos: 99 }).threshold,
    10,
  );
  assert.equal(
    cleanPhotoSettings({ threshold: -1, maxPhotos: 99 }).maxPhotos,
    10,
  );
  const blocked = new PhotoSettingsStore({
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  });
  blocked.update({ enabled: false });
  assert.equal(blocked.value.enabled, false);
});
test("photo cap 1/5/10, selection, stale participant and URL revocation", () => {
  for (const maxPhotos of [1, 5, 10]) {
    const revoked = [],
      urls = {
        createObjectURL: (b) => "blob:" + b.size + Math.random(),
        revokeObjectURL: (u) => revoked.push(u),
      };
    const session = new PhotoSession(urls, { maxPhotos });
    session.start("one");
    for (let i = 0; i < maxPhotos; i++)
      assert.ok(session.add(new Blob(["image"]), { quality: 1 }, "one"));
    assert.equal(
      session.add(new Blob(["overflow"]), { quality: 1 }, "one"),
      null,
    );
    session.select(session.photos[0].id);
    assert.ok(session.getSelectedGift());
    session.start("two");
    assert.equal(revoked.length, maxPhotos);
    assert.equal(session.getSelectedGift(), null);
    assert.equal(session.add(new Blob(["late"]), {}, "one"), null);
  }
});
test("SharedSmileCapture denies missing consent and stops workers on failure/stop", () => {
  const session = new PhotoSession(),
    events = [];
  let workers = 0,
    terminated = 0,
    consent = false;
  const capture = new SharedSmileCapture({
    session,
    video: {},
    hasConsent: () => consent,
    onStatus: (m) => events.push(m),
    onPhoto() {},
    getElapsed: () => 0,
    isPlaying: () => true,
    workerFactory: () => {
      workers++;
      return {
        postMessage() {},
        terminate() {
          terminated++;
        },
      };
    },
  });
  capture.start(0.6);
  assert.equal(workers, 0);
  assert.equal(capture.enabled, false);
  consent = true;
  capture.start(0.6, { holdMs: 500, cooldownMs: 3000 });
  assert.equal(workers, 1);
  assert.equal(capture.gate.holdMs, 500);
  capture.configure({
    threshold: 90,
    holdSeconds: 1,
    cooldownSeconds: 4,
    faceFps: 5,
    maxPhotos: 2,
  });
  assert.equal(capture.gate.threshold, 0.9);
  assert.equal(capture.gate.cooldownMs, 4000);
  capture.stop();
  assert.equal(terminated, 1);
  assert.equal(capture.worker, null);
  assert.equal(capture.enabled, false);
  capture.start(0.6);
  capture.worker.onmessage({
    data: { type: "error", message: "model unavailable" },
  });
  assert.equal(capture.enabled, false);
  assert.equal(terminated, 2);
});
test("transfer URL contains only connection identity/key; bounds, MIME and PNG signature validated", () => {
  const url = new URL(
    giftURL(
      "https://example.com/kaze/games/seesaw/index.html?room=old#fragment",
      "peer-id",
      "a".repeat(64),
    ),
  );
  assert.deepEqual([...url.searchParams.keys()], ["gift", "token"]);
  assert.equal(url.hash, "");
  assert.ok(!url.href.includes("image/"));
  assert.throws(() => giftURL("javascript:alert(1)", "peer", "a".repeat(64)));
  assert.throws(() => giftURL("https://example.com", "peer", "bad"));
  assert.ok(
    validManifest({ type: "manifest", mime: "image/png", size: 8, chunks: 1 }),
  );
  assert.ok(
    !validManifest({
      type: "manifest",
      mime: "image/jpeg",
      size: 8,
      chunks: 1,
    }),
  );
  assert.ok(
    !validManifest({
      type: "manifest",
      mime: "image/png",
      size: transferLimits.bytes + 1,
      chunks: 1,
    }),
  );
  assert.ok(pngBytes(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])));
  assert.ok(!pngBytes(new Uint8Array(8)));
});
test("gift layouts retain portrait/landscape, crops and both game labels", () => {
  for (const layout of ["A", "B", "C", "D", "E"]) {
    const g = giftRects(
      {
        layout,
        orientation: "portrait",
        title: true,
        event: true,
        result: true,
      },
      { smile: true, drawing: true },
    );
    assert.equal(g.w, 1080);
    assert.equal(g.h, 1620);
    assert.ok(g.rects.every((r) => r.w > 0 && r.h > 0));
  }
  assert.equal(
    giftRects({ orientation: "landscape" }, { smile: true }).w,
    1620,
  );
  assert.match(
    resultText({ gameName: "風に立つ", result: { treeGrowth: 0.75 } }),
    /75%/,
  );
  assert.match(
    resultText({
      gameName: "シーソーゲーム",
      gameMode: "KEEP",
      result: { dropCount: 1 },
    }),
    /1/,
  );
});

test("QR sender rejects unauthorized receivers, chunks/ACKs PNG and expires all temporary data", async () => {
  class Events {
    constructor() {
      this.events = {};
    }
    on(k, f) {
      (this.events[k] ??= []).push(f);
    }
    emit(k, v) {
      for (const f of this.events[k] || []) f(v);
    }
  }
  class Peer extends Events {
    destroy() {
      this.destroyed = true;
    }
  }
  class Conn extends Events {
    constructor() {
      super();
      this.open = true;
      this.messages = [];
    }
    send(m) {
      this.messages.push(m);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      this.open = false;
      this.emit("close");
    }
  }
  const original = {
      Peer: globalThis.Peer,
      QRCode: globalThis.QRCode,
      setTimeout,
      clearTimeout,
    },
    timers = [];
  globalThis.Peer = Peer;
  globalThis.QRCode = class {
    static CorrectLevel = { M: 0 };
  };
  globalThis.setTimeout = (fn, ms) => {
    const timer = { fn, ms };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = (timer) => {
    if (timer) timer.cancelled = true;
  };
  try {
    const sender = new GiftSender(),
      blob = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: "image/png",
      });
    await sender.start(
      blob,
      "https://example.com/games/seesaw/index.html",
      { replaceChildren() {}, removeAttribute() {} },
      {},
    );
    const peer = sender.peer,
      bad = new Conn();
    peer.emit("connection", bad);
    bad.emit("open");
    bad.emit("data", { type: "hello", token: "wrong" });
    assert.equal(bad.closed, true);
    const conn = new Conn();
    peer.emit("connection", conn);
    conn.emit("open");
    conn.emit("data", { type: "hello", token: sender.token });
    await new Promise((r) => setImmediate(r));
    assert.equal(conn.messages[0].type, "manifest");
    assert.equal(conn.messages[1].type, "chunk");
    assert.ok(pngBytes(conn.messages[1].bytes));
    conn.emit("data", { type: "ack", index: 0 });
    assert.equal(conn.messages.at(-1).type, "complete");
    conn.emit("data", { type: "received" });
    timers.find((timer) => timer.ms === transferLimits.ttl).fn();
    assert.equal(peer.destroyed, true);
    assert.equal(conn.closed, true);
    assert.equal(sender.blob, null);
    assert.equal(sender.token, null);
  } finally {
    globalThis.Peer = original.Peer;
    globalThis.QRCode = original.QRCode;
    globalThis.setTimeout = original.setTimeout;
    globalThis.clearTimeout = original.clearTimeout;
  }
});

test("late JPEG encoding after consent withdrawal/participant change cannot retain a photo", async () => {
  const original = globalThis.document,
    canvases = [];
  let resolveBlob,
    consent = true,
    photoEvents = 0;
  globalThis.document = {
    createElement() {
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return {
            translate() {},
            scale() {},
            drawImage() {},
            getImageData() {
              return { data: new Uint8ClampedArray(96 * 72 * 4) };
            },
          };
        },
        toBlob(fn) {
          resolveBlob = fn;
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  const session = new PhotoSession();
  session.start("first");
  const capture = new SharedSmileCapture({
    video: { videoWidth: 640, videoHeight: 480 },
    session,
    hasConsent: () => consent,
    onStatus() {},
    onPhoto() {
      photoEvents++;
    },
    getElapsed: () => 1000,
    isPlaying: () => true,
    getAspect: () => 4 / 3,
    workerFactory: () => ({ postMessage() {}, terminate() {} }),
  });
  try {
    capture.start(0.6);
    capture.gate.score = 0.9;
    const pending = capture.capture({ detected: true, quality: 1 });
    assert.equal(typeof resolveBlob, "function");
    consent = false;
    capture.stop();
    session.start("second");
    resolveBlob(new Blob(["late"], { type: "image/jpeg" }));
    await pending;
    assert.equal(session.photos.length, 0);
    assert.equal(photoEvents, 0);
    assert.equal(canvases[0].width, 0);
  } finally {
    capture.stop();
    globalThis.document = original;
  }
});

test("pending camera permission is shared, and cancellation stops a late stream", async () => {
  const { SharedCaptureSession } = await import("../shared/capture-session.js");
  const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let resolveCamera,
    calls = 0,
    stopped = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia() {
          calls++;
          return new Promise((r) => (resolveCamera = r));
        },
      },
    },
  });
  const capture = new SharedCaptureSession({
    settingsUI: { hasConsent: () => true, status() {} },
    getElapsed: () => 0,
    isPlaying: () => true,
  });
  try {
    const pending = capture.begin();
    await capture.begin(null, { reset: false });
    assert.equal(calls, 1);
    capture.clear();
    resolveCamera({
      getTracks: () => [
        {
          stop() {
            stopped++;
          },
        },
      ],
    });
    await pending;
    assert.equal(stopped, 1);
    assert.equal(capture.photos.photos.length, 0);
    assert.equal(capture.starting, false);
  } finally {
    capture.clear();
    if (original) Object.defineProperty(globalThis, "navigator", original);
    else delete globalThis.navigator;
  }
});
