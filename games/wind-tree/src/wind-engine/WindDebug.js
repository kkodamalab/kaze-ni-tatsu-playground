import { WIND_COLORS } from "./WindColors.js";
import * as THREE from "../../vendor/three/three.module.js";
import { SPACE_SIZE } from "./WindConfig.js";
export class WindDebug {
  constructor(scene) {
    this.scene = scene;
    this.axes = new THREE.AxesHelper(12);
    scene.add(this.axes);
    this.spheres = [WIND_COLORS.left, WIND_COLORS.right].map((color) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 16, 10),
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
      );
      scene.add(mesh);
      return mesh;
    });
    this.handMarkers = [WIND_COLORS.left, WIND_COLORS.right].map((color) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 8, 6),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      m.renderOrder = 35;
      scene.add(m);
      return m;
    });
    this.handArrows = [WIND_COLORS.left, WIND_COLORS.right].map((color) => {
      const a = new THREE.ArrowHelper(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(),
        1,
        color,
      );
      a.traverse((o) => {
        if (o.material) {
          o.material.depthTest = false;
          o.material.depthWrite = false;
        }
        o.renderOrder = 34;
      });
      scene.add(a);
      return a;
    });
    this.weatherArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, -11, 0),
      3,
      0x88cfff,
    );
    scene.add(this.weatherArrow);
  }
  update(engine) {
    const c = engine.config;
    this.axes.visible = c.axes;
    [engine.left, engine.right].forEach((h, i) => {
      const s = this.spheres[i];
      s.visible =
        c.handDebug && c[h.side] && h.position !== null && h.age < 0.3;
      const marker = this.handMarkers[i],
        arrow = this.handArrows[i];
      marker.visible = s.visible;
      if (h.position) {
        s.position.set(...h.position);
        marker.position.set(...h.position);
        arrow.position.set(...h.position);
      }
      const wind = h.position ? h.at(...h.position, c) : [0, 0, 0],
        length = Math.hypot(...wind);
      arrow.visible = s.visible && length > 0.01;
      if (arrow.visible) {
        arrow.setDirection(new THREE.Vector3(...wind).normalize());
        arrow.setLength(Math.min(6, length));
      }
      s.scale.setScalar((SPACE_SIZE * c.handRadius) / 100);
    });
    const v = engine.components?.weather || [0, 0, 0];
    this.weatherArrow.visible = c.axes && Math.hypot(...v) > 0.01;
    if (this.weatherArrow.visible) {
      this.weatherArrow.setDirection(new THREE.Vector3(...v).normalize());
      this.weatherArrow.setLength(Math.min(8, Math.hypot(...v)));
    }
  }
  text(engine, metrics = {}) {
    const f = (v) => v.map((x) => x.toFixed(2)).join(", ");
    const components = engine.components || {
      weather: [0, 0, 0],
      body: [0, 0, 0],
      left: [0, 0, 0],
      right: [0, 0, 0],
    };
    const position = (h) => (h.position ? f(h.position) : "—");
    const local = (h) =>
      h.position ? f(h.at(...h.position, engine.config)) : "0, 0, 0";
    const poseDetected = metrics.poseDetected ?? engine.body.age <= 0.25;
    return `${engine.count} particles | +X EAST / +Y UP / -Z NORTH\nPOSE ${poseDetected ? "DETECTED" : "LOST"} | LANDMARKS ${metrics.landmarkCount || 0}/33\nINFERENCE FPS ${(metrics.poseFps || 0).toFixed(1)} | RENDER FPS ${(metrics.renderFps || 0).toFixed(1)}\nBODY AXIS XYZ (${f(engine.body.raw || [0, 0, 0])})\nWEATHER (${f(components.weather)})\nBODY (${f(components.body)}) ${engine.body.age <= 0.25 ? "DETECTED" : "LOST"}\nLEFT position (${position(engine.left)}) | velocity (${f(components.left)})\nLEFT field at hand (${local(engine.left)}) ${engine.left.age <= 0.25 ? "DETECTED" : "LOST"}\nRIGHT position (${position(engine.right)}) | velocity (${f(components.right)})\nRIGHT field at hand (${local(engine.right)}) ${engine.right.age <= 0.25 ? "DETECTED" : "LOST"}\nMAX SPEED ${engine.maxSpeed} units/s | WRAP`;
  }
  dispose() {
    for (const obj of [
      this.axes,
      ...this.spheres,
      ...this.handMarkers,
      ...this.handArrows,
      this.weatherArrow,
    ]) {
      this.scene.remove(obj);
      obj.traverse((child) => {
        child.geometry?.dispose();
        if (Array.isArray(child.material))
          child.material.forEach((m) => m.dispose());
        else child.material?.dispose();
      });
    }
  }
}
