export const emojiObjects = { EGG:'🥚', BALL:'⚽', SOCCER_BALL:'⚽', BASKETBALL:'🏀', APPLE:'🍎', CHICK:'🐤', PEAR:'🍐', CHESTNUT:'🌰', MAPLE:'🍁', LEAF:'🍂', PUMPKIN:'🎃', MUSHROOM:'🍄' };
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
export function renderObject(element, type, image = null) {
  element.replaceChildren();
  if (image) { const img = document.createElement('img'); img.src = image; img.alt = '選んだ作品'; element.append(img); return; }
  const canvas = emojiCanvas(type);
  if (canvas) { canvas.setAttribute('role','img'); canvas.setAttribute('aria-label',emojiObjects[type] || emojiObjects.EGG); element.append(canvas); }
  else { const span = document.createElement('span'); span.className='object-emoji'; span.setAttribute('role','img'); span.setAttribute('aria-label',emojiObjects[type] || emojiObjects.EGG); span.textContent=emojiObjects[type] || emojiObjects.EGG; element.append(span); }
}
