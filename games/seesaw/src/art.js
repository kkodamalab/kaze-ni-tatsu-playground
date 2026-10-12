
const drawings = {
  PEAR: '<path d="M48 8h6v15c5 20 33 28 29 51C79 104 18 105 16 75c-2-24 23-31 28-52Z" fill="#bbd35b" stroke="#719344" stroke-width="3"/>',
  CHESTNUT: '<path d="M50 7C26 32 5 40 9 72c4 34 79 34 83 0C96 40 73 32 50 7Z" fill="#934e27"/><path d="M10 77q40-15 80 0q-5 23-40 23T10 77" fill="#d9b779"/>',
  MAPLE: '<path d="M50 0l9 28 17-13-3 27 25-6-16 22 16 9-37 15-9 17-3-25-39-9 17-13-23-24 30 9-8-28 19 20Z" fill="#d76730"/>',
  LEAF: '<path d="M8 90Q4 10 94 8Q94 98 8 90Z" fill="#b7853b"/><path d="M4 99L78 24" stroke="#735127" stroke-width="4"/>',
  PUMPKIN: '<path d="M46 25V6h10v19" stroke="#719344" stroke-width="8"/><ellipse cx="50" cy="60" rx="47" ry="39" fill="#ef922d"/><path d="M40 25q-20 38 0 74m20-74q20 38 0 74" stroke="#ce6f1b" fill="none" stroke-width="3"/>',
  MUSHROOM: '<path d="M38 43h24l10 55H28Z" fill="#f1dfb3"/><path d="M4 51Q15-17 70 10q21 12 26 41Z" fill="#d96243"/><g fill="#fff8de"><circle cx="33" cy="27" r="8"/><circle cx="69" cy="34" r="9"/></g>',
  EGG: '<path d="M50 5C25 5 14 47 14 66c0 38 72 38 72 0C86 47 75 5 50 5Z" fill="#fff8de" stroke="#c8b887" stroke-width="3"/>',
  SOCCER_BALL: '<defs><clipPath id="ball-edge"><circle cx="50" cy="50" r="44"/></clipPath></defs><circle cx="50" cy="50" r="44" fill="#fff" stroke="#354637" stroke-width="3"/><g clip-path="url(#ball-edge)" fill="#27372e" stroke="#27372e" stroke-width="1"><path d="M50 32l18 13-7 21H39l-7-21Z M14 13l21-5-4 20-17 12-12-9Z M65 8l21 5 12 18-12 9-17-12Z M4 66l20-6 13 17-3 21-23-9Z M96 66l-20-6-13 17 3 21 23-9Z"/><path d="M50 32V8M68 45l18-5M61 66l2 11M39 66l-2 11M32 45l-18-5" fill="none"/></g>',
  BASKETBALL: '<circle cx="50" cy="50" r="44" fill="#ee8a32" stroke="#49382b" stroke-width="3"/><g fill="none" stroke="#49382b" stroke-width="3"><path d="M6 50h88M50 6v88M19 19Q62 50 19 81M81 19Q38 50 81 81"/></g>',
  BALL: '<circle cx="50" cy="50" r="44" fill="#64b7e6" stroke="#2878a2" stroke-width="3"/><path d="M8 50h84M50 6c-28 24-28 64 0 88M50 6c28 24 28 64 0 88" fill="none" stroke="#ffda65" stroke-width="7"/>',
  APPLE: '<path d="M50 29C14 9 1 48 17 78c15 27 28 8 33 12 10 9 29 1 36-19 15-36-8-57-36-42Z" fill="#ef6862" stroke="#b9443f" stroke-width="3"/><path d="M50 30V10" stroke="#805b35" stroke-width="6"/><path d="M52 18Q55 0 79 6Q75 22 52 18" fill="#79ab4b"/>',
  CHICK: '<ellipse cx="50" cy="56" rx="39" ry="37" fill="#ffe26d" stroke="#c9a03b" stroke-width="3"/><path d="M38 21Q22 1 45 12Q58-3 58 20" fill="#ffe26d" stroke="#c9a03b" stroke-width="3"/><path d="M38 94l-8 3m32-3 8 3" stroke="#dc922e" stroke-width="5"/><path d="M43 64l7 9 7-9Z" fill="#ed9b34"/>',
};
export function objectSVG(type) {
  const face = ['BALL','SOCCER_BALL','BASKETBALL'].includes(type) ? '' : '<circle cx="37" cy="54" r="3" fill="#354637"/><circle cx="63" cy="54" r="3" fill="#354637"/>' + (type === 'CHICK' ? '' : '<path d="M43 65q7 8 14 0" fill="none" stroke="#354637" stroke-width="3" stroke-linecap="round"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${['BALL','SOCCER_BALL','BASKETBALL'].includes(type) ? '4.5 4.5 91 91' : type==='EGG' ? '12.5 3.5 75 92.5' : '0 0 100 100'}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${drawings[type] ?? drawings.EGG}${face}</svg>`;
}
export const emojiObjects = { EGG:'🥚', SOCCER_BALL:'⚽', BASKETBALL:'🏀', APPLE:'🍎', CHICK:'🐤', PEAR:'🍐', CHESTNUT:'🌰', MAPLE:'🍁', LEAF:'🍂', PUMPKIN:'🎃', MUSHROOM:'🍄' };
export function emojiCanvas(type) {
  const source=document.createElement('canvas');source.width=160;source.height=180;
  const ctx=source.getContext('2d');ctx.font='128px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';ctx.textAlign='center';ctx.fillText(emojiObjects[type] || '●',80,140);
  const pixels=ctx.getImageData(0,0,160,180).data;
  const missing=document.createElement('canvas');missing.width=160;missing.height=180;const mc=missing.getContext('2d');mc.font=ctx.font;mc.textAlign=ctx.textAlign;mc.fillText(String.fromCodePoint(0x10ffff),80,140);const tofu=mc.getImageData(0,0,160,180).data;
  if(pixels.every((v,i)=>v===tofu[i]))return null;let x0=160,y0=180,x1=0,y1=0;
  for(let y=0;y<180;y++)for(let x=0;x<160;x++)if(pixels[(y*160+x)*4+3]>16){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  if(x1<=x0 || y1<=y0)return null;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const scale=256/Math.max(x1-x0+1,y1-y0+1),w=(x1-x0+1)*scale,h=(y1-y0+1)*scale;
  canvas.getContext('2d').drawImage(source,x0,y0,x1-x0+1,y1-y0+1,(256-w)/2,256-h,w,h);return canvas;
}
export function renderObject(element, type, image = null, style = 'svg') {
  element.replaceChildren();
  if (image) { const img = document.createElement('img'); img.src = image; img.alt = '選んだ作品'; element.append(img); }
  else if (emojiObjects[type] && (style === 'emoji' || ['PEAR','CHESTNUT','MAPLE','LEAF','PUMPKIN','MUSHROOM'].includes(type))) { const canvas=emojiCanvas(type); if(canvas){canvas.setAttribute('role','img');canvas.setAttribute('aria-label',emojiObjects[type]);element.append(canvas);}else element.innerHTML=objectSVG(type); }
  else element.innerHTML = objectSVG(type);
}
