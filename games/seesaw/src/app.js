import { sceneGeometry, rollingAngle } from './geometry.js?v=20261009-ui-physics';
import { config, objects, gameModes, isImageObject } from './config.js?v=20261009-ui-physics';
import { VBFInput, TiltInput, clamp } from './input.js?v=20261009-ui-physics';
import { SeesawGame, toCSV } from './game.js?v=20261009-ui-physics';
import { BodyInput, BodyCamera } from './body.js?v=20261009-ui-physics';
import { renderObject } from './art.js?v=20261009-ui-physics';
import { loadImage, drawCrop, saveCanvas } from './images.js?v=20261009-ui-physics';
import { giftData, drawGift, resultText } from './gift.js?v=20261009-ui-physics';
import { PhoneHost } from './phone-host.js?v=20261009-ui-physics';
import { inputFresh, pauseReason } from './safety.js?v=20261009-ui-physics';
import { GameAudio, phrases } from './audio.js?v=20261009-ui-physics';
import { GiftEditor } from './gift-editor.js?v=20261009-ui-physics';
import { StartCountdown } from './countdown.js?v=20261009-ui-physics';
import { LeafEffects, leafPile } from './leaves.js?v=20261009-ui-physics';
const $ = id => document.getElementById(id);
const audio = new GameAudio(globalThis,text => $('audio-status').textContent=text);
const giftEditor = new GiftEditor(() => discardImages());
const countdown=new StartCountdown();
const leaves=new LeafEffects($('leaf-background'),$('leaf-flights'));
let countdownLabel='', startBannerUntil=0;
let objectStyle = 'svg';
let duration = 30;
let difficulty = 'easy', mode = 'phone', phase = 'setup', game = null, paused = false;
let needsCenter = false, accumulator = 0, previous = 0, wakeLock = null, requestingLock = false;
let testAngle = 0, connectionVersion = 0, connectionTimer, trialMetadata;
let gameMode = 'KEEP', objectType = 'EGG', images = {}, cropSource = null, cropType = null, photoStream = null, imageVersion = 0, photoVersion = 0, giftVersion = 0;
const testInput = new VBFInput();
const bodyInput = new BodyInput(); bodyInput.invert = true;
const bodyCamera = new BodyCamera($('body-video'), $('body-overlay'), bodyInput, () => {
  $('status').textContent = 'カメラが止まりました。再接続するか、TILT / PC TESTを選んでね。';
  pause('カメラが止まりました。はじめにもどって入力を選び直してね。');
});
const tiltInput = new TiltInput(() => {
  needsCenter = true;
  if (mode !== 'sensor') return;
  if (['play','countdown'].includes(phase)) pause('画面の向きが変わりました。まんなかを設定し直してください。');
  else { $('status').textContent = '画面の向きが変わったよ。もういちど まんなかにしてね。'; $('start').disabled = true; }
});
const phoneHost = new PhoneHost({
  onCalibration: key => {
    needsCenter = !phoneHost.input.calibrated;
    if (['play','countdown'].includes(phase) && trialMetadata.controllerCalibrationKey !== key) {
      trialMetadata.controllerCalibrationKey = key;
      (trialMetadata.recalibrations ??= []).push({ timestamp: game.elapsed, baselineAngle: phoneHost.input.baselineAngle, calibrationId: phoneHost.input.calibrationId });
      pause(needsCenter ? 'スマホで中央姿勢を設定し直してね。' : 'スマホの中央設定が変わりました。準備ができたら、つづけよう。');
    }
  },
  onDisconnect: reason => pause(reason),
});
const input = () => mode === 'phone' ? phoneHost.input : mode === 'test' ? testInput : mode === 'body' ? bodyInput : tiltInput;
const fresh = () => inputFresh(input(), mode, performance.now());
function show(next) {
  if (phase === 'gift' && next !== 'gift') giftEditor.close();
  phase = next; document.body.dataset.phase=next; document.body.classList.toggle('playing',['play','countdown'].includes(next));
  leaves.active(gameMode==='STAR' && ['play','countdown'].includes(next), next==='countdown');
  $('start-countdown').hidden=next!=='countdown';
  for (const name of ['setup', 'play', 'result', 'gift']) $(name).hidden = name !== (next==='countdown'?'play':next);
  $('test-controls').hidden = mode !== 'test' || !['setup','play','countdown'].includes(next);
  updatePreview();
  window.scrollTo(0, 0);
}
async function acquireWakeLock() {
  if (wakeLock || requestingLock || phase !== 'play' || paused || document.hidden) return;
  requestingLock = true;
  try {
    const lock = await navigator.wakeLock?.request('screen');
    if (!lock) return;
    if (phase !== 'play' || paused || document.hidden) { await lock.release(); return; }
    wakeLock = lock;
    lock.addEventListener('release', () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* Optional enhancement; unsupported devices can still play. */ }
  finally { requestingLock = false; }
}
function releaseWakeLock() { const lock = wakeLock; wakeLock = null; lock?.release().catch(() => {}); }
function pause(reason) {
  if (phase==='countdown') { cancelCountdown(reason); return; }
  if (phase !== 'play') return;
  $('start-countdown').hidden=true; audio.stop(); leaves.active(gameMode==='STAR',true); paused = true; game.paused = true; accumulator = 0; releaseWakeLock();
  $('pause-panel').hidden = false; $('pause-reason').textContent = reason;
  $('reset-center').hidden = !needsCenter || mode === 'phone';
  $('resume').hidden = needsCenter && mode !== 'phone';
}
function resume(recenter = false) {
  audio.unlock();
  if (!fresh()) { $('pause-reason').textContent = mode === 'body' ? '肩と腰がカメラに映るまで待ってね。' : 'センサーの入力を待っています。端末とブラウザーの許可を確認してください。'; return; }
  if (mode === 'phone' && !input().calibrated) { $('pause-reason').textContent = 'スマホで「まんなかにする」を押してください。'; return; }
  if (recenter) { input().calibrate(); needsCenter = false; }
  if (needsCenter) return;
  leaves.active(gameMode==='STAR'); paused = false; game.paused = false; previous = performance.now(); accumulator = 0; $('pause-panel').hidden = true;
  acquireWakeLock();
}
function prepare() {
  countdown.cancel(); leaves.reset(); audio.stop(); giftVersion++; game = null; paused = false; releaseWakeLock(); show('setup');
  $('pause-panel').hidden = true;
  $('status').textContent = mode === 'body' ? '① カメラをつかう → ② まんなかにしてね。' : '固定をたしかめて、まんなかにしてね。';
  if (mode !== 'phone') input().calibrated = false; $('start').disabled = true;
  $('research').open = false;
}
$('mode').addEventListener('change', () => {
  connectionVersion++; clearTimeout(connectionTimer); tiltInput.disconnect(); tiltInput.reset(); bodyCamera.disconnect(); stopPhoto();
  phoneHost.stop(); mode = $('mode').value;
  $('phone-connection').hidden = mode !== 'phone'; $('local-preparation').hidden = mode === 'phone';
  if (mode === 'phone') phoneHost.start();
  needsCenter = false;
  $('connect').disabled = mode === 'test'; $('connect').textContent = mode === 'body' ? '① カメラをつかう' : '① センサーをつかう'; updatePreview(); $('start').disabled = true;
  $('test-controls').hidden = mode !== 'test';
  if (mode === 'test') { testAngle = 0; $('tilt').value = 0; testInput.reset(); testInput.push(0); }
  $('status').textContent = mode === 'test' ? 'キーやスライダーで動かして、② まんなかにしてね。' : 'スマホを固定して、①からはじめよう。';
});
$('connect').addEventListener('click', async () => {
  const version = ++connectionVersion;
  $('connect').disabled = true;
  $('status').textContent = mode === 'body' ? 'カメラと身体検出を準備しています…' : 'センサーを待っています…';
  try {
    if (mode === 'body') await bodyCamera.connect(); else { tiltInput.reset(); await tiltInput.connect(); }
    if (version !== connectionVersion) return;
    $('status').textContent = '入力を待っています。受信したら②を押してね。';
    connectionTimer = setTimeout(() => {
      if (version !== connectionVersion) return;
      $('status').textContent = fresh() ? '準備できたよ。② まんなかにしてね。' : '入力が届きません。HTTPS・センサー許可を確認するか、PCテストを選んでね。';
      $('connect').disabled = false;
    }, 3000);
  } catch (error) { if (version === connectionVersion) { $('status').textContent = mode === 'body' ? 'カメラ・身体検出を開始できません。HTTPS・カメラ許可・ネットワークを確認するか、TILT / PC TESTを選んでね。' : error.message; $('connect').disabled = false; } }
});
$('center').addEventListener('click', () => {
  if (mode === 'phone' || !fresh()) return;
  input().calibrate(); needsCenter = false; $('start').disabled = false;
  clearTimeout(connectionTimer); $('connect').disabled = mode === 'test';
  $('status').textContent = 'ここが まんなか！ あそぶ準備ができたよ。';
});
document.querySelectorAll('[data-level]').forEach(button => button.addEventListener('click', () => {
  difficulty = button.dataset.level;
  document.querySelectorAll('[data-level]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));
function cancelCountdown(reason) {
  countdown.cancel(); audio.stop(); leaves.reset(); game=null; paused=false; accumulator=0; releaseWakeLock(); show('setup');
  $('start').disabled=true; $('status').textContent=`${reason} 準備ができたら「あそぶ！」で3からやり直してね。`;
}
function countdownDisplay(label,playSound=true) {
  if(countdownLabel===label)return;countdownLabel=label; $('countdown-number').textContent=label;
  $('start-countdown').classList.remove('countdown-pulse');void $('start-countdown').offsetWidth;$('start-countdown').classList.add('countdown-pulse');
  if(playSound)audio.tone(label==='スタート！'?'start':'countdown');
}
$('start').addEventListener('click', () => {
  if(phase!=='setup' || countdown.active)return;
  if (!fresh() || !input().calibrated) { $('status').textContent = '入力を確認して、まんなかを設定してね。'; return; }
  if (isImageObject(objectType) && !images[objectType]) { $('status').textContent = '写真や作品をえらんでね。'; return; }
  const audioReady=audio.unlock(); audio.reset(); stopPhoto(); game = new SeesawGame(difficulty, { gameMode, objectType, inputMode: mode, duration });
  renderObject($('egg'),objectType,images[objectType],objectStyle); paused = false; needsCenter = false;
  trialMetadata = { preparedAt: new Date().toISOString(), startedAt: null, inputMode: mode, baselineAngle: input().baselineAngle,
    roomId: mode === 'phone' ? phoneHost.room : null, controllerInputType: mode === 'phone' ? input().inputType : null, controllerCalibrationKey: mode === 'phone' ? phoneHost.calibrationKey() : null, gameMode, objectType, objectStyle, configuredDuration: duration, sensitivity: bodyInput.sensitivity, inputInverted: mode === 'body' && bodyInput.invert, filterAlpha: config.alpha, sampleInterval: config.sampleInterval, difficulty, settings: { ...game.settings } };
  accumulator = 0; previous = performance.now(); const preparedAt=previous; countdown.start(preparedAt); countdownLabel=''; leaves.reset(); $('start').disabled=true; show('countdown'); countdownDisplay('3',false); render();
  audioReady.then(()=>{if(phase==='countdown' && countdown.startedAt===preparedAt && countdownLabel==='3')audio.tone('countdown');});
});
$('pause').addEventListener('click', () => pause('準備ができたら、つづけよう。'));
$('resume').addEventListener('click', () => resume());
$('reset-center').addEventListener('click', () => {
  if (fresh()) (trialMetadata.recalibrations ??= []).push({ timestamp: game.elapsed, baselineAngle: input().rawAngle });
  resume(true);
});
$('quit').addEventListener('click', prepare);
$('again').addEventListener('click', prepare);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause('画面をはなれたので、おやすみしています。'); });
window.addEventListener('pagehide', () => { audio.stop(); phoneHost.stop(); clearInterval(feedbackTimer); releaseWakeLock(); bodyCamera.disconnect(); tiltInput.disconnect(); stopPhoto(); });
$('tilt').addEventListener('input', () => { testAngle = Number($('tilt').value); });
window.addEventListener('keydown', event => {
  if (mode !== 'test' || !['setup','play','countdown'].includes(phase) || !['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) return;
  if (event.target.matches('select,textarea,input:not([type=range])')) return;
  event.preventDefault();
  testAngle = event.code === 'Space' ? 0 : clamp(testAngle + (event.code === 'ArrowRight' ? 2 : -2), -30, 30);
  $('tilt').value = testAngle;
});
function render() {
  if (!game) return;
  const angle = phase==='countdown' ? 0 : input().read().gameAngle;
  const size=$('egg').offsetWidth, geo=sceneGeometry($('scene').clientWidth,$('scene').clientHeight,game.position,angle,size);
  $('scene').style.setProperty('--pivot-y',`${geo.pivotY}px`);$('scene').style.setProperty('--ground-y',`${geo.ground}px`);$('scene').style.setProperty('--support-height',`${geo.support}px`);
  $('platform').style.transform = `rotate(${angle}deg)`;
  $('platform').classList.toggle('safe', game.isSafe);
  $('zone').style.width = `${game.settings.safeZoneWidth * 100}%`;

  const falling = game.respawn > 0;
  const fallProgress = falling ? 1 - game.respawn / config.respawnSeconds : 0;
  const point=sceneGeometry($('scene').clientWidth,$('scene').clientHeight,game.position,angle,size,fallProgress).center;
  $('egg').style.left=`${point.x}px`;$('egg').style.top=`${point.y}px`;
  const spin=['BALL','SOCCER_BALL','BASKETBALL'].includes(objectType)?rollingAngle(game.rotation/500,geo.length,size):angle;
  $('egg').style.transform=`translate(-50%,-50%) rotate(${spin}deg)`;
  $('egg').style.opacity = String(1 - fallProgress);
  $('time-label').textContent = gameMode === 'SURVIVAL' ? 'いま' : 'あと';
  $('score-hud').hidden = gameMode === 'SURVIVAL';
  $('score-label').textContent = gameMode === 'STAR' ? '🍂 ×' : '落下';
  $('time').textContent = gameMode === 'SURVIVAL' ? game.elapsed.toFixed(1) : Math.max(0, Math.ceil(game.duration - game.elapsed));
  if(gameMode==='STAR') leaves.update(game.stars,$('platform'),$('stars')); else $('stars').textContent=game.drops;
  const message = falling ? 'おっと！ もういちど' : !game.isSafe ? 'そーっと、まっすぐ' : game.streak >= 6 ? 'すごい！' : game.streak >= 2 ? 'いいね！' : 'そのまま！';
  if ($('message').textContent !== message) $('message').textContent = message;
}
function finish() {
  releaseWakeLock();
  if (mode === 'body') { bodyCamera.disconnect(); $('connect').disabled = false; }
  show('result'); leaves.reset(); leafPile($('result-leaves'),gameMode==='STAR'?game.stars:0); $('celebration').hidden=gameMode==='STAR';
  const data = giftData(game);
  $('total-stars').textContent = resultText(data);
  const perfect = gameMode === 'KEEP' && game.drops === 0 || gameMode === 'SURVIVAL' && game.elapsed >= game.duration - 1e-8;
  $('result').classList.toggle('perfect',perfect);
  $('result-title').textContent = perfect ? 'だいせいこう！' : 'よく がんばったね！';
  $('result-message').textContent = gameMode === 'SURVIVAL' && !perfect ? 'もういちど、チャレンジ！' : `${objects[objectType].label}と なかよくなれたね。`;
  renderObject($('result-object'),objectType,images[objectType],objectStyle);
  const summary = game.summary();
  $('metrics').textContent = JSON.stringify({ ...trialMetadata, ...summary }, null, 2);
  try {
    localStorage.setItem('keep-the-egg:last-trial', JSON.stringify({ metadata: trialMetadata, summary, samples: game.samples }));
    $('storage-note').textContent = '最新の1試行をこのブラウザー内に保存しました。外部には送信しません。必要な記録はCSVで保存してください。';
  } catch { $('storage-note').textContent = 'ブラウザー内に保存できませんでした。画面を閉じる前にCSVを保存してください。'; }
}
function downloadCSV(name, rows) {
  const url = URL.createObjectURL(new Blob([toCSV(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('samples-csv').addEventListener('click', () => downloadCSV('keep-the-egg-samples.csv', game.samples));
$('summary-csv').addEventListener('click', () => downloadCSV('keep-the-egg-summary.csv', [{ ...trialMetadata, settings: JSON.stringify(trialMetadata.settings), recalibrations: JSON.stringify(trialMetadata.recalibrations ?? []), ...game.summary() }]));
function frame(now) {
  if (mode === 'test') { testInput.push(testAngle, now); $('tilt-value').textContent = `${testAngle}°`; }
  if (mode === 'phone') phoneHost.update();
  if (mode === 'body') $('confidence').textContent = `検出Confidence: ${bodyInput.confidence.toFixed(2)}`;
  if (phase === 'setup') { $('center').disabled = !fresh(); $('start').disabled = !fresh() || !input().calibrated || (isImageObject(objectType) && !images[objectType]); }
  if(phase==='countdown') {
    const dt=(now-previous)/1000;
    const reason=needsCenter || !input().calibrated ? '中央姿勢を設定し直してね。' : pauseReason(input(),mode,now,dt,document.hidden);
    const state=countdown.update(now,reason);
    if(state.aborted) cancelCountdown(state.reason);
    else if(state.started) { countdownDisplay('スタート！'); show('play'); $('start-countdown').hidden=false; startBannerUntil=now+650; trialMetadata.startedAt=new Date().toISOString(); accumulator=0; previous=now; acquireWakeLock(); }
    else if(state.active) countdownDisplay(state.label);
    render();
  } else if (phase === 'play' && !paused) {
    if(now>=startBannerUntil)$('start-countdown').hidden=true;
    const dt = (now - previous) / 1000;
    const reason = mode === 'phone' && !input().calibrated ? 'スマホで中央姿勢を設定してください。' : pauseReason(input(), mode, now, dt, document.hidden);
    if (reason) pause(reason);
    else {
      accumulator += Math.max(0, dt);
      while (accumulator >= config.step && !game.done) { game.step(config.step, input().read()); accumulator -= config.step; }
      audio.update(game); render();
      if (game.done) finish();
    }
  }
  previous = now; requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function updatePreview() {
  $('body-preview').hidden = mode !== 'body' || !$('preview-visible').checked || !['setup','play','countdown'].includes(phase);
  document.querySelector('.camera-view').classList.toggle('mirrored',$('preview-mirror').checked);
}
function chooseObject(type) {
  imageVersion++; stopPhoto(); cropSource = null; cropType = null;
  $('crop-preview').hidden = true; $('crop-controls').hidden = true; $('image-status').textContent = '';
  objectType = type; updateSetupArt();
  $('image-editor').hidden = !isImageObject(type);
  $('image-file').closest('label').hidden=type==='IMAGE_CAMERA';$('photo-camera').hidden=type==='IMAGE_FILE';
  document.querySelectorAll('[data-object]').forEach(b => b.setAttribute('aria-pressed',String(b.dataset.object === type)));
}
for (const [type,info] of Object.entries(objects)) {
  if (info.legacy) continue;
  const button = document.createElement('button'); button.dataset.object = type; button.setAttribute('aria-pressed',String(type === objectType));
  const preview = document.createElement('span');
  if (isImageObject(type)) { preview.className = 'custom-icon'; preview.textContent = type === 'IMAGE_CAMERA' ? '📷' : '▧'; }
  else renderObject(preview,type,null,objectStyle);
  button.append(preview,document.createTextNode(info.selectionLabel || info.label)); button.addEventListener('click',() => chooseObject(type)); $('object-choices').append(button);
}
document.querySelectorAll('[data-game-mode]').forEach(button => button.addEventListener('click',() => {
  gameMode = button.dataset.gameMode;
  document.querySelectorAll('[data-game-mode]').forEach(b => b.setAttribute('aria-pressed',String(b === button)));
  updateSetupArt();
}));
$('other-game').addEventListener('click',() => { discardImages(); prepare(); });
$('result-new-participant').addEventListener('click', nextParticipant);
$('new-participant').addEventListener('click', nextParticipant);
for (const id of ['preview-visible','preview-mirror']) $(id).addEventListener('change',updatePreview);
$('skeleton').addEventListener('change',() => { bodyCamera.skeleton = $('skeleton').checked; });
$('axis-debug').addEventListener('change',() => { bodyCamera.debug = $('axis-debug').checked; });
$('input-invert').addEventListener('change',() => { bodyInput.invert = $('input-invert').checked; bodyInput.reset(); $('status').textContent = '左右設定を変えたので、まんなかを設定し直してね。'; });
$('sensitivity').addEventListener('input',() => { bodyInput.sensitivity = Number($('sensitivity').value); });
function stopPhoto() {
  photoVersion++; photoStream?.getTracks().forEach(t => t.stop()); photoStream = null;
  $('photo-video').srcObject = null; $('photo-video').hidden = true; $('capture').hidden = true; $('stop-photo').hidden = true;
}
function previewCrop() {
  if (!cropSource) return;
  drawCrop($('crop-preview'),cropSource,{ zoom: Number($('crop-zoom').value), x: Number($('crop-x').value), y: Number($('crop-y').value), shape: $('crop-shape').value });
}
function editSource(source,type) {
  cropSource = source; cropType = type;
  $('crop-zoom').value = 1; $('crop-x').value = 0; $('crop-y').value = 0;
  $('crop-shape').value = type === 'MY_DRAWING' ? 'rounded' : 'circle';
  $('crop-preview').hidden = false; $('crop-controls').hidden = false; previewCrop();
  $('image-status').textContent = '大きさと位置を調整して「この画像をつかう」を押してね。';
}
$('image-file').addEventListener('change',async () => {
  const file = $('image-file').files[0]; if (!file) return;
  const version = ++imageVersion, type = objectType; stopPhoto();
  try { const source = await loadImage(file); if (version === imageVersion && type === objectType) editSource(source,type); }
  catch (error) { if (version === imageVersion) $('image-status').textContent = error.message || '画像を読み込めませんでした。別の画像を選んでね。'; }
  finally { $('image-file').value = ''; }
});
$('photo-camera').addEventListener('click',async () => {
  stopPhoto(); const version = photoVersion, type = objectType; imageVersion++;
  if (mode === 'body') { connectionVersion++; bodyCamera.disconnect(); }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video: { facingMode: $('photo-facing').value, width: 1280, height: 720 },audio:false});
    if (version !== photoVersion || type !== objectType) { stream.getTracks().forEach(t => t.stop()); return; }
    photoStream = stream; $('photo-video').srcObject = stream; $('photo-video').hidden = false; await $('photo-video').play();
    if (version !== photoVersion || type !== objectType) { stream.getTracks().forEach(t => t.stop()); return; }
    $('capture').hidden = false; $('stop-photo').hidden = false;
  } catch { if (version !== photoVersion) return; stopPhoto(); $('image-file').closest('label').hidden=false;$('image-status').textContent = 'カメラを使えません。HTTPSと許可を確認するか、画像ファイルを選んでね。'; }
});
$('stop-photo').addEventListener('click',stopPhoto);
$('capture').addEventListener('click',() => {
  const video = $('photo-video'); if (!video.videoWidth) return;
  const canvas = document.createElement('canvas'); const scale = Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  canvas.width = Math.round(video.videoWidth*scale); canvas.height = Math.round(video.videoHeight*scale);
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height); stopPhoto(); editSource(canvas,objectType);
});
for (const id of ['crop-zoom','crop-x','crop-y','crop-shape']) $(id).addEventListener('input',previewCrop);
$('use-image').addEventListener('click',() => {
  if (!cropSource || cropType !== objectType) return;
  images[objectType] = $('crop-preview').toDataURL('image/png');
  const button = document.querySelector(`[data-object="${objectType}"]`); renderObject(button.firstChild,objectType,images[objectType]);
  updateSetupArt();
  $('image-status').textContent = 'この画像であそべるよ！画像はページを閉じると消えます。';
});
function nextParticipant() {
  if(!window.confirm('写真や作品をすべて削除して、次の参加者に進みますか？'))return;
  discardImages();giftEditor.data=null;trialMetadata=null;try{localStorage.removeItem('keep-the-egg:last-trial');}catch{/* Storage may be unavailable; in-memory data is still erased. */}$('metrics').textContent='';$('storage-note').textContent='';chooseObject('EGG');prepare();
}
function discardImages() {
  giftEditor.erase(); imageVersion++; giftVersion++; stopPhoto(); images = {}; cropSource = null; cropType = null;
  $('crop-preview').getContext('2d').clearRect(0,0,256,256); $('crop-preview').hidden = true; $('crop-controls').hidden = true;
  for (const type of ['IMAGE_FILE','IMAGE_CAMERA']) { const preview = document.querySelector(`[data-object="${type}"]`).firstChild; preview.replaceChildren(); preview.className = 'custom-icon'; preview.textContent = '＋'; }
  $('image-status').textContent = '写真と作品を消しました。'; updateSetupArt();
  if (game) renderObject($('result-object'),objectType);
  renderObject($('egg'),objectType); $('gift-canvas').getContext('2d').clearRect(0,0,$('gift-canvas').width,$('gift-canvas').height); $('gift-save').disabled = true;
}
$('discard-images').addEventListener('click',discardImages);
function openGift() { show('gift'); const data=giftData(game,images);data.objectStyle=objectStyle; giftEditor.open(data); window.dispatchEvent(new CustomEvent('photo-gift:preview',{detail:data})); }
$('gift-open').addEventListener('click',openGift);
$('gift-back').addEventListener('click',() => show('result'));
$('play-duration').addEventListener('input',() => { duration=Number($('play-duration').value); updateSetupArt(); });
for (const phrase of phrases) { const option=document.createElement('option');option.textContent=phrase;$('audio-phrase').append(option); }
function syncAudio() {
  const s=audio.settings;$('audio-effects').checked=s.effects;$('audio-alert').value=s.alert;$('audio-effects-volume').value=s.effectsVolume*100;
  $('audio-voice').checked=s.voice;$('audio-voice-mode').value=s.voiceMode;$('audio-phrase').value=s.phrase;$('audio-event').value=s.voiceEvent;$('audio-voice-volume').value=s.voiceVolume*100;
}
syncAudio();
function changeAudio() { audio.configure({effects:$('audio-effects').checked,alert:$('audio-alert').value,effectsVolume:Number($('audio-effects-volume').value)/100,voice:$('audio-voice').checked,voiceMode:$('audio-voice-mode').value,phrase:$('audio-phrase').value,voiceEvent:$('audio-event').value,voiceVolume:Number($('audio-voice-volume').value)/100}); }
for (const id of ['audio-effects','audio-alert','audio-effects-volume','audio-voice','audio-voice-mode','audio-phrase','audio-event','audio-voice-volume']) $(id).addEventListener('input',changeAudio);
$('audio-test').onclick=async()=>{await audio.unlock();audio.tone(audio.settings.alert);};
$('audio-voice-test').onclick=async()=>{await audio.unlock();audio.voice('danger',Infinity,true);};

function updateSetupArt() {
  $('duration-label').textContent = $('play-duration-value').textContent = `${duration}びょう`;
  document.querySelectorAll('[data-game-mode] small').forEach(e => e.textContent=`${duration}びょう`);
  $('play-title').textContent = `${objects[objectType].label}を落とすな！`;
  document.title = `シーソーゲーム | ${objects[objectType].label}を落とすな！`;
  $('intro-message').textContent = gameMode === 'STAR' ? 'まんなかで2びょう！落ち葉をあつめよう。' : `${objects[objectType].label}を落とさず、${gameMode === 'KEEP' ? `${duration}びょう守ろう！` : 'どこまで耐えられるかな？'}`;

}
updateSetupArt();

const feedbackTimer = setInterval(() => { if (mode === 'phone') phoneHost.feedback({ phase, paused, objectLabel: objects[objectType].label, canStart: fresh() && input().calibrated }); },500);
phoneHost.start();
$('play-duration').disabled = false; $('mode').disabled = false; $('game-mode').disabled = false; $('difficulty').disabled = false;
document.body.dataset.appReady = 'true';

$('object-style').addEventListener('change',()=>{objectStyle=$('object-style').value;for(const b of document.querySelectorAll('[data-object]'))if(!isImageObject(b.dataset.object))renderObject(b.firstChild,b.dataset.object,null,objectStyle);});
