import { renderQR } from './qr-connection.js?v=20261009-ui-physics';
export const transferLimits = { chunk: 48*1024, bytes: 12*1024*1024, ttl: 10*60*1000, timeout: 15000 };
export function giftURL(base,peer,token) {
  const u=new URL(base);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('接続URLが正しくありません。');
  if(!/^[\w-]{1,128}$/.test(peer)||!/^[a-f0-9]{64}$/.test(token))throw Error('転送セッションが正しくありません。');
  u.search='';u.hash='';u.searchParams.set('gift',peer);u.searchParams.set('token',token);return u.href;
}
export function validManifest(m) { return m?.type==='manifest' && m.mime==='image/png' && Number.isInteger(m.size) && m.size>0 && m.size<=transferLimits.bytes && Number.isInteger(m.chunks) && m.chunks===Math.ceil(m.size/transferLimits.chunk); }
export function pngBytes(buffer) { const a=new Uint8Array(buffer);return a.length>=8&&[137,80,78,71,13,10,26,10].every((n,i)=>a[i]===n); }
function secret() { return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''); }
export class GiftSender {
  constructor(status = () => {}) { this.status=status;this.generation=0; }
  stop() { this.generation++; clearTimeout(this.expiry);clearTimeout(this.timer);this.conn?.close();this.peer?.destroy();this.conn=null;this.peer=null;this.blob=null;this.token=null; }
  async start(blob,base,qr,link) {
    this.stop();if(!blob||blob.size>transferLimits.bytes||blob.type!=='image/png')throw Error('転送できるPNGは12MBまでです。PCでPNGを保存できます。');
    const generation=this.generation;this.blob=blob;this.token=secret();const id=crypto.randomUUID();
    this.peer=new Peer(id);const url=giftURL(base,id,this.token);renderQR(qr,url);link.href=url;link.textContent=url;
    this.status('写真を受け取るQRです。PCを開いたまま読み取ってください（10分間有効）。');
    this.expiry=setTimeout(()=>{this.stop();this.status('転送の有効期限が切れました。「スマホにおくる」で新しいQRを作れます。');},transferLimits.ttl);
    this.peer.on('error',()=>this.status('接続サービスに到達できません。再試行するかPCでPNGを保存してください。'));
    this.peer.on('connection',conn=>{
      if(this.generation!==generation||this.conn){conn.close();return;}
      this.conn=conn;let authenticated=false,index=0,waiting=false;
      const send=async()=>{
        if(!authenticated||waiting||this.generation!==generation)return;
        if(index>=Math.ceil(blob.size/transferLimits.chunk)){conn.send({type:'complete'});this.status('送信済み。スマホの受信確認を待っています…');return;}
        waiting=true;const bytes=await blob.slice(index*transferLimits.chunk,(index+1)*transferLimits.chunk).arrayBuffer();
        if(this.generation!==generation||!conn.open)return;
        conn.send({type:'chunk',index,bytes});clearTimeout(this.timer);this.timer=setTimeout(()=>{conn.close();this.status('転送が止まりました。スマホの「再試行」で最初から受信できます。');},transferLimits.timeout);
      };
      conn.on('data',m=>{
        if(!authenticated){if(m?.type!=='hello'||m.token!==this.token){conn.close();return;}authenticated=true;clearTimeout(this.timer);conn.send({type:'manifest',size:blob.size,chunks:Math.ceil(blob.size/transferLimits.chunk),mime:'image/png'});send().catch(()=>conn.close());return;}
        if(m?.type==='ack'&&m.index===index&&waiting){clearTimeout(this.timer);waiting=false;index++;this.status(`送信中 ${Math.min(100,Math.round(index*transferLimits.chunk/blob.size*100))}%`);send().catch(()=>conn.close());}
        if(m?.type==='received'){clearTimeout(this.timer);this.status('転送完了！スマホで保存してください。転送終了ボタンで一時データを破棄できます。');}
      });
      conn.on('open',()=>{this.timer=setTimeout(()=>conn.close(),transferLimits.timeout);});
      conn.on('close',()=>{clearTimeout(this.timer);if(this.conn===conn){this.conn=null;this.status('接続が閉じました。同じQRから再試行できます（期限内）。');}});
      conn.on('error',()=>conn.close());
    });
    return url;
  }
}
export function startGiftReceiver(id,token) {
  const $=id=>document.getElementById(id);let peer,conn,parts=[],manifest=null,index=0,url=null,timer,version=0;
  const status=text=>$('receive-status').textContent=text;
  const dispose=()=>{version++;clearTimeout(timer);conn?.close();peer?.destroy();parts=[];manifest=null;index=0;if(url)URL.revokeObjectURL(url);url=null;$('receive-image').removeAttribute('src');$('receive-save').hidden=true;$('receive-save').removeAttribute('href');$('receive-share').hidden=true;$('receive-share').onclick=null;};
  const fail=text=>{clearTimeout(timer);parts=[];conn?.close();status(text+'「再試行」を押してください。');};
  const deadline=()=>{clearTimeout(timer);timer=setTimeout(()=>fail('転送が止まりました。'),transferLimits.timeout);};
  function connect(){
    dispose();const current=version;status('写真のPCにつないでいます…');
    try{giftURL(location.href,id,token);}catch{status('受信用URLが正しくありません。QRを読み直してください。');return;}
    try { peer=new Peer();peer.on('error',()=>{if(current===version)fail('接続できません。PCとネットワークを確認してください。');});
    peer.on('open',()=>{if(current!==version)return;conn=peer.connect(id,{reliable:true});deadline();conn.on('open',()=>conn.send({type:'hello',token}));
      conn.on('data',async m=>{
        if(current!==version)return;deadline();
        if(m?.type==='manifest'){if(manifest||!validManifest(m)){fail('画像情報が正しくありません。');return;}manifest=m;status('写真を受信しています…');return;}
        if(m?.type==='chunk'){
          if(!manifest||index>=manifest.chunks||m.index!==index||!(m.bytes instanceof ArrayBuffer || ArrayBuffer.isView(m.bytes))||m.bytes.byteLength!==Math.min(transferLimits.chunk,manifest.size-index*transferLimits.chunk)){fail('画像データが正しくありません。');return;}
          parts.push(m.bytes instanceof ArrayBuffer ? new Uint8Array(m.bytes) : new Uint8Array(m.bytes.buffer,m.bytes.byteOffset,m.bytes.byteLength));conn.send({type:'ack',index});index++;status(`受信中 ${Math.min(100,Math.round(index*transferLimits.chunk/manifest.size*100))}%`);return;
        }
        if(m?.type==='complete'){
          if(!manifest||index!==manifest.chunks||!pngBytes(parts[0])){fail('画像が完全に届きませんでした。');return;}
          clearTimeout(timer);const blob=new Blob(parts,{type:'image/png'});parts=[];url=URL.createObjectURL(blob);
          const image=$('receive-image');image.src=url;
          try{await image.decode();if(current!==version)return;conn.send({type:'received'});$('receive-save').href=url;$('receive-save').hidden=false;status('届きました！「写真を保存」を押してください。');
            if(navigator.canShare?.({files:[new File([blob],'kaze-ni-tatsu.png',{type:'image/png'})]})){$('receive-share').hidden=false;$('receive-share').onclick=async()=>{try{await navigator.share({files:[new File([blob],'kaze-ni-tatsu.png',{type:'image/png'})]});}catch{status('共有を終了しました。「写真を保存」も使えます。');}};}
          }catch{if(current===version)fail('PNGを表示できませんでした。');}
        }
      });conn.on('close',()=>{if(current!==version)return;clearTimeout(timer);if(!url)status('転送が中断しました。PCを開いたまま「再試行」を押してください。');});conn.on('error',()=>{if(current===version)fail('通信に失敗しました。');});
    });}catch{fail('接続を開始できません。');}
  }
  $('receive-retry').onclick=connect;$('receive-discard').onclick=()=>{dispose();$('receive-share').onclick=null;status('写真と接続を破棄しました。');};
  addEventListener('pagehide',dispose);connect();
}
