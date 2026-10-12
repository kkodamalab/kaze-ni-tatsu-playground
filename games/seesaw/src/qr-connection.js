// UCM url(role)/renderConnect conventions; a single Player A for this game.
export function controllerURL(base, room) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(room)) throw new Error('ROOMが正しくありません。');
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('HTTP(S)のゲームURLを指定してください。');
  url.search = ''; url.hash = '';
  url.searchParams.set('room', room); url.searchParams.set('player', 'A');
  return url.href;
}
export function isPhoneURL(base) {
  const url = new URL(base);
  return url.protocol === 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
}
export function renderQR(element, url, QRClass = globalThis.QRCode) {
  element.replaceChildren();
  if (typeof QRClass !== 'function') throw new Error('QRコードを読み込めませんでした。接続URLを開いてください。');
  new QRClass(element, { text: url, width: 240, height: 240,
    colorDark: '#273f39', colorLight: '#ffffff', correctLevel: QRClass.CorrectLevel.M });
  element.removeAttribute('title'); // The long URL is already available in the adjacent link.
}
