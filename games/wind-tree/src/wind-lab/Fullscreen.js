// Presentation only: never owns the camera, inference, game clock or particle state.
export class LabFullscreen {
  constructor(root, button, resize) {
    Object.assign(this, { root, button, resize });
    this.id = crypto.randomUUID();
    this.active = false;
    this.disposed = false;
    this.change = () => {
      const element =
        document.fullscreenElement || document.webkitFullscreenElement;
      if (element === root) {
        this.native = true;
        this.layout();
      } else if (this.native) this.exit();
    };
    this.pop = () => {
      if (this.active && history.state?.windLabFullscreen !== this.id)
        this.exit(false);
    };
    this.key = (e) => {
      if (e.key === "Escape" && this.active) this.exit();
    };
    this.layout = () => {
      if (!this.disposed) {
        cancelAnimationFrame(this.raf);
        this.raf = requestAnimationFrame(resize);
      }
    };
    document.addEventListener("fullscreenchange", this.change);
    document.addEventListener("webkitfullscreenchange", this.change);
    document.addEventListener("keydown", this.key);
    window.addEventListener("popstate", this.pop);
    window.addEventListener("resize", this.layout);
    window.addEventListener("orientationchange", this.layout);
    window.visualViewport?.addEventListener("resize", this.layout);
    button.onclick = () => (this.active ? this.exit() : this.enter());
  }
  async enter() {
    if (this.active || this.disposed || this.leaving) return;
    this.scrollTop = this.root.scrollTop;
    this.active = true;
    history.pushState({ ...history.state, windLabFullscreen: this.id }, "");
    this.root.classList.add("lab-fullscreen");
    this.root.scrollTop = 0;
    document.documentElement.classList.add("lab-fullscreen-open");
    this.button.textContent = "EXIT FULLSCREEN";
    this.button.setAttribute("aria-pressed", "true");
    this.layout();
    const request =
      this.root.requestFullscreen || this.root.webkitRequestFullscreen;
    if (request) {
      try {
        await request.call(this.root);
        if (!this.active || this.disposed) {
          if (
            (document.fullscreenElement || document.webkitFullscreenElement) ===
            this.root
          ) {
            const exit =
              document.exitFullscreen || document.webkitExitFullscreen;
            await exit?.call(document);
          }
        } else this.change();
      } catch {
        /* iPhone/denied API: keep the CSS fullscreen already applied. */
      }
    }
  }
  exit(back = true) {
    if (!this.active) return;
    this.active = false;
    this.native = false;
    this.root.classList.remove("lab-fullscreen");
    this.root.scrollTop = this.scrollTop;
    document.documentElement.classList.remove("lab-fullscreen-open");
    this.button.textContent = "FULLSCREEN";
    this.button.setAttribute("aria-pressed", "false");
    if (
      (document.fullscreenElement || document.webkitFullscreenElement) ===
      this.root
    ) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      try {
        Promise.resolve(exit?.call(document)).catch(() => {});
      } catch {}
    }
    if (back && history.state?.windLabFullscreen === this.id) {
      this.leaving = true;
      window.addEventListener(
        "popstate",
        () => {
          this.leaving = false;
        },
        { once: true },
      );
      history.back();
    }
    this.layout();
  }
  dispose() {
    this.exit();
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    document.removeEventListener("fullscreenchange", this.change);
    document.removeEventListener("webkitfullscreenchange", this.change);
    document.removeEventListener("keydown", this.key);
    window.removeEventListener("popstate", this.pop);
    window.removeEventListener("resize", this.layout);
    window.removeEventListener("orientationchange", this.layout);
    window.visualViewport?.removeEventListener("resize", this.layout);
  }
}
