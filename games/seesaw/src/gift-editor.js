import { drawGift, giftDefaults } from './gift.js?v=20261009-ui-physics';
import { loadImage, saveCanvas } from './images.js?v=20261009-ui-physics';
import { GiftSender } from './gift-transfer.js?v=20261009-ui-physics';
export class GiftEditor {
  constructor(onErase = () => {}) {
    this.photos={};this.options={...giftDefaults};this.version=0;this.photoVersion=0;this.drawGeneration=0;this.onErase=onErase;
    const $=id=>document.getElementById(id);this.$=$;this.sender=new GiftSender(text=>$('gift-transfer-status').textContent=text);
    $('gift-editor').innerHTML=`<p>写真の利用・転送は本人と保護者の了承を得て行ってください。画像はブラウザー内で加工し、QRから接続したスマホへ直接送ります。</p>
      <label><input id="gift-consent" type="checkbox">写真の利用・転送の了承を得ました</label>
      <div class="gift-materials">${['smile','drawing'].map(k=>`<fieldset><legend>${k==='smile'?'笑顔・記念写真':'お絵かき作品'}</legend><label>画像を選ぶ<input id="gift-file-${k}" type="file" accept="image/jpeg,image/png,image/webp"></label><button id="gift-camera-${k}" class="secondary">撮影・撮り直す</button><button id="gift-remove-${k}" class="quiet">この写真を消す</button><label>拡大<input id="gift-zoom-${k}" type="range" min="1" max="4" step=".05" value="1"></label><label>左右<input id="gift-x-${k}" type="range" min="-1" max="1" step=".02" value="0"></label><label>上下<input id="gift-y-${k}" type="range" min="-1" max="1" step=".02" value="0"></label></fieldset>`).join('')}</div>
      <button id="gift-reuse" class="secondary">ゲームの画像を笑顔写真に使う</button>
      <p id="gift-reuse-note" role="status"></p><div id="gift-camera-panel" hidden><video id="gift-video" muted autoplay playsinline></video><button id="gift-capture" class="secondary">撮影する</button><button id="gift-camera-close" class="quiet">カメラを閉じる</button></div>
      <div class="gift-options"><label>レイアウト<select id="gift-layout"><option value="A">A：笑顔と作品を左右に</option><option value="B">B：笑顔を大きく</option><option value="C">C：作品を大きく</option><option value="D">D：笑顔1枚</option><option value="E">E：作品1枚</option></select></label>
      <label>向き<select id="gift-orientation"><option value="portrait">たて</option><option value="landscape">よこ</option></select></label>
      <label>背景<select id="gift-background"><option value="natural">ナチュラル</option><option value="sky">空色</option><option value="grass">若草色</option><option value="cream">クリーム</option><option value="pink">ピンク</option></select></label>
      <label>フレーム<select id="gift-frame"><option value="simple">シンプル</option><option value="pop">ポップ</option><option value="nature">自然・草木</option></select></label>
      ${['title','result','event','object'].map((k,i)=>`<label><input type="checkbox" id="gift-${k}" checked>${['タイトル','ゲーム結果','イベント情報','オブジェクト名'][i]}</label>`).join('')}</div>`;
    for(const k of ['smile','drawing']){
      $(`gift-file-${k}`).onchange=async()=>{const f=$(`gift-file-${k}`).files[0];if(!f)return;if(!this.consent()){$(`gift-file-${k}`).value='';return;}const v=++this.photoVersion;this.closeCamera(false);try{const source=await loadImage(f);if(v===this.photoVersion)this.setPhoto(k,source);}catch(e){$('gift-status').textContent=e.message;}finally{$(`gift-file-${k}`).value='';}};
      $(`gift-camera-${k}`).onclick=()=>this.camera(k);$(`gift-remove-${k}`).onclick=()=>{this.photoVersion++;delete this.photos[k];this.invalidate();};
      for(const a of ['zoom','x','y'])$(`gift-${a}-${k}`).oninput=()=>{if(this.photos[k]){this.photos[k].crop[a]=Number($(`gift-${a}-${k}`).value);this.invalidate();}};
    }
    for(const k of ['layout','orientation','background','frame','title','result','event','object'])$(`gift-${k}`).onchange=()=>{this.options[k]=$(`gift-${k}`).type==='checkbox'?$(`gift-${k}`).checked:$(`gift-${k}`).value;this.invalidate();};
    $('gift-reuse').onclick=async()=>{if(!this.consent())return;const src=this.data?.images[this.data.objectType];if(src){this.photoVersion++;this.photos.smile={src,crop:{zoom:1,x:0,y:0}};this.resetCrop('smile');this.invalidate();}};
    $('gift-camera-close').onclick=()=>this.closeCamera();$('gift-capture').onclick=()=>{const v=$('gift-video');if(!v.videoWidth)return;const c=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);c.getContext('2d').drawImage(v,0,0,c.width,c.height);const k=this.cameraKind;this.closeCamera();this.setPhoto(k,c);};
    $('gift-save').onclick=async()=>{if(Object.keys(this.photos).length&&!this.consent())return;try{await saveCanvas($('gift-canvas'),'kaze-ni-tatsu-2026-10-18.png');}catch(e){$('gift-status').textContent=e.message;}};
    $('gift-send').onclick=async()=>{
      if(!$('gift-consent').checked){$('gift-transfer-status').textContent='写真を送る前に、本人・保護者の了承を確認してください。';return;}
      const generation=this.version,draw=this.drawGeneration;$('gift-send').disabled=true;
      const blob=await new Promise(r=>$('gift-canvas').toBlob(r,'image/png'));
      if(generation!==this.version||draw!==this.drawGeneration){$('gift-send').disabled=false;return;}
      try{await this.sender.start(blob,location.href,$('gift-qr'),$('gift-link'));$('gift-transfer').hidden=false;}catch(e){$('gift-transfer-status').textContent=e.message;}finally{$('gift-send').disabled=false;}
    };
    $('gift-transfer-stop').onclick=()=>this.stopTransfer();$('gift-discard').onclick=()=>{this.erase();this.onErase();this.render();};
    addEventListener('pagehide',()=>this.erase());
  }
  resetCrop(k){for(const a of ['zoom','x','y'])this.$(`gift-${a}-${k}`).value=a==='zoom'?1:0;}
  setPhoto(k,source){this.photos[k]={src:source.toDataURL('image/png'),crop:{zoom:1,x:0,y:0}};this.resetCrop(k);this.invalidate();}
  consent(){if(this.$('gift-consent').checked)return true;this.$('gift-status').textContent='写真を使う前に、本人・保護者の了承を確認してチェックしてください。';return false;}
  async camera(k){if(!this.consent())return;this.closeCamera();const version=this.photoVersion;this.cameraKind=k;try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:k==='smile'?'user':'environment',width:1280,height:720},audio:false});if(version!==this.photoVersion){stream.getTracks().forEach(t=>t.stop());return;}this.stream=stream;this.$('gift-video').srcObject=stream;this.$('gift-camera-panel').hidden=false;await this.$('gift-video').play();}catch{this.closeCamera();this.$('gift-status').textContent='カメラを使えません。画像ファイルを選んでください。';}}
  closeCamera(increment=true){if(increment)this.photoVersion++;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;this.$('gift-video').srcObject=null;this.$('gift-camera-panel').hidden=true;}
  open(data){this.closeCamera();this.stopTransfer();this.version++;this.data=data;this.$('gift-reuse').disabled=!data.images[data.objectType];this.$('gift-reuse-note').textContent=data.images[data.objectType]?'了承を確認して、ゲームで使った画像を設定できます。':'ゲームに取り込んだ画像がありません。標準オブジェクトは写真として流用しません。';this.render();}
  close(){this.version++;this.drawGeneration++;this.closeCamera();this.stopTransfer();}
  stopTransfer(){this.sender.stop();this.$('gift-transfer').hidden=true;this.$('gift-qr').replaceChildren();this.$('gift-link').removeAttribute('href');this.$('gift-link').textContent='';this.$('gift-transfer-status').textContent='';}
  invalidate(){this.stopTransfer();this.render();}
  async render(){if(!this.data)return;const v=++this.drawGeneration,version=this.version;this.$('gift-save').disabled=true;this.$('gift-send').disabled=true;this.$('gift-status').textContent='つくっています…';try{const canvas=document.createElement('canvas');await drawGift(canvas,this.data,this.options,this.photos);if(v!==this.drawGeneration||version!==this.version)return;const target=this.$('gift-canvas');target.width=canvas.width;target.height=canvas.height;target.getContext('2d').drawImage(canvas,0,0);this.$('gift-save').disabled=false;this.$('gift-send').disabled=false;this.$('gift-status').textContent='できた！PNGを保存するか、スマホにおくれます。';}catch{if(v===this.drawGeneration)this.$('gift-status').textContent='画像を描画できませんでした。写真を変更してください。';}}
  erase(){this.close();this.photos={};if(this.data)this.data.images={};this.$('gift-reuse').disabled=true;this.$('gift-consent').checked=false;for(const k of ['smile','drawing']){this.resetCrop(k);this.$(`gift-file-${k}`).value='';}const c=this.$('gift-canvas');c.getContext('2d').clearRect(0,0,c.width,c.height);}
}
