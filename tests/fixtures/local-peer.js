// Deterministic signaling/transport double for exercising the unchanged phone UI/protocol.
// Real PeerJS/WebRTC connectivity remains an explicit device check.
class Events {
  constructor() { this.events = {}; }
  on(type, fn) { (this.events[type] ??= []).push(fn); return this; }
  emit(type, value) { for (const fn of this.events[type] || []) fn(value); }
}
class LocalConnection extends Events {
  constructor(owner, peer, metadata = {}) {
    super(); this.owner = owner; this.peer = peer; this.metadata = metadata;
    this.open = false; this.closed = false; this.bufferSize = 0;
  }
  send(body) { this.owner.post({type:'data',to:this.peer,body}); }
  close(notify = true) {
    if (this.closed) return;
    this.closed = true; this.open = false;
    if (notify) this.owner.post({type:'close',to:this.peer});
    this.emit('close');
  }
}
window.Peer = class LocalPeer extends Events {
  constructor(id) {
    super(); this.id = typeof id === 'string' ? id : crypto.randomUUID();
    this.connections = {}; this.open = false; this.destroyed = false;
    this.channel = new BroadcastChannel('seesaw-browser-test');
    this.channel.onmessage = ({data}) => {
      if (data.to !== this.id || this.destroyed) return;
      let c = this.connections[data.from];
      if (data.type === 'connect') {
        c = this.connections[data.from] = new LocalConnection(this,data.from,data.metadata);
        this.emit('connection',c); c.open = true; c.emit('open');
        this.post({type:'open',to:data.from});
      } else if (c && data.type === 'open') { c.open = true; c.emit('open'); }
      else if (c && data.type === 'data') c.emit('data',data.body);
      else if (c && data.type === 'close') c.close(false);
    };
    setTimeout(() => { this.open = true; this.emit('open',this.id); },10);
  }
  post(data) { if (!this.destroyed) this.channel.postMessage({...data,from:this.id}); }
  connect(peer, options) {
    const connection = this.connections[peer] = new LocalConnection(this,peer,options.metadata);
    this.post({type:'connect',to:peer,metadata:options.metadata}); return connection;
  }
  reconnect() { this.disconnected = false; this.open = true; this.emit('open',this.id); }
  destroy() {
    for (const c of Object.values(this.connections)) c.close();
    this.destroyed = true; this.open = false; this.channel.close();
  }
};
