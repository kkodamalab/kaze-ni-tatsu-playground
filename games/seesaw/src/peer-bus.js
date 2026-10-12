// Extracted from kkodamalab/ucm-demo-game dist/app.js, a1b1de4 (PeerBus).
// Same PeerJS transport, role metadata, input/feedback envelope and room ID.
// Removed UCM global state coupling; added reconnect, stale-connection guards,
// bounded buffering and a session key so an old controller cannot replace a new one.
export class PeerBus {
  constructor(room = '', role = 'host', { PeerClass = globalThis.Peer, peerOptions = {},
    sessionId = globalThis.crypto.randomUUID(), peerId = '', retryMs = 1500, connectTimeoutMs = 10000,
    setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.room = role === 'host' && peerId ? peerId : room; this.role = role; this.sessionId = sessionId;
    this.connections = {}; this.retryMs = retryMs; this.connectTimeoutMs = connectTimeoutMs;
    this.setTimer = (...args) => setTimer(...args);
    this.clearTimer = (...args) => clearTimer(...args); this.closed = false;
    if (typeof PeerClass !== 'function') throw new Error('通信ライブラリを読み込めませんでした。再読み込みしてください。');
    // Supported PeerJS explicit ID: show the QR while signaling is connecting.
    this.peer = peerId ? new PeerClass(peerId, peerOptions) : new PeerClass(peerOptions);
    this.peer.on('open', id => {
      if (this.closed) return;
      this.clearRetry();
      if (role === 'host') { this.room = id; this.onReady?.(id); }
      else if (!this.connection?.open) this.connect();
    });
    this.peer.on('connection', connection => role === 'host' ? this.accept(connection) : connection.close());
    this.peer.on('disconnected', () => this.retry());
    this.peer.on('error', error => { this.onConnectionError?.(error); this.retry(); });
  }
  clearRetry() { this.clearTimer(this.retryTimer); this.retryTimer = null; }
  retry() {
    if (this.closed || this.retryTimer || this.peer.destroyed) return;
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = null;
      if (this.closed || this.peer.destroyed) return;
      try {
        if (this.peer.disconnected) this.peer.reconnect();
        else if (this.role !== 'host' && !this.connection?.open) this.connect();
      } catch (error) { this.onConnectionError?.(error); }
      if (this.peer.disconnected || (this.role !== 'host' && !this.connection?.open)) this.retry();
    }, this.retryMs);
  }
  connect() {
    if (this.closed || this.role === 'host' || this.connection?.open || this.connecting) return;
    this.connecting = true;
    const connection = this.peer.connect(this.room, {
      reliable: false, metadata: { role: this.role, sessionId: this.sessionId },
    });
    this.connection = connection;
    const deadline = this.setTimer(() => {
      if (this.connection === connection && !connection.open) {
        this.connection = null; this.connecting = false; connection.close();
        this.onDisconnected?.(); this.retry();
      }
    }, this.connectTimeoutMs);
    connection.on('open', () => {
      this.clearTimer(deadline);
      if (this.connection !== connection || this.closed) { connection.close(); return; }
      this.connecting = false; this.clearRetry(); this.onConnected?.();
    });
    connection.on('data', message => {
      if (this.connection !== connection || this.closed) return;
      if (message?.type === 'feedback') this.onFeedback?.(message.payload);
      if (message?.type === 'input-config') this.onInputConfig?.(message.config, message.playerId);
    });
    const lost = () => {
      this.clearTimer(deadline);
      if (this.connection !== connection) return;
      this.connection = null; this.connecting = false; connection.close();
      this.onDisconnected?.(); this.retry();
    };
    connection.on('close', lost);
    connection.on('error', error => { this.onConnectionError?.(error); lost(); });
  }
  accept(connection) {
    const role = connection.metadata?.role;
    if (this.closed || !['A', 'B'].includes(role)) { connection.close(); return; }
    const old = this.connections[role];
    // Keep the active phone. The same page session may reconnect after a timeout.
    if (old?.open && old.metadata?.sessionId !== connection.metadata?.sessionId) { connection.close(); return; }
    this.connections[role] = connection;
    old?.close();
    connection.on('open', () => {
      if (this.closed || this.connections[role] !== connection) { connection.close(); return; }
      this.onPresence?.(role, true);
    });
    connection.on('data', message => {
      if (this.connections[role] === connection && !this.closed && message?.type === 'input') this.onInput?.(role, message);
    });
    connection.on('close', () => {
      if (this.connections[role] !== connection) return;
      delete this.connections[role]; this.onPresence?.(role, false);
    });
    connection.on('error', error => { this.onConnectionError?.(error); connection.close(); });
  }
  send(message) {
    const targets = this.role === 'host' ? Object.values(this.connections) : [this.connection];
    for (const connection of targets) {
      if (!connection?.open || connection.bufferSize > 2 || connection.dataChannel?.bufferedAmount > 65536) continue;
      try { connection.send(message); } catch (error) { this.onConnectionError?.(error); }
    }
  }
  sendInputConfig(playerId, config) {
    const connection = this.connections[playerId];
    if (this.role !== 'host' || !connection?.open) return false;
    connection.send({ type: 'input-config', playerId, config }); return true;
  }
  reconnect() {
    if (this.closed) return;
    const connection = this.connection;
    this.connection = null; this.connecting = false; connection?.close();
    this.onDisconnected?.(); this.retry();
  }
  close() {
    this.closed = true; this.clearRetry();
    Object.values(this.connections).forEach(connection => connection.close());
    this.connection?.close(); this.peer.destroy();
  }
}
