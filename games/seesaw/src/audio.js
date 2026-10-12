import { audioConfig } from './config.js?v=20261009-ui-physics';
export const phrases = ['あぶない！','がんばれ！','いいぞ！','そのちょうし！','まんなか！','おっとっと！','やったね！','おめでとう！','なし'];
export const audioDefaults = { effects: true, alert: 'bell', effectsVolume: .5, voice: true, voiceMode: 'AUTO', phrase: 'がんばれ！', voiceEvent: 'danger', voiceVolume: .7 };
export function audioSettings(value = {}) {
  const s = { ...audioDefaults, ...value };
  if (!['horn','whistle','bell','beep','comic','none'].includes(s.alert)) s.alert = 'bell';
  if (!['AUTO','SELECT','OFF'].includes(s.voiceMode)) s.voiceMode = 'AUTO';
  if (!phrases.includes(s.phrase)) s.phrase = phrases[1];
  if (!['danger','stable','star','drop','success','countdown'].includes(s.voiceEvent)) s.voiceEvent = 'danger';
  for (const key of ['effectsVolume','voiceVolume']) s[key] = Number.isFinite(+s[key]) ? Math.max(0,Math.min(1,+s[key])) : audioDefaults[key];
  s.effects = !!s.effects; s.voice = !!s.voice; return s;
}
// All timing uses active game time. Pauses cannot create an alert backlog.
export class FeedbackEvents {
  constructor(options = audioConfig) { this.options = options; this.reset(); }
  reset() { this.zone = 0; this.lastAlert = -Infinity; this.stars = 0; this.drops = 0; this.stable = false; this.count = null; this.finished = false; }
  update(g) {
    const events = [], level = g.respawn ? 0 : Math.abs(g.position) >= this.options.critical ? 2 : Math.abs(g.position) >= this.options.danger ? 1 : 0;
    if (g.drops > this.drops) events.push('drop');
    else if (level && (level !== this.zone || g.elapsed - this.lastAlert >= this.options.cooldown)) { events.push('danger'); this.lastAlert = g.elapsed; }
    if (!level) this.lastAlert = -Infinity;
    const stable = g.isSafe && g.streak >= 2;
    if (stable && !this.stable) events.push('stable');
    if (g.stars > this.stars) events.push('star');
    const left = Math.ceil(g.duration - g.elapsed);
    if (left > 0 && left <= 3 && left !== this.count) events.push('countdown');
    if (g.done && !this.finished) events.push('success');
    this.zone = level; this.stars = g.stars; this.drops = g.drops; this.stable = stable; this.count = left; this.finished = g.done;
    return events;
  }
}
// Replaceable speech adapter; never imported by Controller or gift receiver.
export class SpeechPlayer {
  constructor(env = globalThis, onStatus = () => {}) {
    this.env = env; this.onStatus = onStatus; this.speech = env.speechSynthesis;
    this.refresh = () => { const voices=this.speech?.getVoices() ?? []; this.voice = voices.find(v => /^ja[-_]JP$/i.test(v.lang)) ?? voices.find(v => /^ja(?:[-_]|$)/i.test(v.lang)); onStatus(!this.speech ? 'このブラウザーは音声に対応していません。' : this.voice ? '日本語音声を使えます。' : '日本語音声が見つかりません。効果音で遊べます。'); };
    this.speech?.addEventListener?.('voiceschanged',this.refresh); this.refresh();
  }
  play(text,volume) {
    if (!this.voice || !this.env.SpeechSynthesisUtterance) return false;
    try { this.stop(); const u = new this.env.SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.voice = this.voice; u.volume = volume; this.speech.speak(u); return true; } catch { return false; }
  }
  stop() { try { this.speech?.cancel(); } catch {} }
}
export class GameAudio {
  constructor(env = globalThis, onStatus = () => {}) {
    this.env = env; this.settings = audioSettings(); this.events = new FeedbackEvents(); this.speech = new SpeechPlayer(env,onStatus); this.lastVoice = -Infinity; this.nodes = new Set();
    try { this.settings = audioSettings(JSON.parse(env.localStorage?.getItem('seesaw:audio') || '{}')); } catch {}
  }
  configure(s) { this.settings = audioSettings(s); try { this.env.localStorage?.setItem('seesaw:audio',JSON.stringify(this.settings)); } catch {} if (!this.settings.voice || this.settings.voiceMode === 'OFF') this.speech.stop(); if (!this.settings.effects) this.stopEffects(); }
  async unlock() { try { if (!this.context) { const C = this.env.AudioContext || this.env.webkitAudioContext; if (C) this.context = new C(); } await this.context?.resume(); } catch {} }
  reset() { this.stop(); this.events.reset(); this.lastVoice = -Infinity; }
  stopEffects() { for (const n of this.nodes) { try { n.stop(); } catch {} } this.nodes.clear(); }
  stop() { this.stopEffects(); this.speech.stop(); }
  tone(kind) {
    if (!this.settings.effects || !this.settings.effectsVolume || kind === 'none' || !this.context || this.context.state !== 'running') return;
    const patterns = { horn: [220,277], whistle: [1600,1900], bell: [880,1320], beep: [700,700], comic: [180,420], star: [660,880,1320], success: [523,659,784,1047], drop: [300,180,100], countdown: [600], start: [523,1047] };
    try { (patterns[kind] || patterns.bell).forEach((hz,i) => {
      const o = this.context.createOscillator(), gain = this.context.createGain(), t = this.context.currentTime + i*.12;
      o.type = kind === 'horn' ? 'sawtooth' : kind === 'beep' ? 'square' : 'sine'; o.frequency.setValueAtTime(hz,t);
      if (kind === 'comic') o.frequency.exponentialRampToValueAtTime(80,t+.25);
      gain.gain.setValueAtTime(0,t); gain.gain.linearRampToValueAtTime(this.settings.effectsVolume*.12,t+.01); gain.gain.exponentialRampToValueAtTime(.001,t+.22);
      o.connect(gain); gain.connect(this.context.destination); this.nodes.add(o); o.onended = () => { this.nodes.delete(o); o.disconnect(); gain.disconnect(); }; o.start(t); o.stop(t+.25);
    }); } catch {}
  }
  voice(event,time = Infinity,preview = false) {
    const s = this.settings;
    if (!s.voice || s.voiceMode === 'OFF' || (!preview && time - this.lastVoice < audioConfig.voiceCooldown)) return;
    const words = { danger:'あぶない！', stable:'いいぞ！', star:'やったね！', drop:'おっとっと！', success:'おめでとう！', countdown:'がんばれ！' };
    if (s.voiceMode === 'SELECT' && event !== s.voiceEvent && !preview) return;
    if (s.voiceMode === 'SELECT' && s.phrase === 'なし') return;
    if (this.speech.play(s.voiceMode === 'SELECT' ? s.phrase : words[event],s.voiceVolume)) this.lastVoice = time;
  }
  update(game) { for (const e of this.events.update(game).sort((a,b)=>['success','drop','danger','star','stable','countdown'].indexOf(a)-['success','drop','danger','star','stable','countdown'].indexOf(b))) { if(e==='success' && (game.gameMode==='SURVIVAL' && game.elapsed<game.duration-1e-8 || game.gameMode==='KEEP' && game.drops>0)) continue; if (e !== 'stable') this.tone(e === 'danger' ? this.settings.alert : e); this.voice(e,game.elapsed); } }
}
