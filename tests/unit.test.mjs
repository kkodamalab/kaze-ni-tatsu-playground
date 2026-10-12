import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "../games/wind-tree/vendor/three/three.module.js";
import { OrbitControls } from "../games/wind-tree/vendor/three/OrbitControls.js";
import { WindEngine } from "../games/wind-tree/src/wind-engine/WindEngine.js";
import { ParticleField } from "../games/wind-tree/src/wind-engine/ParticleField.js";
import { WindDebug } from "../games/wind-tree/src/wind-engine/WindDebug.js";
import { SkeletonAvatar } from "../games/wind-tree/src/wind-lab/SkeletonAvatar.js";
import { CoordinateMapper } from "../games/wind-tree/src/wind-engine/CoordinateMapper.js";
import { poseSequence } from "../games/wind-tree/src/wind-lab/PoseSequences.js";
import { PhotoSession } from "../games/wind-tree/photos.mjs";

test("OrbitControls and all render modules share the local Three.js r160 instance", () => {
  assert.equal(THREE.REVISION, "160");
  assert.ok(OrbitControls.prototype instanceof THREE.EventDispatcher);
  const scene = new THREE.Scene(),
    engine = new WindEngine({ gridX: 4, gridY: 4, gridZ: 4 });
  const field = new ParticleField(scene, engine),
    debug = new WindDebug(scene),
    avatar = new SkeletonAvatar(scene);
  assert.ok(field.points instanceof THREE.Points);
  assert.ok(debug.spheres[0] instanceof THREE.Mesh);
  assert.ok(avatar.group instanceof THREE.Group);
  assert.equal(field.geometry.attributes.position.count, engine.count);
  field.dispose();
  debug.dispose();
  avatar.dispose();
  engine.dispose();
  assert.equal(scene.children.length, 0);
});

test("synthetic pose drives the 3D avatar and hand debug without a camera", () => {
  const scene = new THREE.Scene(),
    engine = new WindEngine({ avatar: true, handDebug: true });
  const mapper = new CoordinateMapper(),
    pose = poseSequence("F", 0.7);
  engine.input(mapper.fromPose(pose.landmarks, pose.worldLandmarks), 1000);
  engine.step(0.016);
  const avatar = new SkeletonAvatar(scene),
    debug = new WindDebug(scene);
  avatar.input(mapper.avatarPose(pose.landmarks, pose.worldLandmarks), 1000);
  avatar.update(1000, 0.016, engine.config, engine);
  debug.update(engine);
  assert.ok(avatar.group.visible);
  assert.ok(avatar.lineGeometry.drawRange.count > 0);
  assert.ok(debug.spheres.every((s) => s.visible));
  avatar.dispose();
  debug.dispose();
  engine.dispose();
});

test("PHOTO GIFT selection returns the original blob and next participant revokes it", () => {
  const revoked = [],
    urls = {
      createObjectURL: () => "blob:test",
      revokeObjectURL: (url) => revoked.push(url),
    };
  const session = new PhotoSession(urls),
    blob = new Blob(["photo"], { type: "image/jpeg" });
  session.start("participant-1");
  assert.equal(session.add(blob, { quality: 1 }, "stale-participant"), null);
  const photo = session.add(
    blob,
    { quality: 1, elapsedSec: 1, smileScore: 0.8 },
    "participant-1",
  );
  session.select(photo.id);
  assert.equal(session.getSelectedGift({ growth: 0.5 }).blob, blob);
  session.start("participant-2");
  assert.deepEqual(revoked, ["blob:test"]);
  assert.equal(session.getSelectedGift(), null);
  assert.equal(session.photos.length, 0);
});

const isolated = {
  ambient: false,
  weather: false,
  body: false,
  left: false,
  right: false,
};
const tick = (e, seconds, sample) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    if (sample) e.input(sample(i / 60), e.time * 1000 + 1);
    e.step(1 / 60);
  }
};
test("ambient survives stopped hands; pure diagnostic OFF settles; DOWN/UP/NONE and zero speed", () => {
  const e = new WindEngine({ ...isolated, ambient: true, drift: 0 });
  tick(e, 2, () => ({ left: [0, 0, 0], right: [0, 0, 0] }));
  assert.ok(e.motion.meanSpeed > 0.25);
  assert.ok(e.motion.displacement1s > 0.2);
  assert.ok(e.velocities[1] < 0);
  const down = { ...e.motion };
  e.configure({ ...e.config, verticalFlow: "UP" });
  tick(e, 2);
  assert.ok(e.velocities[1] > 0);
  e.configure({ ...e.config, verticalFlow: "NONE" });
  tick(e, 3);
  assert.ok(e.motion.meanSpeed < 1e-6);
  e.configure({
    ...e.config,
    verticalFlow: "DOWN",
    ambientSpeed: 0,
    drift: 100,
  });
  tick(e, 1);
  assert.ok(e.motion.meanSpeed < 1e-6);
  e.configure({ ...e.config, ambient: true, ambientSpeed: 40 });
  tick(e, 2);
  e.configure({ ...e.config, ambient: false });
  tick(e, 3);
  assert.ok(e.motion.meanSpeed < 1e-6);
  console.log("AMBIENT MEASURE", JSON.stringify({ on: down, off: e.motion }));
  e.dispose();
});
test("all six boundaries wrap to opposite side, randomize tangent coordinates and never count teleport as travel", () => {
  for (const axis of [0, 1, 2])
    for (const sign of [-1, 1]) {
      const e = new WindEngine({ ...isolated, gridX: 3, gridY: 3, gridZ: 3 });
      e.positions.fill(0);
      e.velocities.fill(0);
      e.positions[axis] = sign * 9.999;
      e.velocities[axis] = sign * 10;
      e.step(1 / 60);
      assert.equal(e.generations[0], 1);
      assert.ok(e.positions[axis] * sign < -9);
      assert.ok(
        [0, 1, 2]
          .filter((k) => k !== axis)
          .some((k) => Math.abs(e.positions[k]) > 0.001),
      );
      assert.ok(e.positions.every((v) => v >= -10 && v < 10));
      assert.ok(e.motion.meanDisplacement < 0.01);
      e.dispose();
    }
});
test("recycled particle history resets by generation, including short-distance tangential reinsert", () => {
  const scene = new THREE.Scene(),
    e = new WindEngine({ ...isolated, gridX: 3, gridY: 3, gridZ: 3 }),
    f = new ParticleField(scene, e);
  e.step(0.1);
  f.capture();
  assert.ok(f.trailGeometry.drawRange.count > 0);
  e.generations.fill(1);
  e.recycleVersion++;
  f.update();
  assert.equal(f.trailGeometry.drawRange.count, 0);
  e.step(0.1);
  f.capture();
  assert.equal(f.trailGeometry.drawRange.count, 0);
  e.step(0.1);
  f.capture();
  assert.ok(f.trailGeometry.drawRange.count > 0);
  f.dispose();
  e.dispose();
});
test("long circulation remains bounded, spread and trail memory capped at8000 particles", () => {
  const e = new WindEngine({
    ...isolated,
    ambient: true,
    ambientSpeed: 100,
    drift: 70,
    gridX: 20,
    gridY: 20,
    gridZ: 20,
  });
  tick(e, 35);
  assert.ok(e.recycleVersion > 0);
  assert.ok(e.positions.every((v) => v >= -10 && v < 10));
  const bins = Array(10).fill(0);
  for (let j = 1; j < e.positions.length; j += 3)
    bins[Math.min(9, Math.floor((e.positions[j] + 10) / 2))]++;
  assert.ok(bins.every((n) => n > 50));
  assert.ok(Math.max(...bins) < 1800);
  const f = new ParticleField(new THREE.Scene(), e);
  assert.ok(f.trailArray.length <= 600000);
  f.dispose();
  e.dispose();
});
function upper() {
  const data = poseSequence("A", 0);
  for (let i = 23; i < 33; i++) {
    data.landmarks[i].visibility = 0.05;
    data.landmarks[i].y = 10;
  }
  return data;
}
const length = (a, b) => Math.hypot(...a.map((v, k) => v - b[k]));
test("upper-body shoulder origin: no legs, mirror and normalized arm proportions; partial world never mixed", () => {
  const m = new CoordinateMapper(),
    data = upper();
  data.worldLandmarks[13].x = NaN;
  const f = m.avatarPose(data.landmarks, data.worldLandmarks, 0);
  assert.equal(f.trackingMode, "UPPER BODY");
  assert.equal(f.origin, "SHOULDER CENTER");
  assert.equal(f.coordinateSource, "NORMALIZED");
  assert.ok(f.points.slice(23).every((p) => p === null));
  assert.ok(f.points[11][0] > f.points[12][0]);
  for (let k = 0; k < 3; k++)
    assert.ok(Math.abs((f.points[11][k] + f.points[12][k]) / 2) < 1e-8);
  const raw = (i) => [data.landmarks[i].x, data.landmarks[i].y, 0];
  assert.ok(
    Math.abs(
      length(f.points[11], f.points[13]) / length(f.points[13], f.points[15]) -
        length(raw(11), raw(13)) / length(raw(13), raw(15)),
    ) < 1e-8,
  );
  data.landmarks[15].y -= 0.1;
  assert.ok(
    m.avatarPose(data.landmarks, null, 40).points[15][1] > f.points[15][1],
  );
});
test("stable full body uses33 points / hip center; mode and source transitions are gradual", () => {
  const m = new CoordinateMapper(),
    u = upper(),
    full = poseSequence("A", 0);
  let f = m.avatarPose(u.landmarks, null, 0),
    previous = f;
  for (let i = 1; i <= 3; i++) f = m.avatarPose(full.landmarks, null, i * 40);
  assert.equal(f.trackingMode, "FULL BODY");
  assert.equal(f.origin, "HIP CENTER");
  assert.equal(f.points.filter(Boolean).length, 33);
  assert.ok(length(f.points[15], previous.points[15]) < 0.001);
  f = m.avatarPose(full.landmarks, null, 500);
  assert.equal(f.transitioning, false);
  for (let k = 0; k < 3; k++)
    assert.ok(Math.abs((f.points[23][k] + f.points[24][k]) / 2) < 1e-6);
  m.resetAvatar();
  for (let i = 0; i < 12; i++)
    f = m.avatarPose(full.landmarks, full.worldLandmarks, i * 40);
  assert.equal(f.coordinateSource, "WORLD");
  assert.ok(f.points.filter(Boolean).length === 33);
  full.worldLandmarks[13].presence = 0;
  f = m.avatarPose(full.landmarks, full.worldLandmarks, 520);
  assert.equal(f.coordinateSource, "NORMALIZED");
});
test("wrist field/avatar alignment in upper/full; missing wrist held briefly only for display", () => {
  const m = new CoordinateMapper(),
    data = upper(),
    e = new WindEngine({ ...isolated, left: true, right: true, avatar: true }),
    a = new SkeletonAvatar(new THREE.Scene());
  let f = m.avatarPose(data.landmarks, null, 0);
  e.input(m.fromPose(data.landmarks, null, f), 1);
  e.step(0.016);
  a.input(f, 0);
  a.update(0, 0.016, e.config, e);
  assert.ok(
    a.wrist("left").every((v, k) => Math.abs(v - e.left.position[k]) < 1e-5),
  );
  data.landmarks[15].visibility = 0;
  f = m.avatarPose(data.landmarks, null, 50);
  assert.ok(f.points[15]);
  assert.equal(f.windHands.left, null);
  f = m.avatarPose(data.landmarks, null, 200);
  assert.equal(f.points[15], null);
  a.dispose();
  e.dispose();
});
test("same input creates measurable local displacement above ambient and decays back to ambient", () => {
  const run = (hands) => {
    const e = new WindEngine({ ...isolated, ambient: true, left: hands });
    tick(e, 2, (t) => ({ left: [t * 0.4, 0, 0] }));
    const active = { ...e.motion };
    tick(e, 3, () => ({ left: [0.8, 0, 0] }));
    const stopped = { ...e.motion };
    const wind = Math.hypot(...e.left.at(...e.left.position, e.config));
    e.dispose();
    return { active, stopped, wind };
  };
  const baseline = run(false),
    hands = run(true);
  assert.ok(
    hands.active.displacement1s > baseline.active.displacement1s + 0.002,
  );
  assert.ok(hands.wind < 1e-6);
  assert.ok(hands.stopped.meanSpeed > 0.25);
  console.log("FLOW COMPARE", JSON.stringify({ baseline, hands }));
});

test("finite but inconsistent World head proportions fall back as one complete normalized frame", () => {
  const mapper = new CoordinateMapper(),
    pose = poseSequence("A", 0);
  let frame;
  for (let i = 0; i < 12; i++)
    frame = mapper.avatarPose(pose.landmarks, pose.worldLandmarks, i * 40);
  assert.equal(frame.coordinateSource, "WORLD");
  pose.worldLandmarks[0].x = 2;
  frame = mapper.avatarPose(pose.landmarks, pose.worldLandmarks, 600);
  assert.equal(frame.coordinateSource, "NORMALIZED");
  assert.ok(
    frame.points.filter(Boolean).every((p) => p.every(Number.isFinite)),
  );
});

test("upper-body Pose detection is independent of missing body-axis wind input", async () => {
  const { trackingSnapshot } =
    await import("../games/wind-tree/src/wind-lab/TrackingReport.js");
  const data = upper(),
    m = new CoordinateMapper(),
    f = m.avatarPose(data.landmarks, null, 0);
  const e = new WindEngine({ ...isolated, avatar: true }),
    a = new SkeletonAvatar(new THREE.Scene());
  e.input(m.fromPose(data.landmarks, null, f), 1);
  a.input(f, 0);
  a.update(0, 0.016, e.config, e);
  const row = trackingSnapshot(e, {}, a);
  assert.equal(row.pose_detected, true);
  assert.equal(row.body_detected, false);
  const d = new WindDebug(new THREE.Scene());
  assert.match(d.text(e, { poseDetected: true }), /POSE DETECTED/);
  d.dispose();
  a.dispose();
  e.dispose();
});

test("confident torso still drives BODY WIND when ankles are cropped and avatar is upper-body", () => {
  const m = new CoordinateMapper(),
    data = upper(),
    full = poseSequence("A", 0);
  data.landmarks[23] = full.landmarks[23];
  data.landmarks[24] = full.landmarks[24];
  data.landmarks[11].x -= 0.05;
  data.landmarks[12].x -= 0.05;
  const frame = m.avatarPose(data.landmarks, null, 0),
    sample = m.fromPose(data.landmarks, null, frame);
  assert.equal(frame.trackingMode, "UPPER BODY");
  assert.equal(frame.points[23], null);
  assert.ok(sample.body[0] > 0.1);
  const e = new WindEngine({ ...isolated, body: true });
  tick(e, 1, () => sample);
  assert.ok(e.motion.meanSpeed > 0.5);
  for (let i = 3; i < e.velocities.length; i += 3)
    assert.ok(Math.abs(e.velocities[i] - e.velocities[0]) < 1e-6);
  e.dispose();
});
