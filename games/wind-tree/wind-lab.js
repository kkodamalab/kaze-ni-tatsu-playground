import { LabFullscreen } from "./src/wind-lab/Fullscreen.js";
import {
  RESPONSE_PRESETS,
  RESPONSE_KEYS,
} from "./src/wind-engine/WindResponse.js";
import { WIND_COLORS } from "./src/wind-engine/WindColors.js";
import * as THREE from "./vendor/three/three.module.js";
import { OrbitControls } from "./vendor/three/OrbitControls.js";
import { WindConfig, RANGES } from "./src/wind-engine/WindConfig.js";
import { WindEngine } from "./src/wind-engine/WindEngine.js";
import { WeatherWind } from "./src/wind-engine/WeatherWind.js";
import { CoordinateMapper } from "./src/wind-engine/CoordinateMapper.js";
import { ParticleField } from "./src/wind-engine/ParticleField.js";
import { WindDebug } from "./src/wind-engine/WindDebug.js";
import { drawPoseOverlay } from "./src/wind-lab/PoseOverlay.js";
import { SceneModes } from "./src/wind-lab/SceneModes.js";
import { SkeletonAvatar } from "./src/wind-lab/SkeletonAvatar.js";
import { LabPlay } from "./src/wind-lab/LabPlay.js?v=fullscreen-preview";
import {
  trackingSnapshot,
  trackingText,
  downloadTrackingCsv,
} from "./src/wind-lab/TrackingReport.js";
import { POSE_TESTS, poseSequence } from "./src/wind-lab/PoseSequences.js";
const groups = {
  "PARTICLE FLOW": [
    ["ambient", "AMBIENT FLOW"],
    ["ambientSpeed", "AMBIENT SPEED %"],
    ["drift", "DRIFT / TURBULENCE %"],
  ],
  AVATAR: [
    ["avatar", "3D AVATAR"],
    ["avatarSize", "AVATAR SIZE %"],
  ],
  PARTICLES: [
    ["gridX", "GRID X"],
    ["gridY", "GRID Y"],
    ["gridZ", "GRID Z"],
    ["dotSize", "DOT SIZE"],
    ["speed", "SPEED %"],
    ["particles", "PARTICLES ON"],
    ["trail", "TRAIL ON"],
    ["trailDuration", "TRAIL DURATION 秒"],
    ["trailOpacity", "TRAIL OPACITY %"],
    ["axes", "XYZ AXIS"],
  ],
  WEATHER: [
    ["weather", "WEATHER WIND ON"],
    ["direction", "WIND DIRECTION ° (FROM)"],
    ["windSpeed", "WIND SPEED m/s"],
    ["weatherGain", "WEATHER GAIN %"],
  ],
  BODY: [
    ["body", "BODY WIND ON"],
    ["bodySensitivity", "BODY SENSITIVITY %"],
    ["bodySmoothing", "BODY SMOOTHING %"],
    ["bodyDeadZone", "BODY DEAD ZONE °"],
  ],
  HANDS: [
    ["left", "LEFT HAND ON"],
    ["right", "RIGHT HAND ON"],
    ["leftSensitivity", "LEFT SENSITIVITY %"],
    ["rightSensitivity", "RIGHT SENSITIVITY %"],
    ["handRadius", "HAND RADIUS %"],
    ["handGain", "HAND WIND GAIN %"],
    ["handSpeedThreshold", "HAND SPEED THRESHOLD units/s"],
    ["handSmoothing", "HAND SMOOTHING %"],
    ["handDebug", "HAND FIELD DEBUG"],
  ],
};
export class WindLab {
  constructor({ root, video, camera, onExit, initialDuration = 30 }) {
    this.root = root;
    this.video = video;
    this.camera = camera;
    this.onExit = onExit;
    let storage;
    try {
      storage = localStorage;
    } catch {}
    this.store = new WindConfig(storage);
    this.disposed = false;
    this.cameraOn = false;
    this.cameraPending = false;
    this.pc = true;
    this.skeleton = false;
    this.previewOn = true;
    this.auto = false;
    this.last = 0;
    this.lastPose = 0;
    this.lastVideo = -1;
    this.lastDetection = 0;
    this.mapper = new CoordinateMapper();
    this.diagnostics = {
      poseFps: 0,
      renderFps: 0,
      poseFrames: 0,
      renderFrames: 0,
      windowStart: performance.now(),
      landmarkCount: 0,
    };
    this.trackingRows = [];
    this.mode = "DOT";
    this.mount();
    this.weather = new WeatherWind({ onChange: () => this.weatherStatus() });
    this.engine = new WindEngine(this.store.values, this.weather);
    this.weather.simulated(
      this.engine.config.direction,
      this.engine.config.windSpeed,
    );
    try {
      this.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
      this.renderer.setClearColor(0x07111c);
      this.stage.prepend(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.view = new THREE.PerspectiveCamera(50, 1, 0.1, 180);
      this.controls = new OrbitControls(this.view, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.minDistance = 8;
      this.controls.maxDistance = 90;
      this.resetView();
      this.bindDirect();
      this.field = new ParticleField(this.scene, this.engine);
      this.debug = new WindDebug(this.scene, this.engine);
      this.modes = new SceneModes(
        this.scene,
        this.engine,
        this.field,
        this.renderer,
      );
      this.avatar = new SkeletonAvatar(this.scene);
      this.play = new LabPlay(this, initialDuration);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.stage);
      this.resize();
      this.fullscreen = new LabFullscreen(this.root, this.$("#labFullscreen"), () => this.resize());
      this.visibility = () => {
        this.play?.growth.setHidden(
          document.hidden || this.mode === "DOT",
          performance.now(),
        );
        this.play?.face.pause();
        this.avatar?.resetTracking();
        this.last = 0;
        this.lastDetection = 0;
        this.diagnostics.windowStart = performance.now();
        this.diagnostics.poseFrames = this.diagnostics.renderFrames = 0;
        this.engine.suspend();
        if (document.hidden) {
          cancelAnimationFrame(this.raf);
          this.raf = null;
        } else if (!this.disposed && !this.raf)
          this.raf = requestAnimationFrame((t) => this.frame(t));
      };
      document.addEventListener("visibilitychange", this.visibility);
      this.raf = requestAnimationFrame((t) => this.frame(t));
    } catch (e) {
      this.dispose();
      throw e;
    }
  }
  bindDirect() {
    const canvas = this.renderer.domElement;
    const ray = new THREE.Raycaster(),
      plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
      hit = new THREE.Vector3();
    const move = (event) => {
      if (!this.direct || !this.directDragging) return;
      const rect = canvas.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        ),
        this.view,
      );
      if (ray.ray.intersectPlane(plane, hit))
        this.directHands[this.$("#labDirectSide").value] = [
          hit.x,
          hit.y,
          hit.z,
        ].map((v) => Math.max(-9, Math.min(9, v)));
    };
    canvas.onpointerdown = (event) => {
      if (!this.direct) return;
      this.directDragging = true;
      canvas.setPointerCapture(event.pointerId);
      move(event);
    };
    canvas.onpointermove = move;
    canvas.onpointerup = canvas.onpointercancel = () => {
      this.directDragging = false;
    };
  }
  mount() {
    const c = this.store.values;
    const settings =
      `<fieldset><legend>WIND RESPONSE</legend><label for="lab-responsePreset">反応プリセット</label><select id="lab-responsePreset"><option>SOFT</option><option selected>NORMAL</option><option>STRONG</option><option>CUSTOM</option></select><p>左手 = マゼンタ / 右手 = アンバー / 骨格 = シアン</p></fieldset>` +
      Object.entries(groups)
        .map(
          ([name, fields]) =>
            `<fieldset><legend>${name}</legend>${name === "WEATHER" ? `<p>位置情報をOpen-Meteoへ送信して、周辺の大まかな風を表示します。正確な位置は保存しません。</p><button id="labGps">現在地の風を取得 / GPS WEATHER</button><p>MANUAL LOCATION：デモ地点は南大沢周辺（現在地ではありません）。座標は保存しません。</p><label>緯度 <input id="labLatitude" type="number" min="-90" max="90" step="any" value="35.61"></label><label>経度 <input id="labLongitude" type="number" min="-180" max="180" step="any" value="139.38"></label><button id="labManual">手動地点の風を取得</button><button id="labSimulated">SIMULATED WIND</button><p><a href="https://open-meteo.com/" target="_blank" rel="noopener">Weather data by Open-Meteo</a>（予測値）</p>` : ""}${fields.map(([key, label]) => (typeof c[key] === "boolean" ? `<label><input id="lab-${key}" data-key="${key}" type="checkbox" ${c[key] ? "checked" : ""}> ${label}</label>` : `<label for="lab-${key}">${label}<output id="lab-value-${key}">${c[key]}</output><input id="lab-${key}" data-key="${key}" type="range" min="${RANGES[key][0]}" max="${RANGES[key][1]}" step="${RANGES[key][2]}" value="${c[key]}"></label>`)).join("")}${name === "AVATAR" ? `<label><input id="lab-avatar-axes" data-key="axes" type="checkbox" ${c.axes ? "checked" : ""}> XYZ AXIS</label><label for="lab-avatarStyle">AVATAR STYLE<select id="lab-avatarStyle" data-key="avatarStyle"><option value="SKELETON" ${c.avatarStyle === "SKELETON" ? "selected" : ""}>SKELETON</option><option value="POINTS" ${c.avatarStyle === "POINTS" ? "selected" : ""}>POINTS</option></select></label><p>上半身は肩中心、全身は腰中心。推定奥行きは目安です。Poseの倍率は全関節と手の風の位置に共通適用します。速度ゲインと風の半径は変えません。</p>` : ""}${name === "PARTICLE FLOW" ? `<label>VERTICAL FLOW<select id="lab-verticalFlow" data-key="verticalFlow"><option>DOWN</option><option>UP</option><option>NONE</option></select></label>` : ""}${name === "PARTICLES" ? '<button id="labResetParticles">PARTICLE RESET</button><button id="labResetView">CAMERA VIEW RESET</button>' : ""}${name === "BODY" ? '<button id="labCalibrate">CALIBRATE</button><p>現在の姿勢をニュートラルにします。奥行きは単眼推定の目安です。</p>' : ""}</fieldset>`,
        )
        .join("");
    this.root.innerHTML = `<header class="lab-header"><h1>3D WIND LAB</h1><nav aria-label="DISPLAY MODE">${["DOT", "KIDS", "ART"].map((mode) => `<button data-mode="${mode}" aria-pressed="${mode === "DOT"}">${mode}</button>`).join("")}</nav><div class="lab-weather"><p id="labWeatherStatus" class="lab-status" role="status"></p><small id="labWeatherDetails"></small></div><div class="lab-toolbar"><button id="labCamera" aria-pressed="false">CAMERA OFF</button><button id="labPreview" aria-pressed="true">PREVIEW ON</button><button id="labSkeleton" aria-pressed="false">SKELETON OFF</button><button id="labPc" aria-pressed="true">PC TEST ON</button><button id="labFullscreen" aria-pressed="false">FULLSCREEN</button><button id="labExit">ゲームに戻る</button></div></header><div id="labMessage" class="lab-toast" role="status"></div><div class="lab-layout"><div class="lab-stage"><small id="labCameraActive" class="lab-camera-active" hidden>CAMERA ACTIVE</small><div class="lab-preview hidden"><canvas id="labSkeletonCanvas"></canvas></div><pre id="labAvatarStatus" class="lab-avatar-status" role="status" hidden></pre><div class="lab-caption">ドラッグ / タッチで回転・ピンチでズーム<br>+X 東（右） / +Y 上 / -Z 北（奥）<br>マゼンタ = 左手 / アンバー = 右手</div></div><aside class="lab-settings">${settings}<fieldset><legend>DIRECT HAND TEST</legend><button id="labDirect" aria-pressed="false">DIRECT HAND TEST OFF</button><label>操作する手<select id="labDirectSide"><option value="left">LEFT / マゼンタ</option><option value="right">RIGHT / アンバー</option></select></label><p>3D画面をドラッグして手の球を動かします。PC・Poseと同じHandWindを使用します。</p></fieldset><fieldset id="labPcPanel"><legend>PC TEST</legend><label>合成33点Pose<select id="labPoseTest"><option value="">MANUAL / AUTO MOTION</option>${Object.entries(
      POSE_TESTS,
    )
      .map(
        ([key, name]) => `<option value="${key}">TEST ${key}: ${name}</option>`,
      )
      .join(
        "",
      )}</select></label><button id="labAuto" aria-pressed="false">AUTO MOTION OFF</button>${["body", "left", "right"].map((part) => ["X", "Y", "Z"].map((axis, i) => `<label>${part.toUpperCase()} ${axis}<output id="lab-value-test-${part}${axis}">${part === "left" && i === 0 ? -4 : part === "right" && i === 0 ? 4 : 0}</output><input id="lab-test-${part}${axis}" type="range" min="${part === "body" ? -1 : -10}" max="${part === "body" ? 1 : 10}" step=".01" value="${part === "left" && i === 0 ? -4 : part === "right" && i === 0 ? 4 : 0}"></label>`).join("")).join("")}</fieldset><fieldset class="lab-debug"><legend>DEBUG</legend><details class="lab-tracking" open><summary>BODY TRACKING DEBUG</summary>${["WEATHER ONLY", "BODY ONLY", "LEFT HAND ONLY", "RIGHT HAND ONLY", "ALL ON", "ALL OFF"].map((s, i) => `<button data-preset="${i}">${s}</button>`).join("")}<pre id="labDebug"></pre><pre id="labTrackingDebug"></pre><button id="labTrackingCsv">TRACKING CSV</button></details><button id="labResetSettings">RESET SETTINGS</button></fieldset></aside></div>`;
    this.root.dataset.displayMode = "DOT";
    this.$ = (s) => this.root.querySelector(s);
    const details = document.createElement("details");
    details.className = "lab-details";
    details.open = true;
    details.innerHTML = "<summary>詳細設定 / SETTINGS</summary>";
    this.$(".lab-settings").before(details);
    details.append(this.$(".lab-settings"));
    this.root
      .querySelectorAll("[data-mode]")
      .forEach(
        (button) => (button.onclick = () => this.setMode(button.dataset.mode)),
      );
    this.$("#lab-responsePreset").value = c.responsePreset;
    this.$("#lab-responsePreset").addEventListener("change", (event) => {
      const name = event.target.value;
      this.apply({
        ...this.store.values,
        ...(RESPONSE_PRESETS[name] || {}),
        responsePreset: name,
      });
    });
    this.$("#lab-verticalFlow").value = c.verticalFlow;
    this.$("#labDirect").onclick = async () => {
      if (this.cameraPending) return;
      if (this.cameraOn) await this.toggleCamera();
      this.direct = !this.direct;
      this.pc = false;
      this.directHands ||= { left: [-4, 0, 0], right: [4, 0, 0] };
      this.controls.enabled = !this.direct;
      this.toggleButton("labDirect", "DIRECT HAND TEST", this.direct);
      this.toggleButton("labPc", "PC TEST", false);
      this.$("#labPcPanel").hidden = true;
      this.engine.suspend();
      if (this.direct) this.apply({ ...this.store.values, handDebug: true });
    };
    this.stage = this.$(".lab-stage");
    this.preview = this.$(".lab-preview");
    this.preview.prepend(this.video);
    this.root.querySelectorAll("[data-key]").forEach((input) =>
      input.addEventListener("input", () => {
        const key = input.dataset.key;
        const value =
          input.type === "checkbox"
            ? input.checked
            : input.tagName === "SELECT"
              ? input.value
              : Number(input.value);
        this.apply({
          ...this.store.values,
          [key]: value,
          ...(RESPONSE_KEYS.includes(key) ? { responsePreset: "CUSTOM" } : {}),
        });
        if (["direction", "windSpeed"].includes(key))
          this.weather.simulated(
            this.engine.config.direction,
            this.engine.config.windSpeed,
          );
      }),
    );
    this.root.querySelectorAll('[id^="lab-test-"]').forEach((input) =>
      input.addEventListener("input", () => {
        this.$("#lab-value-test-" + input.id.slice(9)).value = input.value;
      }),
    );
    this.$("#labGps").onclick = () => this.weather.gps();
    this.$("#labManual").onclick = () => {
      const lat = this.$("#labLatitude").value.trim(),
        lon = this.$("#labLongitude").value.trim();
      if (!lat || !lon) {
        this.message("緯度と経度を入力してください");
        return;
      }
      this.weather.manual(Number(lat), Number(lon));
    };
    this.$("#labSimulated").onclick = () =>
      this.weather.simulated(
        this.engine.config.direction,
        this.engine.config.windSpeed,
      );
    this.$("#labResetParticles").onclick = () => {
      this.engine.reset();
      this.field?.rebuild();
    };
    this.$("#labResetView").onclick = () => this.resetView();
    this.$("#labCalibrate").onclick = () =>
      this.message(
        this.engine.body.calibrate()
          ? "現在の姿勢をニュートラルとして記録しました"
          : "PC TESTまたは身体検出後にキャリブレーションしてください",
      );
    this.$("#labResetSettings").onclick = () => {
      this.store.reset();
      this.apply(this.store.values);
      this.weather.simulated(
        this.engine.config.direction,
        this.engine.config.windSpeed,
      );
    };
    this.$("#labTrackingCsv").onclick = () =>
      downloadTrackingCsv(this.trackingRows);
    this.$("#labExit").onclick = () => this.onExit();
    this.$("#labCamera").onclick = () => this.toggleCamera();
    this.$("#labPreview").onclick = () => { this.previewOn = !this.previewOn; this.syncPreview(); };
    this.$("#labSkeleton").onclick = () => {
      this.skeleton = !this.skeleton;
      this.toggleButton("labSkeleton", "SKELETON", this.skeleton);
      this.skeletonDraw(null);
    };
    this.$("#labPc").onclick = () => {
      this.direct = false;
      this.controls.enabled = true;
      this.toggleButton("labDirect", "DIRECT HAND TEST", false);
      this.pc = !this.pc;
      if (this.pc) {
        this.play?.stopPhotos();
        this.cameraOn = false;
        this.camera.stop();
        this.syncPreview();
        this.toggleButton("labCamera", "CAMERA", false);
      }
      this.engine.suspend();
      this.toggleButton("labPc", "PC TEST", this.pc);
      this.$("#labPcPanel").hidden = !this.pc;
    };
    this.$("#labPoseTest").onchange = () => {
      this.poseTest = this.$("#labPoseTest").value;
      this.sequenceStart = performance.now();
      this.mapper.resetAvatar();
      this.engine.suspend();
      this.avatar.resetTracking();
    };
    this.$("#labAuto").onclick = () => {
      this.auto = !this.auto;
      this.toggleButton("labAuto", "AUTO MOTION", this.auto);
    };
    this.root.querySelectorAll("[data-preset]").forEach(
      (button) =>
        (button.onclick = () => {
          const i = Number(button.dataset.preset),
            c = { ...this.store.values };
          ["weather", "body", "left", "right"].forEach(
            (k, j) => (c[k] = i === 4 || i === j),
          );
          c.ambient = i === 4;
          this.apply(c);
        }),
    );
  }
  acceptInput(sample, time, source = "sensor") {
    this.engine.input(sample, time);
    this.play?.acceptInput(sample, time, source);
    if (source === "pc" || source === "direct")
      this.avatar?.input(
        {
          ...this.mapper.syntheticPose(sample),
          source:
            source === "direct" ? "DIRECT HAND TEST" : "PC TEST SYNTHETIC",
        },
        time,
      );
  }
  getSelectedGift() {
    return this.play?.getSelectedGift() || null;
  }
  setMode(mode) {
    if (!this.modes || this.mode === mode) return;
    this.resumeGraphics();
    this.mode = mode;
    this.modes.setMode(mode);
    this.root.dataset.displayMode = mode;
    this.$(".lab-details").open = mode === "DOT";
    this.$(".lab-tracking").open = mode === "DOT";
    this.root
      .querySelectorAll("[data-mode]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.mode === mode),
        ),
      );
    this.play.setMode(mode);
  }
  apply(config) {
    const previous = this.engine.positions;
    this.store.replace(config);
    this.engine.configure(this.store.values);
    this.$("#lab-responsePreset").value = this.store.values.responsePreset;
    if (previous !== this.engine.positions) this.field?.rebuild();
    else this.field?.drawHistory();
    for (const [key, value] of Object.entries(this.store.values)) {
      const primary = this.$("#lab-primary-" + key);
      if (primary) {
        if (primary.type === "checkbox") primary.checked = value;
        else primary.value = value;
      }
      for (const input of this.root.querySelectorAll(`[data-key="${key}"]`)) {
        if (input.type === "checkbox") input.checked = value;
        else {
          input.value = value;
          const output = this.$("#lab-value-" + key);
          if (output) output.value = value;
        }
      }
    }
  }
  toggleButton(id, label, on) {
    const b = this.$("#" + id);
    b.textContent = label + " " + (on ? "ON" : "OFF");
    b.setAttribute("aria-pressed", String(on));
  }
  message(text) {
    this.$("#labMessage").textContent = text;
  }
  weatherStatus() {
    if (!this.weather) return;
    const w = this.weather,
      d = w.data;
    this.$("#labWeatherStatus").textContent =
      `${w.mode} | ${d ? `${d.direction.toFixed(0)}° FROM / ${d.speed.toFixed(1)} m/s` : "風データなし"} | ${w.status}`;
    this.$("#labWeatherDetails").textContent = d?.time
      ? `気象対象時刻 ${d.time} (${d.timezone}) / 取得 ${d.receivedAt} / 位置取得 ${w.location?.acquiredAt} / 緯度 ${w.location?.latitude.toFixed(3)} 経度 ${w.location?.longitude.toFixed(3)}`
      : "現在地は未取得。手動地点の初期値は南大沢周辺です。";
  }
  async toggleCamera() {
    if (this.cameraPending) return;
    this.direct = false;
    this.controls.enabled = true;
    this.toggleButton("labDirect", "DIRECT HAND TEST", false);
    if (this.cameraOn) {
      this.play?.stopPhotos();
      this.cameraOn = false;
      this.camera.stop();
      this.engine.suspend();
      this.syncPreview();
      this.toggleButton("labCamera", "CAMERA", false);
      return;
    }
    this.cameraPending = true;
    this.$("#labCamera").disabled = true;
    this.$("#labPc").disabled = true;
    this.message("カメラを準備しています…");
    try {
      await this.camera.start();
      if (this.disposed) {
        this.camera.stop();
        this.camera.release?.();
        return;
      }
      this.mapper.resetAvatar();
      this.avatar?.resetTracking();
      this.cameraOn = true;
      this.pc = false;
      this.lastVideo = -1;
      this.lastDetection = 0;
      this.engine.suspend();
      this.toggleButton("labCamera", "CAMERA", true);
      this.toggleButton("labPc", "PC TEST", false);
      this.$("#labPcPanel").hidden = true;
      this.syncPreview();
      this.message("カメラ入力中。画像・ランドマークは外部送信しません。");
    } catch (e) {
      this.camera.stop();
      if (!this.disposed)
        this.message(
          "カメラを開始できません。許可・接続を確認するかPC TESTを利用してください。",
        );
    } finally {
      this.cameraPending = false;
      if (!this.disposed) {
        this.$("#labCamera").disabled = false;
        this.$("#labPc").disabled = false;
      }
    }
  }
  testSample(t) {
    const get = (part) =>
      ["X", "Y", "Z"].map((a) => Number(this.$("#lab-test-" + part + a).value));
    const body = get("body"),
      left = get("left"),
      right = get("right");
    if (this.auto) {
      left[0] = -4 + Math.sin(t / 700) * 3;
      left[1] = Math.cos(t / 850) * 3;
      right[0] = 4 + Math.sin(t / 800) * 3;
      right[1] = Math.cos(t / 700) * 3;
    }
    return { body, left, right };
  }
  syncPreview() {
    // Keep the playing video rendered offscreen when hidden (including mobile Safari).
    this.preview.classList.remove("hidden");
    this.preview.classList.toggle("preview-off", !this.cameraOn || !this.previewOn);
    this.$("#labCameraActive").hidden = !this.cameraOn || this.previewOn;
    this.toggleButton("labPreview", "PREVIEW", this.previewOn);
    this.skeletonDraw(null);
  }
  skeletonDraw(lm) {
    this.skeletonPoints = drawPoseOverlay(
      this.$("#labSkeletonCanvas"),
      lm,
      this.skeleton && this.previewOn && this.cameraOn,
      this.video,
    );
  }
  frame(t) {
    this.raf = null;
    if (this.disposed || this.graphicsPaused || document.hidden) return;
    const dt = this.last ? Math.min((t - this.last) / 1000, 0.1) : 0;
    this.last = t;
    this.diagnostics.renderFrames++;
    this.mapper.avatarSize = this.engine.config.avatarSize;
    if (this.direct) {
      this.acceptInput({ body: [0, 0, 0], ...this.directHands }, t, "direct");
    } else if (this.pc) {
      if (this.poseTest) {
        const result = poseSequence(
            this.poseTest,
            (t - this.sequenceStart) / 1000,
          ),
          frame = this.mapper.avatarPose(
            result.landmarks,
            result.worldLandmarks,
            t,
          );
        this.acceptInput(
          this.mapper.fromPose(result.landmarks, result.worldLandmarks, frame),
          t,
          "synthetic_pose",
        );
        if (frame)
          this.avatar.input(
            {
              ...frame,
              source:
                "SYNTHETIC POSE TEST " + this.poseTest + " / " + frame.source,
            },
            t,
          );
      } else this.acceptInput(this.testSample(t), t, "pc");
    } else if (this.cameraOn && t - this.lastPose >= 33) {
      this.lastPose = t;
      try {
        if (
          this.video.readyState >= 2 &&
          this.video.currentTime !== this.lastVideo
        ) {
          this.lastVideo = this.video.currentTime;
          const result = this.camera.detect(t);
          const fresh =
            result?.timestamp === undefined ||
            result.timestamp !== this.lastResultTimestamp;
          const recent =
            result?.timestamp === undefined || t - result.timestamp <= 500;
          if (fresh && (result?.timestamp !== undefined || !result?.pending)) {
            this.lastResultTimestamp = result?.timestamp;
            const lm = recent ? result?.landmarks?.[0] : null;
            this.diagnostics.poseFrames++;
            this.diagnostics.landmarkCount = lm?.length || 0;
            this.mapper.cameraAspect =
              (result?.imageWidth || this.video.videoWidth || 360) /
              (result?.imageHeight || this.video.videoHeight || 270);
            const poseFrame = this.mapper.avatarPose(
              lm,
              result?.worldLandmarks?.[0],
              result?.timestamp ?? t,
            );
            this.acceptInput(
              this.mapper.fromPose(lm, result?.worldLandmarks?.[0], poseFrame),
              t,
              "pose",
            );
            this.avatar.input(
              poseFrame
                ? { ...poseFrame, timestamp: result?.timestamp ?? t }
                : null,
              t,
            );
            this.lastDetection = lm ? t : 0;
            this.skeletonDraw(lm);
          }
        }
      } catch (e) {
        this.acceptInput(null, t, "pose");
        this.skeletonDraw(null);
        this.message("身体推論が停止しました。描画は継続しています。");
      }
      if (t - this.lastDetection > 250) {
        this.acceptInput(null, t, "pose");
        this.skeletonDraw(null);
      }
    }
    const diagnosticElapsed = t - this.diagnostics.windowStart;
    if (diagnosticElapsed >= 1000) {
      this.diagnostics.poseFps =
        (this.diagnostics.poseFrames * 1000) / diagnosticElapsed;
      this.diagnostics.renderFps =
        (this.diagnostics.renderFrames * 1000) / diagnosticElapsed;
      this.diagnostics.poseFrames = this.diagnostics.renderFrames = 0;
      this.diagnostics.windowStart = t;
    }
    const state = this.play?.growth.tick(t);
    if (
      this.mode === "DOT" ||
      !state ||
      (state.phase !== "finished" && !state.paused)
    )
      this.engine.step(dt);
    this.modes?.update(state?.growth || 0, this.engine.time);
    this.field.update();
    this.debug.update(this.engine);
    if (
      this.mode !== "DOT" &&
      !(this.$(".lab-details").open && this.$(".lab-tracking").open)
    ) {
      [
        ...this.debug.spheres,
        ...this.debug.handMarkers,
        ...this.debug.handArrows,
      ].forEach((s) => (s.visible = false));
      this.debug.weatherArrow.visible = false;
    }
    this.avatar.update(t, dt, this.engine.config, this.engine);
    this.diagnostics.poseDetected = this.avatar.state === "DETECTED";
    this.avatar.lineMaterial.color.setHex(WIND_COLORS.skeleton);
    this.avatar.jointMaterial.color.setHex(0xffffff);
    this.controls.update();
    this.renderer.render(this.scene, this.view);
    if (t - (this.lastDebug || 0) > 200) {
      const status = this.$("#labAvatarStatus");
      status.hidden = !this.engine.config.avatar || this.avatar.group.visible;
      status.textContent = this.avatar.text();
      this.$("#labDebug").textContent =
        this.debug.text(this.engine, this.diagnostics) +
        "\n" +
        this.avatar.text();
      this.$("#labTrackingDebug").textContent = trackingText(
        this.engine,
        this.diagnostics,
        this.avatar,
      );
      this.lastDebug = t;
    }
    if (t - (this.lastTracking || 0) >= 100) {
      this.lastTracking = t;
      if (this.trackingRows.length >= 6000) this.trackingRows.shift();
      this.trackingRows.push(
        trackingSnapshot(this.engine, this.diagnostics, this.avatar),
      );
    }
    if (dt > 0.045) this.slowFrames = (this.slowFrames || 0) + 1;
    else this.slowFrames = Math.max(0, (this.slowFrames || 0) - 1);
    if (this.slowFrames > 30) {
      this.field.quality = 0.5;
      if (this.mode === "ART") this.field.glowScale = 0.65;
      if (this.renderer.getPixelRatio() > 1) {
        this.renderer.setPixelRatio(1);
        this.resize();
        this.message("描画負荷に合わせて画素密度を調整しました");
      }
      this.slowFrames = 0;
    }
    if (state?.phase === "finished" && this.mode !== "DOT") {
      this.finishGraphics();
      return;
    }
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }
  finishGraphics() {
    if (this.graphicsPaused) return;
    // The RAF can finish before the 100ms play UI timer; commit results before release.
    this.play?.sync(performance.now());
    // Keep the grown tree/results as a CPU canvas, then release the live capture and GPU.
    const image = document.createElement("canvas");
    image.width = this.renderer.domElement.width;
    image.height = this.renderer.domElement.height;
    image.getContext("2d").drawImage(this.renderer.domElement, 0, 0);
    image.setAttribute("aria-label", "終了時の風の木");
    this.renderer.domElement.replaceWith(image);
    this.resultCanvas = image;
    this.camera.stop();
    this.camera.release?.();
    this.cameraOn = false;
    this.syncPreview();
    this.skeletonDraw(null);
    this.toggleButton("labCamera", "CAMERA", false);
    this.$("#labCamera").disabled = true;
    this.engine.suspend();
    this.avatar.resetTracking();
    this.directDragging = false;
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.graphicsPaused = true;
    this.raf = null;
  }
  resumeGraphics() {
    if (!this.graphicsPaused || this.disposed) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x07111c);
    this.resultCanvas?.remove();
    this.resultCanvas = null;
    this.stage.prepend(this.renderer.domElement);
    const target = this.controls.target.clone();
    this.controls = new OrbitControls(this.view, this.renderer.domElement);
    this.controls.target.copy(target);
    this.controls.enableDamping = true;
    this.controls.minDistance = 8;
    this.controls.maxDistance = 90;
    this.controls.enabled = !this.direct;
    this.bindDirect();
    this.graphicsPaused = false;
    this.$("#labCamera").disabled = false;
    this.last = 0;
    this.resize();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }
  resize() {
    if (!this.renderer || this.graphicsPaused) return;
    const width = this.stage.clientWidth,
      height = this.stage.clientHeight;
    if (!width || !height) return;
    this.view.aspect = width / height;
    this.view.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
  resetView() {
    if (!this.view) return;
    const damping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    this.controls.update(); // Consume gesture inertia before restoring the view.
    this.view.position.set(0, 1, 38);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.controls.enableDamping = damping;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.raf = null;
    this.fullscreen?.dispose();
    this.observer?.disconnect();
    document.removeEventListener("visibilitychange", this.visibility);
    this.camera.stop();
    this.cameraOn = false;
    this.camera.release?.();
    this.play?.dispose();
    this.modes?.dispose();
    this.avatar?.dispose();
    this.controls?.dispose();
    this.field?.dispose();
    this.debug?.dispose();
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.scene?.clear();
    this.trackingRows = [];
    this.engine?.dispose();
    this.root.replaceChildren();
  }
}
