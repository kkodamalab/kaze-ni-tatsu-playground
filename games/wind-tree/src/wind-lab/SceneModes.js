import * as THREE from "../../vendor/three/three.module.js";
export const DISPLAY_MODES = ["DOT", "KIDS", "ART"];
const disposeGroup = (group) =>
  group.traverse((object) => {
    object.geometry?.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    materials.forEach((m) => {
      m?.map?.dispose();
      m?.dispose();
    });
  });
function makeTree(mode) {
  const tree = new THREE.Group(),
    isArt = mode === "ART",
    branches = [];
  const material = new THREE.MeshBasicMaterial({
    color: isArt ? 0x9ceeff : 0x88633c,
    transparent: isArt,
    opacity: 0.8,
    blending: isArt ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const addBranch = (start, end, index) => {
    const direction = new THREE.Vector3().subVectors(end, start),
      length = direction.length();
    const object = new THREE.Mesh(
      new THREE.CylinderGeometry(
        isArt ? 0.045 : 0.15,
        isArt ? 0.07 : 0.21,
        length,
        5,
      ),
      material.clone(),
    );
    object.position.copy(start);
    object.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    );
    const pivot = new THREE.Group();
    pivot.position.copy(start);
    object.position.set(0, length / 2, 0);
    object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    pivot.quaternion.copy(object.quaternion);
    object.quaternion.identity();
    pivot.add(object);
    tree.add(pivot);
    branches.push({ pivot, index });
  };
  addBranch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 24, 0), 0);
  for (let level = 0; level < 5; level++)
    for (let side = 0; side < 3; side++) {
      const angle = (side * Math.PI * 2) / 3 + level * 0.65,
        y = 8 + level * 3,
        len = 4 - level * 0.45;
      const start = new THREE.Vector3(0, y, 0),
        end = new THREE.Vector3(
          Math.cos(angle) * len,
          y + 4,
          Math.sin(angle) * len,
        );
      addBranch(start, end, level + 1);
      if (isArt) {
        const child = new THREE.Vector3(end.x * 1.18, end.y + 1, end.z * 1.18);
        addBranch(end, child, level + 2);
      } else {
        const leaf = new THREE.Mesh(
          new THREE.IcosahedronGeometry(1.6, 1),
          new THREE.MeshBasicMaterial({
            color: [0x65a859, 0x8bc46a, 0xadd67f][side],
          }),
        );
        leaf.position.copy(end);
        tree.add(leaf);
        branches.push({ pivot: leaf, index: level + 1, leaf: true });
      }
    }
  material.dispose();
  tree.position.set(0, -10, -12);
  return { tree, branches };
}
export class SceneModes {
  constructor(scene, engine, field, renderer) {
    Object.assign(this, { scene, engine, field, renderer });
    this.mode = "DOT";
    this.group = null;
    this.setMode("DOT");
  }
  setMode(mode) {
    if (!DISPLAY_MODES.includes(mode))
      throw new RangeError("Unknown display mode");
    if (this.group) {
      this.scene.remove(this.group);
      disposeGroup(this.group);
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.mode = mode;
    this.field.setDisplayMode(mode);
    this.scene.background = new THREE.Color(
      mode === "KIDS" ? 0xbde7ed : mode === "ART" ? 0x030818 : 0x07111c,
    );
    this.scene.fog =
      mode === "KIDS"
        ? new THREE.Fog(0xbde7ed, 45, 100)
        : mode === "ART"
          ? new THREE.FogExp2(0x030818, 0.013)
          : null;
    this.tree = null;
    this.branches = [];
    if (mode === "KIDS") {
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(60, 48),
        new THREE.MeshBasicMaterial({ color: 0xa4cb84 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -10.7;
      this.group.add(ground);
      for (let i = 0; i < 5; i++) {
        const cloud = new THREE.Group();
        for (let j = 0; j < 3; j++) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(1.8 + j * 0.15, 10, 6),
            new THREE.MeshBasicMaterial({ color: 0xf5fcfc }),
          );
          puff.position.set(j * 1.6, Math.sin(j) * 0.5, 0);
          cloud.add(puff);
        }
        cloud.position.set((i - 2) * 12, 13 + (i % 2) * 3, -18 - i * 4);
        this.group.add(cloud);
      }
    }
    if (mode !== "DOT") {
      const result = makeTree(mode);
      this.tree = result.tree;
      this.branches = result.branches;
      this.group.add(this.tree);
    }
    this.update(0, 0);
  }
  update(growth, time) {
    if (!this.tree) return;
    const g = Math.max(0, Math.min(1, growth));
    this.tree.visible = g > 0;
    for (const { pivot, index, leaf } of this.branches) {
      const progress = Math.max(
        0,
        Math.min(1, (g - index * 0.09) / (1 - index * 0.09)),
      );
      pivot.visible = progress > 0;
      if (leaf) pivot.scale.setScalar(Math.max(0.001, progress));
      else pivot.scale.set(1, Math.max(0.001, progress), 1);
      if (this.mode === "ART")
        pivot.traverse((o) => {
          if (o.material) o.material.opacity = 0.25 + 0.65 * g;
        });
    }
    if (this.mode === "ART") {
      this.field.material.color.setHSL(
        0.53 + Math.sin(time * 0.12) * 0.08,
        0.85,
        0.65,
      );
      this.field.trailMaterial.color.copy(this.field.material.color);
    }
  }
  dispose() {
    if (this.group) {
      this.scene.remove(this.group);
      disposeGroup(this.group);
    }
    this.group = null;
    this.scene.fog = null;
  }
}
