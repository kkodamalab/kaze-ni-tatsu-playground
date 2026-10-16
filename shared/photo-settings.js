export const photoSettingsKey = "playground:photo-settings";
export function today(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const photoDefaults = Object.freeze({
  enabled: true,
  scheduledEnabled: true,
  scheduledCount: 4,
  giftEnabled: true,
  threshold: 60,
  holdSeconds: 0.5,
  cooldownSeconds: 3,
  maxPhotos: 5,
  faceFps: 8,
  eventName: "風に立つ",
  eventDate: "",
  eventLocation: "南大沢・大平公園",
});
const limits = {
  scheduledCount: [1, 10],
  threshold: [10, 100],
  holdSeconds: [0.2, 3],
  cooldownSeconds: [1, 15],
  maxPhotos: [1, 10],
  faceFps: [5, 10],
};
export function cleanPhotoSettings(value = {}) {
  const result = { ...photoDefaults };
  for (const key of ["enabled", "giftEnabled", "scheduledEnabled"])
    if (typeof value?.[key] === "boolean") result[key] = value[key];
  for (const [key, [min, max]] of Object.entries(limits))
    if (Number.isFinite(value?.[key]))
      result[key] = Math.max(min, Math.min(max, value[key]));
  result.maxPhotos = Math.round(result.maxPhotos);
  result.scheduledCount = Math.round(result.scheduledCount);
  for (const key of ["eventName", "eventLocation"])
    if (typeof value?.[key] === "string") result[key] = value[key].slice(0, 80);
  if (
    typeof value?.eventDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.eventDate) &&
    Number.isFinite(Date.parse(value.eventDate)) &&
    new Date(value.eventDate).toISOString().slice(0, 10) === value.eventDate
  )
    result.eventDate = value.eventDate;
  return result;
}
export class PhotoSettingsStore extends EventTarget {
  constructor(storage) {
    super();
    this.storage = storage;
    try {
      this.value = cleanPhotoSettings(
        JSON.parse(storage?.getItem(photoSettingsKey) || "{}"),
      );
    } catch {
      this.value = { ...photoDefaults };
    }
  }
  update(patch) {
    this.value = cleanPhotoSettings({ ...this.value, ...patch });
    try {
      this.storage?.setItem(photoSettingsKey, JSON.stringify(this.value));
    } catch {}
    this.dispatchEvent(new Event("change"));
    return this.value;
  }
  event() {
    const v = this.value;
    return {
      name: v.eventName,
      date: v.eventDate || today(),
      location: v.eventLocation,
    };
  }
}
let storage;
try {
  storage = globalThis.localStorage;
} catch {}
export const photoSettings = new PhotoSettingsStore(storage);
export function mountPhotoSettings(
  root,
  {
    prefix = "",
    scheduled = false,
    ids: overrideIds = {},
    onRevoke = () => {},
    onChange = () => {},
  } = {},
) {
  const ids = {
    enabled: overrideIds.enabled || prefix + "smileEnabled",
    threshold: overrideIds.threshold || prefix + "smileThreshold",
    consent: overrideIds.consent || prefix + "photoConsent",
  };
  root.innerHTML = `<fieldset class="shared-photo-settings"><legend>笑顔シャッター・PHOTO GIFT</legend>
  ${scheduled ? '<label><input data-setting="scheduledEnabled" type="checkbox">定時自動撮影 ON / OFF</label><label>定時撮影枚数<input data-setting="scheduledCount" type="number" min="1" max="10" step="1"></label><p>撮影時刻はプレイ時間×k/枚数。枚数の変更は次のプレイから適用します。</p>' : ""}
  <label><input id="${ids.enabled}" data-setting="enabled" type="checkbox">笑顔シャッター ON / OFF</label>
  <label>笑顔閾値 <output id="${prefix}smileThresholdValue">60%</output><input id="${ids.threshold}" data-setting="threshold" type="range" min="10" max="100" step="1"></label>
  <label>${scheduled ? "笑顔追加撮影上限" : "撮影枚数（上限）"}<input data-setting="maxPhotos" type="number" min="1" max="10" step="1"></label>
  <details><summary>撮影・イベントの設定</summary><label>笑顔継続時間（秒）<input data-setting="holdSeconds" type="number" min="0.2" max="3" step="0.1"></label><label>クールダウン（秒）<input data-setting="cooldownSeconds" type="number" min="1" max="15" step="0.5"></label><label>Face推論 fps<input data-setting="faceFps" type="number" min="5" max="10" step="1"></label><label>イベント名<input data-setting="eventName" maxlength="80"></label><label>開催日<input data-setting="eventDate" type="date"></label><label>場所<input data-setting="eventLocation" maxlength="80"></label></details>
  <label><input data-setting="giftEnabled" type="checkbox">PHOTO GIFT ON / OFF</label>
  <label class="photo-consent"><input id="${ids.consent}" type="checkbox">写真撮影について、本人・保護者の同意を確認しました</label>
  <p>笑顔スコアは表情係数による独自の判定値で、笑顔の確率・正解率ではありません。写真はメモリ内のみ。自動アップロード・永続保存はしません。同意がなくても遊べます。</p><p class="shared-capture-status" role="status">撮影は同意確認後に有効になります</p></fieldset>`;
  const consent = root.querySelector("#" + ids.consent);
  const sync = () => {
    for (const input of root.querySelectorAll("[data-setting]")) {
      const key = input.dataset.setting;
      if (input.type === "checkbox") input.checked = photoSettings.value[key];
      else
        input.value =
          key === "eventDate"
            ? photoSettings.value[key] || today()
            : photoSettings.value[key];
    }
    root.querySelector("output").textContent =
      photoSettings.value.threshold + "%";
    if (
      !photoSettings.value.enabled &&
      (!scheduled || !photoSettings.value.scheduledEnabled)
    )
      root.querySelector(".shared-capture-status").textContent = "撮影OFFです";
    onChange(photoSettings.value);
  };
  root.addEventListener("input", (e) => {
    const input = e.target,
      key = input.dataset.setting;
    if (!key) return;
    if (input.validity && !input.validity.valid) return;
    photoSettings.update({
      [key]:
        input.type === "checkbox"
          ? input.checked
          : input.type === "number" || input.type === "range"
            ? Number(input.value)
            : input.value,
    });
  });
  consent.addEventListener("change", () => {
    if (!consent.checked) {
      onRevoke();
      root.querySelector(".shared-capture-status").textContent =
        "同意がないため撮影OFFです";
    } else onChange(photoSettings.value);
  });
  photoSettings.addEventListener("change", sync);
  sync();
  return {
    consent,
    hasConsent: () => consent.checked,
    status: (text) => {
      root.querySelector(".shared-capture-status").textContent = text;
    },
    dispose: () => photoSettings.removeEventListener("change", sync),
  };
}
