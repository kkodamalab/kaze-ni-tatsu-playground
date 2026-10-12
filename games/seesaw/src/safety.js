import { config } from './config.js?v=20261009-ui-physics';
export function inputFresh(input, mode, now) {
  return input.ready && (mode === 'test' || now - input.lastSample < (mode === 'body' ? 500 : config.staleMs));
}
export function pauseReason(input, mode, now, dt, hidden = false) {
  if (hidden) return '画面をはなれたので、おやすみしています。';
  if (!inputFresh(input, mode, now)) return mode === 'body' ? 'からだが見えなくなりました。肩と腰をカメラにうつしてね。' : 'センサーの入力がとぎれました。入力が戻ったら、つづけよう。';
  if (dt > .5) return '少しおやすみしました。準備ができたら、つづけよう。';
  return '';
}
