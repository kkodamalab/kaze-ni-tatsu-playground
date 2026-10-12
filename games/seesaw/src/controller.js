import { TiltInput, VBFInput } from './input.js?v=20261009-ui-physics';
import { PeerBus } from './peer-bus.js?v=20261009-ui-physics';
import { tiltPacket } from './remote-input.js?v=20261009-ui-physics';
import { config } from './config.js?v=20261009-ui-physics';
const $ = id => document.getElementById(id);

export function startController(room, { test = false } = {}) {
  let sensorOn = false, calibrationId = 0, sequence = 0, connected = false, lock = null, enabling = false;
  let lastFeedback = -Infinity, recovering = false, requestingLock = false;
  const sessionId = crypto.randomUUID();
  const sensor = test ? new VBFInput() : new TiltInput(() => {
    calibrationId++; $('controller-sensor-state').textContent = '画面の向きが変わりました。まんなかを設定し直してください。'; send();
  });
  let bus;
  const setConnection = text => { $('controller-connection').textContent = text; };
  async function keepAwake() {
    if (lock || requestingLock || !sensorOn || document.hidden) return;
    requestingLock = true;
    try {
      const candidate = await navigator.wakeLock?.request('screen');
      if (!candidate) return;
      if (document.hidden || !sensorOn) { await candidate.release(); return; }
      lock = candidate; lock.addEventListener('release', () => { if (lock === candidate) lock = null; });
    } catch { /* Sensor use remains possible without Wake Lock. */ }
    finally { requestingLock = false; }
  }
  function send() {
    if (!bus) return;
    if (test && sensorOn && !document.hidden) sensor.push(Number($('controller-test-tilt').value));
    bus.send(tiltPacket(sensor, { sequence: ++sequence, sessionId, sensorOn, calibrationId, visible: !document.hidden, test }));
  }
  function createBus() {
    bus?.close(); connected = false; recovering = false;
    setConnection('○ PCにつないでいます…');
    try {
      bus = new PeerBus(room, 'A', { sessionId });
      bus.onConnected = () => { connected = true; recovering = false; lastFeedback = performance.now(); setConnection('● PCにつながっています'); send(); };
      bus.onDisconnected = () => { connected = false; setConnection('○ PCへ再接続しています…'); };
      bus.onConnectionError = () => { if (!connected) setConnection('○ 接続を再試行しています。PCの画面を開いたままにしてください。'); };
      bus.onInputConfig = settings => { if (settings?.command === 'calibrate') calibrate(); };
      bus.onFeedback = feedback => {
        lastFeedback = performance.now();
        $('controller-title').textContent = `${feedback.objectLabel ?? '〇〇'}を落とすな！`;
        $('controller-host-state').textContent = feedback.phase === 'play' ? (feedback.paused ? 'PCはおやすみ中です' : 'あそんでいます！ ラインをまっすぐにしてね') : feedback.phase === 'countdown' ? '3、2、1… まんなかで準備してね' : feedback.phase === 'result' ? 'できた！ PCの画面を見てね' : 'PCで「あそぶ！」を押してね';
      };
    } catch (error) { setConnection(error.message); }
  }
  $('controller-enable').disabled = false;
  $('controller-enable').textContent = test ? 'テスト入力をON' : 'センサーをON';
  $('controller-test').hidden = !test;
  $('controller-enable').onclick = async () => {
    if (enabling) return;
    enabling = true; $('controller-enable').disabled = true;
    try {
      // Directly inside the user gesture: do not await network or Wake Lock first.
      if (test) sensor.push(0); else await sensor.connect();
      sensorOn = true;
      $('controller-sensor-state').textContent = 'センサーON。固定したら「まんなかにする」を押してください。';
      keepAwake(); send();
    } catch (error) { sensorOn = false; $('controller-sensor-state').textContent = error.message; }
    finally { enabling = false; $('controller-enable').disabled = false; }
  };
  function calibrate() {
    if (!sensorOn || !sensor.ready || performance.now() - sensor.lastSample >= config.staleMs) return;
    sensor.calibrate(); calibrationId++; send();
    $('controller-sensor-state').textContent = 'ここがまんなか！ PCの「あそぶ！」で始められます。';
  };
  $('controller-center').onclick = calibrate;
  $('controller-retry').onclick = createBus;
  document.addEventListener('visibilitychange', () => {
    send();
    if (document.hidden) { lock?.release().catch(() => {}); lock = null; }
    else { keepAwake(); if (!connected) bus?.reconnect(); }
  });
  createBus();
  // Same ~30 Hz coalesced stream as UCM (34 ms), including explicit state heartbeats.
  const timer = setInterval(() => {
    send();
    const fresh = sensorOn && sensor.ready && performance.now() - sensor.lastSample < config.staleMs;
    $('controller-center').disabled = !fresh;
    $('controller-indicator').style.transform = `translateX(${sensor.read().normalizedTilt * 100}px)`;
    $('controller-gauge').setAttribute('aria-valuenow', String(Math.round(sensor.read().gameAngle)));
    if (sensorOn && !fresh) $('controller-sensor-state').textContent = '傾きの入力を待っています。センサー許可と画面が開いているかを確認してください。';
    if (connected && performance.now() - lastFeedback > 5000 && !recovering) { recovering = true; bus.reconnect(); }
  }, 34);
  window.addEventListener('pagehide', () => {
    sensorOn = false; send(); clearInterval(timer); sensor.disconnect?.(); bus?.close(); lock?.release().catch(() => {});
  }, { once: true });
}
