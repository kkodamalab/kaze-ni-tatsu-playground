import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../games/wind-tree/vendor/three/three.module.js';
import { OrbitControls } from '../games/wind-tree/vendor/three/OrbitControls.js';
import { WindEngine } from '../games/wind-tree/src/wind-engine/WindEngine.js';
import { ParticleField } from '../games/wind-tree/src/wind-engine/ParticleField.js';
import { WindDebug } from '../games/wind-tree/src/wind-engine/WindDebug.js';
import { SkeletonAvatar } from '../games/wind-tree/src/wind-lab/SkeletonAvatar.js';
import { CoordinateMapper } from '../games/wind-tree/src/wind-engine/CoordinateMapper.js';
import { poseSequence } from '../games/wind-tree/src/wind-lab/PoseSequences.js';
import { PhotoSession } from '../games/wind-tree/photos.mjs';

test('OrbitControls and all render modules share the local Three.js r160 instance', () => {
  assert.equal(THREE.REVISION, '160');
  assert.ok(OrbitControls.prototype instanceof THREE.EventDispatcher);
  const scene = new THREE.Scene(), engine = new WindEngine({gridX: 4, gridY: 4, gridZ: 4});
  const field = new ParticleField(scene, engine), debug = new WindDebug(scene), avatar = new SkeletonAvatar(scene);
  assert.ok(field.points instanceof THREE.Points);
  assert.ok(debug.spheres[0] instanceof THREE.Mesh);
  assert.ok(avatar.group instanceof THREE.Group);
  assert.equal(field.geometry.attributes.position.count, engine.count);
  field.dispose(); debug.dispose(); avatar.dispose(); engine.dispose();
  assert.equal(scene.children.length, 0);
});

test('synthetic pose drives the 3D avatar and hand debug without a camera', () => {
  const scene = new THREE.Scene(), engine = new WindEngine({avatar: true, handDebug: true});
  const mapper = new CoordinateMapper(), pose = poseSequence('F', 0.7);
  engine.input(mapper.fromPose(pose.landmarks, pose.worldLandmarks), 1000);
  engine.step(0.016);
  const avatar = new SkeletonAvatar(scene), debug = new WindDebug(scene);
  avatar.input(mapper.avatarPose(pose.landmarks, pose.worldLandmarks), 1000);
  avatar.update(1000, 0.016, engine.config, engine);
  debug.update(engine);
  assert.ok(avatar.group.visible);
  assert.ok(avatar.lineGeometry.drawRange.count > 0);
  assert.ok(debug.spheres.every(s => s.visible));
  avatar.dispose(); debug.dispose(); engine.dispose();
});

test('PHOTO GIFT selection returns the original blob and next participant revokes it', () => {
  const revoked = [], urls = {createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url)};
  const session = new PhotoSession(urls), blob = new Blob(['photo'], {type: 'image/jpeg'});
  session.start('participant-1');
  assert.equal(session.add(blob, {quality: 1}, 'stale-participant'), null);
  const photo = session.add(blob, {quality: 1, elapsedSec: 1, smileScore: 0.8}, 'participant-1');
  session.select(photo.id);
  assert.equal(session.getSelectedGift({growth: 0.5}).blob, blob);
  session.start('participant-2');
  assert.deepEqual(revoked, ['blob:test']);
  assert.equal(session.getSelectedGift(), null);
  assert.equal(session.photos.length, 0);
});
