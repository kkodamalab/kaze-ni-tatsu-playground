// Preparation time is separate from the fixed-step game simulation.
export class StartCountdown {
  constructor(seconds = 3) { this.seconds = seconds; this.cancel(); }
  start(now) { if (this.active || !Number.isFinite(now)) return false; this.active = true; this.startedAt = now; return true; }
  cancel() { this.active = false; this.startedAt = null; }
  update(now, unsafeReason = '') {
    if (!this.active) return { active:false };
    if (unsafeReason || !Number.isFinite(now)) { this.cancel(); return { active:false, aborted:true, reason:unsafeReason || 'カウントダウンをやり直してください。' }; }
    // RAF timestamps may precede the click by a few milliseconds in the same frame.
    const elapsed = Math.max(0, (now - this.startedAt) / 1000);
    if (elapsed >= this.seconds) { this.cancel(); return { active:false, started:true, label:'スタート！' }; }
    return { active:true, label:String(Math.ceil(this.seconds - elapsed)) };
  }
}
