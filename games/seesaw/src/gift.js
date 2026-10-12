import { objects, gameModes, isImageObject } from './config.js?v=20261009-ui-physics';
import { objectSVG, emojiCanvas } from './art.js?v=20261009-ui-physics';
export function giftData(game, images = {}) {
  return { version: 1, gameName: 'シーソーゲーム：〇〇を落とすな！', gameMode: game.gameMode,
    objectType: game.objectType, result: game.summary(), images: { ...images },
    event: { name: '風に立つ', date: '2026.10.18', location: '南大沢・大平公園' } };
}
export function resultText(data) {
  const s = data.result;
  return data.gameMode === 'STAR' ? `落ち葉を${s.leafCount ?? s.starCount}枚あつめたよ！` : data.gameMode === 'KEEP' ? `落下 ${s.dropCount} 回` : `${s.survivalTime.toFixed(1)}秒 バランスできた！`;
}
export const giftDefaults = { layout:'A', orientation:'portrait', background:'natural', frame:'simple', title:true, result:true, event:true, object:true };
export const giftColors = { natural:'#f7f5e9', sky:'#dff1ff', grass:'#e6f1cf', cream:'#fff2ce', pink:'#ffe4ed' };
export function giftRects(options, available) {
  const landscape = options.orientation === 'landscape', w = landscape ? 1620 : 1080, h = landscape ? 1080 : 1620;
  const x = 60, y = options.title ? 190 : 65, width = w-120, bottom = h - (options.event ? 170 : 55) - (options.result ? 210 : 0), height = bottom-y;
  let kinds = options.layout === 'D' ? ['smile'] : options.layout === 'E' ? ['drawing'] : ['smile','drawing'];
  kinds = kinds.filter(k => available[k]);
  // A single available photograph always fills the space, including in D/E.
  if (!kinds.length) kinds = ['smile','drawing'].filter(k=>available[k]).slice(0,1);
  if (kinds.length === 1) return { w,h,rects:[{kind:kinds[0],x,y,w:width,h:height}] };
  if (!kinds.length) return {w,h,rects:[]};
  if (options.layout === 'A') return {w,h,rects:kinds.map((kind,i)=>({kind,x:x+i*(width+24)/2,y,w:(width-24)/2,h:height}))};
  const big = options.layout === 'C' ? 'drawing' : 'smile', small = big==='smile'?'drawing':'smile';
  return {w,h,rects:[{kind:big,x,y,w:width,h:height*.68},{kind:small,x:x+width*.5,y:y+height*.68+24,w:width*.5,h:height*.32-24}]};
}
const decode = async src => { const img = new Image(); img.src = src; await img.decode(); return img; };
export function drawPhoto(ctx,img,r,crop = {}) {
  const scale = Math.max(r.w/img.width,r.h/img.height)*Math.max(1,Number(crop.zoom)||1), w=img.width*scale,h=img.height*scale;
  const x = r.x+(r.w-w)/2+Math.max(-1,Math.min(1,Number(crop.x)||0))*(w-r.w)/2;
  const y = r.y+(r.h-h)/2+Math.max(-1,Math.min(1,Number(crop.y)||0))*(h-r.h)/2;
  ctx.save();ctx.beginPath();ctx.roundRect(r.x,r.y,r.w,r.h,24);ctx.clip();ctx.drawImage(img,x,y,w,h);ctx.restore();
}
export async function drawGift(canvas,data,options = giftDefaults,photos = {}) {
  const o = {...giftDefaults,...options}, geometry=giftRects(o,photos);
  canvas.width=geometry.w;canvas.height=geometry.h;
  const {w,h}=geometry,ctx=canvas.getContext('2d');ctx.fillStyle=giftColors[o.background]||giftColors.natural;ctx.fillRect(0,0,w,h);
  await document.fonts?.ready;
  ctx.textAlign='center';ctx.fillStyle='#315e4b';
  if(o.title){ctx.font='bold 48px sans-serif';ctx.fillText('シーソーゲーム',w/2,85);ctx.font='bold 34px sans-serif';ctx.fillText(o.object?`${objects[data.objectType].label}を落とすな！`:'よく がんばったね！',w/2,145);}
  for(const r of geometry.rects){const photo=photos[r.kind];const img=await decode(typeof photo==='string'?photo:photo.src);drawPhoto(ctx,img,r,photo.crop);}
  if(!geometry.rects.length){const type=isImageObject(data.objectType)?'EGG':data.objectType;const img=(data.objectStyle==='emoji' || ['PEAR','CHESTNUT','MAPLE','LEAF','PUMPKIN','MUSHROOM'].includes(type)) ? (emojiCanvas(type) || await decode('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(objectSVG(type)))) : await decode('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(objectSVG(type)));ctx.drawImage(img,w/2-140,(o.title?220:80),280,294);ctx.font='bold 36px sans-serif';ctx.fillText('バランスに チャレンジ！',w/2,h*.5);}
  if(o.frame!=='simple'){
    ctx.fillStyle=o.frame==='pop'?'#e2b54b':'#78a566';
    for(let i=0;i<12;i++){const x=25+i*(w-50)/11;for(const y of [25,h-25]){ctx.beginPath();if(o.frame==='pop')ctx.arc(x,y,12,0,Math.PI*2);else ctx.ellipse(x,y,12,20,i%2?-.5:.5,0,Math.PI*2);ctx.fill();}}
  }
  const resultY=h-(o.event?170:55);
  if(o.result){ctx.fillStyle='#315e4b';ctx.font='bold 48px sans-serif';ctx.fillText(resultText(data),w/2,resultY-110);ctx.font='28px sans-serif';ctx.fillText(`プレイ時間 ${data.result.configuredDuration ?? 30} 秒`,w/2,resultY-60);
    const success=data.gameMode==='KEEP'?data.result.dropCount===0:data.gameMode==='SURVIVAL'?data.result.survivalTime>=(data.result.configuredDuration??60)-1e-8:data.result.starCount>0;
    if(success){ctx.fillStyle='#bb871b';ctx.font='bold 34px sans-serif';ctx.fillText('★ よく がんばったね！ ★',w/2,resultY-12);}
  }
  if(o.event){ctx.fillStyle='#315e4b';ctx.font='bold 40px sans-serif';ctx.fillText(data.event.name,w/2,h-115);ctx.font='28px sans-serif';ctx.fillText(`${data.event.date}　${data.event.location}`,w/2,h-60);}
  return canvas;
}
