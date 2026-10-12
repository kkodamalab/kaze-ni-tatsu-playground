export const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
export function validateImage(file) {
  if (!file || !imageTypes.includes(file.type)) throw new Error('JPEG・PNG・WebPの画像を選んでね。');
  if (file.size > 25 * 1024 * 1024) throw new Error('画像が大きすぎます。25MB以下の画像を選んでね。');
}
export function cropGeometry(width, height, size, zoom = 1, x = 0, y = 0) {
  const scale = Math.max(size / width, size / height) * Math.max(1, zoom);
  const w = width * scale, h = height * scale;
  return { w, h, x: (size - w) / 2 + Math.max(-1,Math.min(1,x)) * (w-size)/2,
    y: (size - h) / 2 + Math.max(-1,Math.min(1,y)) * (h-size)/2 };
}
export function drawCrop(canvas, source, { zoom = 1, x = 0, y = 0, shape = 'circle' } = {}) {
  const size = canvas.width; canvas.height = size;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0,0,size,size); ctx.save(); ctx.beginPath();
  if (shape === 'circle') ctx.arc(size/2,size/2,size/2,0,Math.PI*2);
  else ctx.roundRect(0,0,size,size,24);
  ctx.clip();
  const g = cropGeometry(source.width,source.height,size,zoom,x,y);
  ctx.drawImage(source,g.x,g.y,g.w,g.h); ctx.restore();
}
export async function loadImage(file) {
  validateImage(file);
  // Decoder resizes immediately where supported; only the re-encoded canvas is retained.
  let bitmap;
  try { bitmap = await createImageBitmap(file, { resizeWidth: 1600, resizeQuality: 'high', imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { throw new Error('画像を読み込めませんでした。別の画像を選んでね。'); }
      const canvas = document.createElement('canvas'); const scale = Math.min(1,1600 / Math.max(img.width,img.height));
      canvas.width = Math.round(img.width*scale); canvas.height = Math.round(img.height*scale);
      canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height); return canvas;
    } finally { URL.revokeObjectURL(url); }
  }
  try {
    const canvas = document.createElement('canvas'); const scale = Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    canvas.width = Math.round(bitmap.width*scale); canvas.height = Math.round(bitmap.height*scale);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height); return canvas;
  } finally { bitmap.close(); }
}
export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
}
export function saveCanvas(canvas,name) {
  return new Promise((resolve,reject) => canvas.toBlob(blob => {
    if (!blob) { reject(new Error('画像を保存できませんでした。')); return; }
    downloadBlob(blob,name); resolve();
  },'image/png'));
}
