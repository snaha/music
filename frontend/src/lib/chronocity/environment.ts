import * as THREE from 'three/webgpu';
import { approach, type Station } from './layout';
import { positionWorld, uv, uniform, vec3, float, sin, exp, mx_noise_float, bumpMap } from 'three/tsl';

// Procedural geometry/materials: no downloaded scenery or replacement cover imagery.
export function industrialEnvironment() {
  const group = new THREE.Group();
  const resources: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(item: T) => { resources.push(item); return item; };
  const cube = own(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = own(new THREE.CylinderGeometry(1, 1, 1, 16));
  const plane = own(new THREE.PlaneGeometry(1, 1));
  const time = uniform(0);
  const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
  function weathered(color: string, metalness: number) {
    const material = own(new THREE.MeshStandardNodeMaterial({ metalness, roughness: 0.78 }));
    const coarse = mx_noise_float(positionWorld.mul(0.22)).mul(0.5).add(0.5);
    const grain = mx_noise_float(positionWorld.mul(4));
    const base = new THREE.Color(color);
    material.colorNode = vec3(base.r, base.g, base.b).mul(coarse.mul(0.5).add(0.48)).mul(grain.mul(0.12).add(0.94));
    material.roughnessNode = coarse.mul(0.27).add(metalness > 0.5 ? 0.38 : 0.62);
    material.normalNode = bumpMap(grain, float(0.055));
    return material;
  }
  const concrete = weathered('#666159', 0.12), darkMetal = weathered('#3c4445', 0.75), copper = weathered('#986449', 0.72);
  const recess = own(new THREE.MeshStandardMaterial({ color: '#191e20', roughness: 0.94 }));
  const warm = own(new THREE.MeshBasicMaterial({ color: '#ffd095' }));
  const cold = own(new THREE.MeshBasicMaterial({ color: '#9fcac8' }));
  let prop = 0;
  const batches = new Map<THREE.Material, { position: THREE.Vector3; scale: THREE.Vector3; rotation: THREE.Euler; prop: number; geometry: THREE.BufferGeometry }[]>();
  function add(material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, geometry: THREE.BufferGeometry = cube, roll = 0) {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push({ position: new THREE.Vector3(x, y, z), scale: new THREE.Vector3(sx, sy, sz), rotation: new THREE.Euler(0, yaw, roll), prop, geometry });
  }
  // Layered silhouettes and recessed facade bays supply scale beyond the open gallery.
  for (let i = 0; i < 34; i++) {
    prop++;
    const angle = i / 34 * Math.PI * 2, radius = 122 + random(i + 18) * 40;
    const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
    const height = 46 + random(i + 41) * 91, width = 12 + random(i + 8) * 13, depth = 17;
    const transform = (localX: number, localZ: number) => [x + Math.cos(angle) * localX + Math.sin(angle) * localZ, z - Math.sin(angle) * localX + Math.cos(angle) * localZ];
    add(concrete, x, height / 2, z, width, height, depth, angle);
    add(darkMetal, x, height + 1.5, z, width + 1, 3, depth + 1, angle);
    add(concrete, x, height + 5, z, width * 0.56, 8, depth * 0.65, angle);
    for (let floor = 0; floor < Math.floor(height / 5); floor++) {
      const [fx, fz] = transform(0, -8.7);
      add(darkMetal, fx, 3 + floor * 5, fz, width + 0.25, 0.38, 1, angle);
      for (let bay = 0; bay < 4; bay++) {
        const [wx, wz] = transform((bay - 1.5) * width / 4.6, -8.58);
        add(recess, wx, 5 + floor * 5, wz, width / 5.8, 2.65, 0.35, angle);
        if (random(i * 117 + floor * 4 + bay) > 0.52) add(random(i + bay) > 0.8 ? cold : warm, wx - Math.sin(angle) * 0.27, 5 + floor * 5, wz - Math.cos(angle) * 0.27, width / 6.7, 1.65, 0.12, angle);
      }
    }
    for (const side of [-1, 1]) {
      const [px, pz] = transform(side * (width / 2 - 0.4), -9.2);
      add(copper, px, height * 0.43, pz, 0.36, height * 0.86, 0.36, 0, cylinder);
      for (let band = 0; band < 5; band++) add(darkMetal, px, 5 + band * height / 5.5, pz, 0.51, 0.6, 0.51, 0, cylinder);
    }
  }
  // Utility galleries, tanks and overhead trusses around an unobstructed central volume.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      prop++;
      const x = side * (63 + (i % 2) * 6), z = 22 - i * 31;
      add(concrete, x, 9, z, 13, 18, 24);
      add(darkMetal, x, 18.6, z, 15, 1.2, 26);
      add(copper, x, 24, z, 4.8, 10, 4.8, 0, cylinder);
      add(darkMetal, x, 29, z, 5.15, 0.7, 5.15, 0, cylinder);
      add(darkMetal, x, 20, z, 5.15, 0.7, 5.15, 0, cylinder);
      add(copper, x - side * 7, 12, z, 0.7, 20, 0.7, 0, cylinder);
      for (let j = 0; j < 6; j++) add(recess, x - side * 6.55, 4.5 + j * 1.4, z, 0.2, 0.65, 13);
      add(warm, x - side * 7, 16, z, 0.25, 0.28, 10);
      add(darkMetal, side * 51, 23, z, 0.7, 46, 0.7);
      add(darkMetal, side * 51, 41, z, 1.7, 1.8, 28);
      add(copper, side * 51, 35, z, 1.1, 1.1, 31);
    }
    // High mechanical cross-bracing reads as steel, without obscuring nearby artworks.
    for (const z of [-62, -120, 60]) {
      prop++;
      add(darkMetal, side * 27, 47, z, 56, 1.1, 1.6);
      add(darkMetal, side * 27, 52, z, 56, 0.7, 1.2);
      for (let brace = 0; brace < 7; brace++) add(copper, side * (4 + brace * 8), 49.5, z, 0.3, 9, 0.4, 0, cube, side * (brace % 2 ? -1 : 1) * Math.PI / 3);
    }
  }
  const object = new THREE.Object3D();
  const bounds = new Map<number, THREE.Box3>();
  const instances: { mesh: THREE.InstancedMesh; rows: { prop: number; matrix: THREE.Matrix4 }[] }[] = [];
  const emptyMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  cube.computeBoundingBox(); cylinder.computeBoundingBox();
  for (const [material, items] of batches) for (const geometry of [cube, cylinder]) {
    const rows = items.filter(item => item.geometry === geometry);
    if (!rows.length) continue;
    const mesh = own(new THREE.InstancedMesh(geometry, material, rows.length));
    const originals = rows.map((item, index) => {
      object.position.copy(item.position); object.scale.copy(item.scale); object.rotation.copy(item.rotation); object.updateMatrix(); mesh.setMatrixAt(index, object.matrix);
      const box = geometry.boundingBox!.clone().applyMatrix4(object.matrix);
      if (!bounds.has(item.prop)) bounds.set(item.prop, box); else bounds.get(item.prop)!.union(box);
      return { prop: item.prop, matrix: object.matrix.clone() };
    });
    instances.push({ mesh, rows: originals });
    mesh.castShadow = material === concrete || material === darkMetal || material === copper; mesh.receiveShadow = mesh.castShadow;
    group.add(mesh);
  }
  // Soft steam sheets are depth-tested against the architecture, never a screen overlay.
  const steamMaterial = own(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const coord = uv().sub(0.5);
  const turbulence = mx_noise_float(vec3(uv().x.mul(4), uv().y.mul(3).sub(time.mul(0.08)), time.mul(0.035))).mul(0.5).add(0.5);
  steamMaterial.colorNode = vec3(0.39, 0.36, 0.3);
  steamMaterial.opacityNode = exp(coord.x.pow(2).mul(-13).add(coord.y.pow(2).mul(-9))).mul(turbulence).mul(0.3);
  const steam: THREE.Mesh[] = [];
  for (const side of [-1, 1]) for (let i = 0; i < 7; i++) {
    const sheet = new THREE.Mesh(plane, steamMaterial); sheet.position.set(side * (38 + i % 3 * 4), 4 + i % 3 * 4, 28 - i * 23); sheet.scale.set(22, 14, 1); group.add(sheet); steam.push(sheet);
  }
  const hazeMaterial = own(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  hazeMaterial.colorNode = vec3(0.38, 0.23, 0.10);
  hazeMaterial.opacityNode = exp(uv().sub(0.5).length().pow(2).mul(-5)).mul(0.22);
  for (const x of [-65, 0, 65]) {
    const haze = new THREE.Mesh(plane, hazeMaterial); haze.position.set(x, 32, -94); haze.scale.set(100, 90, 1); group.add(haze); steam.push(haze);
  }
  // Lamp pools: finite footprints and rippled edges replace the endless luminous grid.
  const poolMaterial = own(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  poolMaterial.colorNode = vec3(0.65, 0.3, 0.095);
  poolMaterial.opacityNode = exp(uv().sub(0.5).length().pow(2).mul(-15)).mul(sin(uv().y.mul(120).add(time.mul(0.6))).mul(0.04).add(0.18));
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const pool = new THREE.Mesh(plane, poolMaterial); pool.rotation.x = -Math.PI / 2; pool.position.set(side * 43, 0.025, 22 - i * 31); pool.scale.set(25, 40, 1); group.add(pool);
  }
  const ambient = new THREE.HemisphereLight('#8ba3ae', '#302318', 1.25);
  const key = new THREE.DirectionalLight('#ffd5a0', 3.5); key.position.set(-35, 65, -40);
  key.castShadow = !matchMedia('(pointer: coarse)').matches;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 1, far: 230 });
  key.shadow.normalBias = 0.12; key.shadow.bias = -0.0005;
  group.add(key.target);
  const rim = new THREE.DirectionalLight('#8abdc7', 1.7); rim.position.set(45, 25, 35);
  group.add(ambient, key, rim);
  for (const side of [-1, 1]) {
    const lamp = new THREE.PointLight(side < 0 ? '#ffb462' : '#91c6d1', 700, 110, 2); lamp.position.set(side * 37, 17, -28); group.add(lamp);
  }
  // Shared geometry and materials, with a bounded 3×3 set of fixed world sections.
  // A section enters/leaves beyond 330 units, where distance fog hides the transition.
  const template = new THREE.Group();
  for (const child of [...group.children]) if (child instanceof THREE.Mesh) template.add(child);
  const instanceIndices = instances.map(item => template.children.indexOf(item.mesh));
  const steamIndices = steam.map(item => template.children.indexOf(item));
  const tiles = new Map<string, THREE.Group>();
  const cells = new Map<string, THREE.Box3[]>();
  let tileKey = '';
  const worldBox = new THREE.Box3();
  function reserveTile(tile: THREE.Group) {
    const blocked = new Set<number>();
    for (const [id, box] of bounds) {
      worldBox.copy(box).translate(tile.position);
      for (let x = Math.floor(worldBox.min.x / 40); x <= Math.floor(worldBox.max.x / 40); x++) for (let z = Math.floor(worldBox.min.z / 40); z <= Math.floor(worldBox.max.z / 40); z++) {
        if (cells.get(`${x},${z}`)?.some(reserved => worldBox.intersectsBox(reserved))) blocked.add(id);
      }
    }
    instances.forEach(({ rows }, batch) => {
      const mesh = tile.children[instanceIndices[batch]] as THREE.InstancedMesh;
      rows.forEach((item, index) => mesh.setMatrixAt(index, blocked.has(item.prop) ? emptyMatrix : item.matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    });
  }
  function disposeTile(tile: THREE.Group) {
    group.remove(tile);
    for (const index of instanceIndices) (tile.children[index] as THREE.InstancedMesh).dispose();
  }
  return {
    group,
    // Reserve swept artwork and approach volumes before drawing a prop. Whole structures
    // are omitted together, so clearing an album never leaves floating facade fragments.
    reserve(stations: Station[]) {
      cells.clear();
      for (const station of stations) {
        const target = approach(station);
        const envelope = new THREE.Box3(new THREE.Vector3(station.x - 11, station.y - 10, station.z - 12), new THREE.Vector3(station.x + 11, station.y + 10, station.z + 12));
        envelope.expandByPoint(new THREE.Vector3(target.x - 9, target.y - 8, target.z - 9));
        envelope.expandByPoint(new THREE.Vector3(target.x + 9, target.y + 8, target.z + 9));
        for (let x = Math.floor(envelope.min.x / 40); x <= Math.floor(envelope.max.x / 40); x++) for (let z = Math.floor(envelope.min.z / 40); z <= Math.floor(envelope.max.z / 40); z++) {
          const key = `${x},${z}`; if (!cells.has(key)) cells.set(key, []); cells.get(key)!.push(envelope);
        }
      }
      for (const tile of tiles.values()) reserveTile(tile);
    },
    update(seconds: number, cameraYaw: number, cameraX: number, cameraZ: number) {
      time.value = seconds;
      const cx = Math.round(cameraX / 340), cz = Math.round(cameraZ / 340), nextKey = `${cx},${cz}`;
      if (nextKey !== tileKey) {
        tileKey = nextKey;
        const keep = new Set<string>();
        for (let x = cx - 1; x <= cx + 1; x++) for (let z = cz - 1; z <= cz + 1; z++) {
          const id = `${x},${z}`; keep.add(id);
          if (!tiles.has(id)) { const tile = template.clone(true); tile.position.set(x * 340, 0, z * 340); reserveTile(tile); tiles.set(id, tile); group.add(tile); }
        }
        for (const [id, tile] of tiles) if (!keep.has(id)) { disposeTile(tile); tiles.delete(id); }
      }
      for (const tile of tiles.values()) for (const index of steamIndices) tile.children[index].rotation.y = cameraYaw;
      // The directional light keeps its world direction; only its shadow coverage follows.
      key.position.set(cameraX - 35, 65, cameraZ - 40); key.target.position.set(cameraX, 0, cameraZ);
    },
    dispose() { for (const tile of tiles.values()) disposeTile(tile); tiles.clear(); key.shadow.dispose(); for (const resource of resources) resource.dispose(); }
  };
}
