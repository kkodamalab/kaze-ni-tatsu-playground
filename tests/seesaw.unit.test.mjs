import test from 'node:test';
import assert from 'node:assert/strict';
import { DeviceTuning, tuningDefaults, tuningKey, sanitizeTuning, tuneSample } from '../games/seesaw/src/device-tuning.js';
import { VBFInput, TiltInput, screenRoll } from '../games/seesaw/src/input.js';
import { BodyInput } from '../games/seesaw/src/body.js';
import { SeesawGame, toCSV } from '../games/seesaw/src/game.js';
import { sceneGeometry } from '../games/seesaw/src/geometry.js';
import { physicsSettings, difficulties, objects } from '../games/seesaw/src/config.js';
import { RemoteTiltInput, tiltPacket } from '../games/seesaw/src/remote-input.js';

function run({angle = 5, gain = 3, length = 1, response = 1, difficulty = 'easy', objectType = 'EGG', gameMode = 'SURVIVAL'} = {}) {
  const game = new SeesawGame(difficulty, {gameMode, objectType, duration: 60, tuning: {angleGain: gain, boardLength: length, objectResponse: response}});
  while (!game.done) game.step(1/120, {rawAngle: angle, relativeAngle: angle});
  return game;
}

test('gain 1/3/4, both signs and max-angle clamp preserve raw and calibrated sensor data', () => {
  for (const angleGain of [1, 3, 4]) for (const sign of [-1, 1]) {
    const input = new VBFInput(); input.push(12); input.calibrate();
    for (let i = 0; i < 150; i++) input.push(12 + sign * 5);
    const before = input.read();
    const sample = tuneSample(before, {...tuningDefaults, angleGain});
    assert.ok(Math.abs(sample.gameAngle - sign * 5 * angleGain) < 1e-8);
    assert.deepEqual(input.read(), before);
    assert.equal(sample.rawAngle, 12 + sign * 5);
    assert.equal(sample.relativeAngle, before.relativeAngle);
  }
  for (const maxGameAngle of [10,30,35]) for (const sign of [-1,1]) {
    const tuning = {...tuningDefaults, angleGain: 5, maxGameAngle};
    const sample = tuneSample({rawAngle: 12*sign, relativeAngle: 12*sign}, tuning);
    assert.equal(sample.gameAngle, maxGameAngle * sign);
    const game = new SeesawGame('easy', {tuning});
    game.step(1/120, {...sample, gameAngle: sign*100});
    assert.equal(game.samples[0].gameAngle, sign*maxGameAngle);
  }
});

test('PC/simulated +/-5 degrees with gain3/4 actually falls off both normalized ends', () => {
  for (const gain of [1,3,4]) for (const angle of [-5,5]) {
    const game = run({gain, angle});
    if (gain === 1) { assert.equal(game.drops, 0); continue; }
    assert.equal(game.drops, 1);
    assert.ok(Math.abs(game.position) > 1 && Math.sign(game.position) === Math.sign(angle));
    assert.ok(game.elapsed < 7);
    console.log('SEESAW FALL', {angle, gain, seconds: +game.elapsed.toFixed(3), position: game.position});
  }
});

test('70/100/130 percent boards share geometry, contact, physical speed and normalized fall boundary', () => {
  const times = [];
  for (const length of [.7,1,1.3]) {
    const game = run({length}); times.push(game.elapsed);
    const geo = sceneGeometry(1000,500,1,15,60,0,length);
    const middle = sceneGeometry(1000,500,0,15,60,0,length);
    assert.equal(geo.length, 700 * length);
    assert.ok(Math.abs(Math.hypot(geo.contact.x-middle.contact.x,geo.contact.y-middle.contact.y)-geo.length/2) < 1e-9);
    assert.equal(geo.support, 58);
    assert.equal(game.drops, 1); assert.ok(game.position > 1);
    console.log('SEESAW BOARD', {length, seconds: +game.elapsed.toFixed(3), pixels: geo.length});
  }
  assert.ok(times[0] < times[1] && times[1] < times[2]);
  const reference = new SeesawGame(), shorter = new SeesawGame('easy', {tuning:{boardLength:.7}});
  const sample = {rawAngle:15, relativeAngle:15};
  for(let i=0;i<60;i++){reference.step(1/120,sample);shorter.step(1/120,sample);}
  assert.ok(Math.abs(reference.position-shorter.position*.7)<1e-9);
  assert.ok(Math.abs(reference.velocity-shorter.velocity*.7)<1e-9);
});

test('object response 0.5/1/2 scales final acceleration without rewriting difficulty/object coefficients', () => {
  for(const difficulty of Object.keys(difficulties)) for(const objectType of Object.keys(objects)) {
    const speeds = [];
    for(const objectResponse of [.5,1,2]) {
      const game = new SeesawGame(difficulty, {objectType,tuning:{objectResponse}});
      assert.deepEqual(game.settings,physicsSettings(difficulty,objectType));
      game.step(1/120,{rawAngle:15,relativeAngle:15}); speeds.push(game.velocity);
    }
    assert.ok(Math.abs(speeds[1]-2*speeds[0])<1e-12);
    assert.ok(Math.abs(speeds[2]-2*speeds[1])<1e-12);
  }
  const times = [.5,1,2].map(response=>run({response}).elapsed);
  assert.ok(times[0] > times[1] && times[1] > times[2]);
});

test('defaults reproduce the previous physics exactly across all difficulties and modes', () => {
  for(const difficulty of Object.keys(difficulties))for(const gameMode of ['KEEP','STAR','SURVIVAL']) {
    const game = new SeesawGame(difficulty,{gameMode}); const p=game.settings;
    let position=0, velocity=0;
    for(let i=0;i<120;i++) {
      const angle=Math.sin(i/20)*5,dt=1/120;
      velocity+=(p.gravity*Math.sin(angle*Math.PI/180)-p.centering*Math.max(0,1-Math.abs(angle)/10)*position)*dt;
      velocity*=Math.exp(-p.damping*dt);velocity=Math.max(-p.maxSpeed,Math.min(p.maxSpeed,velocity));position+=velocity*dt;
      game.step(dt,{rawAngle:angle,relativeAngle:angle});
      assert.equal(game.position,position);assert.equal(game.velocity,velocity);
    }
  }
});

test('storage persists/resets settings and survives malformed, blocked or unavailable storage', () => {
  const data = new Map(), storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  const settings=new DeviceTuning(storage);
  settings.configure({angleGain:3,maxGameAngle:35,boardLength:.7,objectResponse:2});
  assert.deepEqual(new DeviceTuning(storage).values,settings.values);
  settings.reset();assert.deepEqual(new DeviceTuning(storage).values,tuningDefaults);
  for(const value of ['{broken','null','[]','{"angleGain":"3","boardLength":null}']) {
    data.set(tuningKey,value);assert.deepEqual(new DeviceTuning(storage).values,tuningDefaults);
  }
  const blocked=new DeviceTuning({getItem(){throw Error('blocked')},setItem(){throw Error('quota')}});
  blocked.configure({angleGain:3});assert.equal(blocked.saved,false);assert.equal(blocked.values.angleGain,3);
  assert.deepEqual(sanitizeTuning({angleGain:Infinity,boardLength:-1,maxGameAngle:99,objectResponse:NaN}), {...tuningDefaults,boardLength:.7,maxGameAngle:35});
});

test('PHONE CONTROLLER packets, calibration, replay protection, freshness and LOCAL TILT/BODY sensitivity regressions', () => {
  const sensor=new VBFInput();sensor.push(10,0);sensor.calibrate();
  for(let i=0;i<150;i++)sensor.push(15,100);
  const packet=tiltPacket(sensor,{sequence:1,sessionId:'phone',sensorOn:true,calibrationId:1,timestamp:1000,now:100});
  const remote=new RemoteTiltInput();remote.setConnected(true);
  assert.equal(remote.receive(packet,100),true);assert.equal(remote.canStart(100),true);
  assert.equal(remote.receive(packet,110),false);assert.equal(remote.fresh(3000),false);
  const sample=tuneSample(remote.read(),{...tuningDefaults,angleGain:3});
  assert.ok(Math.abs(sample.gameAngle-15)<1e-8);assert.equal(sample.rawAngle,15);
  assert.ok(Math.abs(packet.relativeAngle-5)<1e-8);
  const game=new SeesawGame('easy',{inputMode:'phone',gameMode:'SURVIVAL',duration:60,tuning:{angleGain:3}});
  while(!game.done)game.step(1/120,sample);
  assert.equal(game.drops,1);
  sensor.push(15,120);sensor.calibrate();
  assert.equal(remote.receive(tiltPacket(sensor,{sequence:2,sessionId:'phone',sensorOn:true,calibrationId:2,now:120}),120),true);
  assert.equal(tuneSample(remote.read(),{...tuningDefaults,angleGain:3}).gameAngle,0);
  remote.setConnected(false);assert.equal(remote.canStart(120),false);
  assert.equal(screenRoll(5,2,90),-5);assert.equal(screenRoll(5,2,0),2);
  const body=new BodyInput();body.sensitivity=2;body.push(0);body.calibrate();for(let i=0;i<150;i++)body.push(5);
  assert.ok(Math.abs(tuneSample(body.read(),{...tuningDefaults,angleGain:3},body.sensitivity).gameAngle-30)<1e-8);
  assert.ok(new TiltInput() instanceof VBFInput);
});

test('CSV retains legacy columns and distinguishes sensor/game angles and live tuning changes', () => {
  const game=new SeesawGame('easy',{tuning:{angleGain:3}});
  const sample=tuneSample({rawAngle:17,relativeAngle:5},{...tuningDefaults,angleGain:3});
  game.step(1/120,sample);
  const row=game.samples[0];
  for(const key of ['rawAngle','relativeAngle','eggPosition','eggVelocity','gameMode','bodyAxisAngle','rawSensorAngle','relativeSensorAngle','gameAngle','angleGain','maxGameAngle','boardLength','objectResponse']) assert.ok(key in row,key);
  assert.equal(row.rawSensorAngle,17);assert.equal(row.relativeSensorAngle,5);assert.equal(row.gameAngle,15);
  game.configureTuning({angleGain:4,boardLength:.7});
  for(let i=0;i<30;i++)game.step(1/120,tuneSample(sample,game.tuning));
  assert.equal(game.samples.at(-1).gameAngle,20);assert.equal(game.samples.at(-1).boardLength,.7);
  const csv=toCSV(game.samples);assert.ok(csv.startsWith('\uFEFF'));assert.match(csv,/"rawAngle","relativeAngle"/);assert.match(csv,/"rawSensorAngle","relativeSensorAngle","gameAngle"/);
});
