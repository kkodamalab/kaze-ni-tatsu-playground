import { session } from "./session-manager.js";
const cleanups = new Set();
export function registerCleanup(fn) {
  cleanups.add(fn);
  return () => cleanups.delete(fn);
}
export function disposeParticipant() {
  for (const cleanup of cleanups) {
    try {
      cleanup();
    } catch (e) {
      console.error("Participant cleanup failed", e);
    }
  }
  for (const video of document.querySelectorAll("video")) {
    video.srcObject?.getTracks?.().forEach((t) => t.stop());
    video.srcObject = null;
  }
  for (const canvas of document.querySelectorAll("canvas")) {
    canvas.width = canvas.height = 0;
  }
  for (const input of document.querySelectorAll("input[type=file]"))
    input.value = "";
  for (const input of document.querySelectorAll(
    "#photoConsent,#labPhotoConsent,#gift-consent",
  ))
    input.checked = false;
  session.clear();
  try {
    localStorage.removeItem("keep-the-egg:last-trial");
  } catch {}
}
export function nextParticipant() {
  disposeParticipant();
  location.assign(new URL("../index.html", import.meta.url));
}
window.addEventListener("pagehide", disposeParticipant);

window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
