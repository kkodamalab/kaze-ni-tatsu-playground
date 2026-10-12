export class PhotoUI {
  constructor(session, root = document, { prefix = "" } = {}) {
    this.session = session;
    this.root = root;
    this.document = root.ownerDocument || root;
    this.previewId = null;
    const get = (id) => root.querySelector(`#${prefix}${id}`);
    this.grid = get("photoGrid");
    this.empty = get("noPhotos");
    this.dialog = get("photoDialog");
    this.image = get("photoPreview");
    this.caption = get("photoCaption");
    this.save = get("savePhotoBtn");
    this.remove = get("deletePhotoBtn");
    get("closePhotoBtn").onclick = () => this.dialog.close();
    get("choosePhotoBtn").onclick = () => {
      session.select(this.previewId);
      this.render();
      this.dialog.close();
    };
    this.save.onclick = () => {
      const p = session.photos.find((p) => p.id === session.selectedId);
      if (!p) return;
      const a = this.document.createElement("a");
      a.href = p.url;
      a.download = `wind-tree-${session.trialId}-${p.id}.jpg`;
      a.click();
    };
    this.remove.onclick = () => {
      session.remove(session.selectedId);
      this.render();
    };
    this.dialog.addEventListener("close", () => {
      this.image.removeAttribute("src");
      this.previewId = null;
    });
    this.render();
  }
  render() {
    this.grid.replaceChildren();
    this.empty.hidden = this.session.photos.length > 0;
    this.save.disabled = this.remove.disabled = !this.session.selectedId;
    for (const photo of this.session.photos) {
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "photoThumb";
      button.setAttribute(
        "aria-label",
        `${photo.elapsedSec.toFixed(1)}秒・笑顔スコア${Math.round(photo.smileScore * 100)}%を拡大`,
      );
      button.setAttribute(
        "aria-pressed",
        String(photo.id === this.session.selectedId),
      );
      const image = this.document.createElement("img");
      image.src = photo.url;
      image.alt = "撮影した写真";
      image.loading = "lazy";
      const caption = this.document.createElement("span");
      caption.textContent = `${photo.elapsedSec.toFixed(1)}秒 / ${Math.round(photo.smileScore * 100)}%${photo.id === this.session.selectedId ? " ✓ PHOTO GIFT" : ""}`;
      button.append(image, caption);
      button.onclick = () => {
        this.previewId = photo.id;
        this.image.src = photo.url;
        this.caption.textContent = caption.textContent;
        this.dialog.showModal();
      };
      this.grid.append(button);
    }
  }
  clear() {
    if (this.dialog.open) this.dialog.close();
    this.image.removeAttribute("src");
    this.previewId = null;
    this.session.clear();
    this.render();
  }
}
