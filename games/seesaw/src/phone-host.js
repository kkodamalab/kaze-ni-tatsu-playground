import { PeerBus } from './peer-bus.js?v=20261009-ui-physics';
import { RemoteTiltInput } from './remote-input.js?v=20261009-ui-physics';
import { controllerURL, isPhoneURL, renderQR } from './qr-connection.js?v=20261009-ui-physics';
export class PhoneHost {
  constructor({ onChange = () => {}, onCalibration = () => {}, onDisconnect = () => {} } = {}) {
    this.input = new RemoteTiltInput(); this.onChange = onChange; this.onCalibration = onCalibration; this.onDisconnect = onDisconnect;
    this.base = document.getElementById('controller-base'); this.base.value = location.origin + location.pathname;
    document.getElementById('update-qr').onclick = () => this.updateQR();
    document.getElementById('new-room').onclick = () => this.start();
    document.getElementById('phone-retry').onclick = () => this.retry();
    document.getElementById('phone-center').onclick = () => this.center();
  }
  start() {
    this.stop(); this.room = crypto.randomUUID(); let bus;
    try { bus = new PeerBus('', 'host', { peerId: this.room }); }
    catch (error) { document.getElementById('qr-note').textContent = error.message; return; }
    this.bus = bus; this.updateQR();
    const text = (id,value) => { document.getElementById(id).textContent = value; };
    bus.onReady = id => { if (this.bus !== bus) return; this.room = id; this.updateQR(); };
    bus.onPresence = (role, connected) => {
      if (this.bus !== bus || role !== 'A') return;
      this.input.setConnected(connected); this.onChange();
      if (!connected) this.onDisconnect('スマホとの接続が切れました。再接続を待ってから、つづけよう。');
    };
    bus.onInput = (role,packet) => {
      if (this.bus !== bus || role !== 'A') return;
      const before = this.calibrationKey(), wasReady = this.input.canStart();
      if (!this.input.receive(packet)) return;
      const after = this.calibrationKey();
      if (before !== after) this.onCalibration(after);
      if (!wasReady && this.input.canStart()) document.getElementById('qr-panel').open = false;
      this.onChange();
    };
    bus.onConnectionError = () => { if (this.bus === bus) text('qr-note','接続サービスに到達できません。再接続で試してください。'); };
  }
  calibrationKey() { return `${this.input.sessionId}:${this.input.calibrationId}:${this.input.baselineAngle}:${this.input.calibrated}`; }
  updateQR() {
    if (!this.room) return;
    try {
      const url = controllerURL(this.base.value,this.room), link = document.getElementById('controller-link');
      link.href = url; link.textContent = url; link.hidden = false;
      renderQR(document.getElementById('qr'),url);
      document.getElementById('room-code').textContent = `ROOM ${this.room}`;
      document.getElementById('qr-note').textContent = isPhoneURL(url) ? 'スマホでQRを読み取ってください。' : '同じPCのテスト専用URLです。スマホ接続には、この版のゲームを配信したHTTPS URLを指定してください。';
    } catch (error) { document.getElementById('qr').replaceChildren(); document.getElementById('controller-link').hidden = true; document.getElementById('qr-note').textContent = error.message; }
  }
  center() {
    if (!this.input.fresh()) return;
    this.bus?.sendInputConfig('A',{ command:'calibrate' });
  }
  retry() {
    if (!this.bus || this.bus.peer.destroyed || !this.room) { this.start(); return; }
    // Retain the Room ID. Existing controllers automatically reconnect to the same room.
    for (const connection of Object.values(this.bus.connections)) connection.close();
    if (this.bus.peer.disconnected) this.bus.peer.reconnect();
    this.input.setConnected(false); this.onChange(); this.onDisconnect('再接続しています。スマホの接続状態を確認してね。');
    document.getElementById('qr-panel').open = true;
  }
  update() {
    const input = this.input, set = (id,t) => { const e=document.getElementById(id); if(e.textContent!==t)e.textContent=t; };
    set('connection-state', input.connected ? '● スマホ接続中' : this.bus?.peer.open ? '○ スマホをつないでください' : '○ 接続サービスを待っています（未接続）');
    set('sensor-state', input.fresh() ? '✓ センサーON'+(input.inputType==='test'?'（模擬入力）':'') : '○ スマホでセンサーをONにしてください');
    set('center-state', input.calibrated ? '✓ まんなか設定済み' : '○ スマホで「まんなかにする」を押してください');
    document.getElementById('phone-center').disabled = !input.fresh();
  }
  feedback(payload) { this.bus?.send({ type:'feedback',payload }); }
  stop() {
    const bus = this.bus; this.bus = null; bus?.close(); this.room = ''; this.input.reset();
    document.getElementById('qr').replaceChildren(); document.getElementById('room-code').textContent = '';
    document.getElementById('controller-link').hidden = true; document.getElementById('qr-panel').open = true;
  }
}
