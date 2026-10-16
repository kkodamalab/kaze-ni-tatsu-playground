import test from "node:test";
import assert from "node:assert/strict";
import { ScheduledCapture, captureTimes } from "../shared/scheduled-capture.js";
import { PhotoSession, SmileGate, faceObservation } from "../shared/photos.mjs";
import { sanitizeTuning } from "../games/seesaw/src/device-tuning.js";

function fixture(options = {}) {
  const session = new PhotoSession({
    createObjectURL: () => `blob:${Math.random()}`,
    revokeObjectURL() {},
  });
  session.start("participant");
  const state = {
    playing: true,
    consent: true,
    enabled: true,
    snapshots: 0,
    errors: [],
  };
  const schedule = new ScheduledCapture({
    duration: 30,
    session,
    getVideo: () => ({}),
    hasConsent: () => state.consent,
    isPlaying: () => state.playing,
    isEnabled: () => state.enabled,
    createFrame: () => {
      state.snapshots++;
      return {
        width: 640,
        height: 480,
        toBlob: (fn) => fn(new Blob(["photo"], { type: "image/jpeg" })),
      };
    },
    onError: (detail) => state.errors.push(detail),
    ...options,
  });
  return { session, state, schedule };
}

test("20/30/60 second schedules retain exactly four independently reserved slots at duration*k/4", async () => {
  for (const duration of [20, 30, 60]) {
    assert.deepEqual(captureTimes(duration), [
      duration / 4,
      duration / 2,
      (duration * 3) / 4,
      duration,
    ]);
    const { schedule, session, state } = fixture({ duration });
    for (let time = 0; time <= duration; time += 0.25) schedule.advance(time);
    await schedule.finish(duration);
    assert.equal(session.photos.length, 4);
    assert.equal(state.snapshots, 4);
    assert.deepEqual(
      session.photos.map((p) => p.scheduledSec),
      captureTimes(duration),
    );
    assert.deepEqual(
      session.photos.map((p) => p.elapsedSec),
      captureTimes(duration),
    );
    assert.ok(session.photos.every((p) => p.reason === "scheduled"));
  }
});
test("only active game time advances capture; pause, repeated RAF, and early finish cannot duplicate/backfill slots", async () => {
  const { schedule, session, state } = fixture();
  state.playing = false;
  schedule.advance(30);
  assert.equal(state.snapshots, 0);
  state.playing = true;
  schedule.advance(7.5);
  schedule.advance(7.5);
  schedule.advance(8);
  await schedule.finish(8);
  schedule.advance(30);
  assert.equal(session.photos.length, 1);
  assert.equal(state.snapshots, 1);
});
test("no consent or capture OFF creates no frame and no retained photo; past slots stay skipped", async () => {
  for (const key of ["consent", "enabled"]) {
    const { schedule, session, state } = fixture();
    state[key] = false;
    schedule.advance(7.5);
    schedule.advance(15);
    assert.equal(state.snapshots, 0);
    state[key] = true;
    schedule.advance(22.5);
    await schedule.finish(30);
    assert.deepEqual(
      session.photos.map((p) => p.scheduledSlot),
      [3, 4],
    );
  }
});
test("four scheduled photos plus five smile photos survive either arrival order and clear all URLs", async () => {
  for (const smileFirst of [true, false]) {
    const { schedule, session } = fixture();
    const smile = () => {
      for (let i = 0; i < 6; i++)
        session.add(new Blob(["smile"]), { reason: "smile" }, session.trialId);
    };
    if (smileFirst) smile();
    for (const time of schedule.times) schedule.advance(time);
    await schedule.finish(30);
    if (!smileFirst) smile();
    assert.equal(session.count(), 5);
    assert.equal(session.count("scheduled"), 4);
    assert.equal(session.photos.length, 9);
    assert.equal(session.canAdd(), false);
    session.clear();
    assert.equal(session.photos.length, 0);
  }
});
test("the final snapshot and JPEG settle before finish completes; cancellation rejects late encoded data", async () => {
  let encode;
  const { schedule, session, state } = fixture({
    createFrame: () => ({
      width: 1,
      height: 1,
      toBlob: (fn) => {
        encode = fn;
      },
    }),
  });
  let finished = false;
  const ending = schedule.finish(30).then(() => {
    finished = true;
  });
  assert.equal(typeof encode, "function");
  assert.equal(finished, false);
  // This jump queues four slots. Cancel rejects all in-flight encodings before participant reuse.
  schedule.cancel();
  state.consent = false;
  encode(new Blob(["late"]));
  await ending;
  assert.equal(session.photos.length, 0);
  let finalEncode;
  const one = fixture({
    duration: 1,
    count: 1,
    createFrame: () => ({
      width: 1,
      height: 1,
      toBlob: (fn) => {
        finalEncode = fn;
      },
    }),
  });
  let done = false;
  const final = one.schedule.finish(1).then(() => {
    done = true;
  });
  assert.equal(done, false);
  finalEncode(new Blob(["last"]));
  await final;
  assert.equal(done, true);
  assert.equal(one.session.photos[0].elapsedSec, 1);
});
test("encoding failure logs a reason and retries the same slot once, without duplicate photos", async () => {
  let attempts = 0;
  const { schedule, session, state } = fixture({
    duration: 1,
    count: 1,
    createFrame: () => ({
      width: 1,
      height: 1,
      toBlob: (fn) => fn(++attempts === 1 ? null : new Blob(["retry"])),
    }),
  });
  schedule.advance(1);
  schedule.advance(1);
  await schedule.finish(1);
  assert.equal(attempts, 2);
  assert.equal(session.photos.length, 1);
  assert.match(state.errors[0].reason, /encoding/);
  const missing = fixture({ duration: 1, count: 1, createFrame: () => null });
  await missing.schedule.finish(1);
  assert.equal(missing.session.photos.length, 0);
  assert.match(missing.state.errors[0].reason, /not ready/);
});
test("smile holds tolerate 450ms inference cadence and a mostly visible face at the edge", () => {
  const gate = new SmileGate(0.6);
  let count = 0;
  for (let t = 0; t < 3000; t += 450) count += Number(gate.update(0.95, t));
  assert.equal(count, 1);
  assert.equal(
    gate.update(0.95, 6000),
    false,
    "a genuinely stale observation resets the hold",
  );
  const observation = faceObservation({
    faceLandmarks: [
      [
        { x: -0.02, y: 0.2 },
        { x: 0.4, y: 0.2 },
        { x: 0.4, y: 0.7 },
        { x: -0.02, y: 0.7 },
      ],
    ],
    faceBlendshapes: [
      {
        categories: [
          { categoryName: "mouthSmileLeft", score: 0.9 },
          { categoryName: "mouthSmileRight", score: 0.9 },
        ],
      },
    ],
  });
  assert.equal(observation.detected, true);
  assert.ok(observation.score >= 0.89);
  assert.equal(
    faceObservation({
      faceLandmarks: [
        [
          { x: -1, y: 0 },
          { x: 0.1, y: 0 },
          { x: 0.1, y: 0.8 },
          { x: -1, y: 0.8 },
        ],
      ],
    }).detected,
    false,
  );
});
test("board range clamps persisted values to 25..100 percent, keeps default and old 70..100 behavior", () => {
  for (const value of [0.25, 0.5, 0.7, 1])
    assert.equal(sanitizeTuning({ boardLength: value }).boardLength, value);
  assert.equal(sanitizeTuning({ boardLength: 1.3 }).boardLength, 1);
  assert.equal(sanitizeTuning({ boardLength: 0.1 }).boardLength, 0.25);
  assert.equal(sanitizeTuning().boardLength, 1);
});

test('all scheduled counts 1..10 use duration*k/count and reserve capacity independently of five smile extras', async () => {
  for (const duration of [20,30,60]) for (let count=1;count<=10;count++) {
    const {schedule,session}=fixture({duration,count});
    for(let i=0;i<6;i++)session.add(new Blob(['smile']),{reason:'smile'},session.trialId);
    for(const time of captureTimes(duration,count))schedule.advance(time);
    await schedule.finish(duration);
    assert.equal(session.count('scheduled'),count);assert.equal(session.count(),5);
    assert.deepEqual(session.photos.filter(p=>p.reason==='scheduled').map(p=>p.scheduledSec),Array.from({length:count},(_,i)=>duration*(i+1)/count));
  }
});

test('scheduled count defaults to four, persists, and sanitizes invalid saved values to integers 1..10',async()=>{
  const {PhotoSettingsStore,cleanPhotoSettings}=await import('../shared/photo-settings.js');
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const store=new PhotoSettingsStore(storage);assert.equal(store.value.scheduledCount,4);
  for(let count=1;count<=10;count++){store.update({scheduledCount:count});assert.equal(new PhotoSettingsStore(storage).value.scheduledCount,count);}
  for(const [input,expected] of [[0,1],[11,10],[3.6,4],[NaN,4],['3',4],[null,4]])assert.equal(cleanPhotoSettings({scheduledCount:input}).scheduledCount,expected);
});
