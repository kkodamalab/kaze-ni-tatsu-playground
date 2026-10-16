import { GiftEditor } from "./gift-editor.js";
import { photoSettings } from "./photo-settings.js";
import { loadImage } from "../games/seesaw/src/images.js?v=20261009-ui-physics";
let editor, controller;
export function getGiftEditor(onErase) {
  if (!editor) editor = new GiftEditor(onErase);
  return editor;
}
export function getSharedGift() {
  if (!controller) controller = new SharedPhotoGift(getGiftEditor());
  return controller;
}
export class SharedPhotoGift {
  constructor(editor) {
    this.editor = editor;
    this.generation = 0;
    this.root = document.getElementById("gift");
    const gallery = document.createElement("section");
    gallery.id = "gift-gallery";
    gallery.innerHTML =
      '<h2>撮影写真から選ぶ</h2><p id="gift-no-photos">撮影写真はありません。同意確認後に画像を選ぶか、撮影できます。</p><div id="gift-photo-list" class="shared-photo-grid"></div>';
    this.root.querySelector("h1").after(gallery);
    const info = document.createElement("p");
    info.className = "transfer-privacy";
    info.textContent =
      "QRには接続IDと受信キーだけを含みます。PeerJS（0.peerjs.com）は接続調整、STUN（stun.l.google.com）は経路探索に使用し、写真はWebRTCで端末間転送します。直接接続できない場合はturn.peerjs.com等のTURN中継を通ることがあります。写真を保存するサーバーへアップロードしません。通信できない場合はPNG/JPEG保存を利用してください。";
    document.getElementById("gift-send").after(info);
    document.getElementById("gift-back").onclick = () => {
      this.editor.close();
      this.root.hidden = true;
      document.body.classList.remove("shared-gift-open");
      document.documentElement.classList.remove("shared-gift-open");
      this.onBack?.();
    };
    document.getElementById("new-participant").onclick = () => this.onNext?.();
    const erase = this.editor.onErase;
    this.editor.onErase = () => {
      this.session?.clear();
      this.renderGallery();
      erase?.();
    };
  }
  async open({
    session,
    gameName = "風に立つ",
    result = {},
    data,
    hasConsent = false,
    onBack = () => {},
    onNext = () => {},
  }) {
    if (!photoSettings.value.giftEnabled) return false;
    const generation = ++this.generation;
    if (this.trialId !== session?.trialId) {
      this.editor.erase();
      this.trialId = session?.trialId;
    }
    this.session = session;
    this.onBack = onBack;
    this.onNext = onNext;
    this.editor.open(
      data || {
        gameName,
        objectType: "EGG",
        images: {},
        result,
        event: photoSettings.event(),
      },
    );
    document.getElementById("gift-consent").checked = hasConsent;
    this.root.hidden = false;
    document.body.classList.add("shared-gift-open");
    document.documentElement.classList.add("shared-gift-open");
    this.renderGallery();
    const selected = session?.photos.find((p) => p.id === session.selectedId);
    if (selected) await this.choose(selected, generation);
    this.root.scrollIntoView({ block: "start" });
    return true;
  }
  renderGallery() {
    const list = document.getElementById("gift-photo-list");
    list.replaceChildren();
    document.getElementById("gift-no-photos").hidden =
      !!this.session?.photos.length;
    for (const photo of this.session?.photos || []) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shared-photo-thumb";
      button.setAttribute("aria-label", "この写真でPHOTO GIFTをつくる");
      button.setAttribute(
        "aria-pressed",
        String(this.session.selectedId === photo.id),
      );
      const image = document.createElement("img");
      image.src = photo.url;
      image.alt = "今回の参加者の撮影写真";
      button.append(image);
      button.onclick = () => this.choose(photo, this.generation);
      list.append(button);
    }
  }
  async choose(photo, generation = this.generation) {
    if (!this.editor.consent()) return;
    let canvas;
    try {
      canvas = await loadImage(photo.blob);
      if (
        generation !== this.generation ||
        !this.session?.photos.includes(photo) ||
        !this.editor.consent()
      )
        return;
      this.session.select(photo.id);
      this.editor.setPhoto("smile", canvas);
      canvas.width = canvas.height = 0;
      this.renderGallery();
    } catch {
      document.getElementById("gift-status").textContent =
        "写真を読み込めませんでした。別の写真を選んでください。";
    } finally {
      if (canvas) canvas.width = canvas.height = 0;
    }
  }
  clear() {
    this.generation++;
    this.session?.clear();
    this.session = null;
    this.trialId = null;
    this.editor.erase();
    this.editor.data = null;
    this.renderGallery();
    this.root.hidden = true;
    document.body.classList.remove("shared-gift-open");
    document.documentElement.classList.remove("shared-gift-open");
  }
}
