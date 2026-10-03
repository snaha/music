<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import { T, useTask, useThrelte } from '@threlte/core/webgpu';
  import * as THREE from 'three/webgpu';
  import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
  import { cameraShot, sampleShot, nextTourStation, orbitSeconds, type CameraShot } from './cinema';
  import { artworkFlight } from './artworks';
  import { industrialEnvironment } from './environment';
  import { positionWorld, cameraPosition, normalWorld, uv, texture, uniform, sin, cos, exp, abs, vec3, float, mx_noise_float, bumpMap } from 'three/tsl';
  import { tslExports } from 'vgpu/three';
  import streetModule from './street.wgsl';
  import foilModule from './foil.wgsl';
  import { approach, spatialIndex, type Station, type Point } from './layout';
  import { catalog } from '../discovery.svelte';

  let { stations, childStations, cluster, selectedId, active, reduced, floating, cinematic, oncinematicstop, ontourselect, holographic, resetRevision, onready, onerror, onpose, onnear, onenterplaylist }: { stations: Station[]; childStations: Station[]; cluster: Station | null; floating: boolean; cinematic: boolean; oncinematicstop: () => void; ontourselect: (id: string) => void; onenterplaylist: (id: string) => void; selectedId: string; active: boolean; reduced: boolean; holographic: boolean; resetRevision: number; onready: () => void; onerror: () => void; onpose: (pose: Point & { yaw: number; pitch: number }, travelling: boolean, phase: 'manual' | 'approach' | 'orbit') => void; onnear: (stations: Station[]) => void } = $props();
  const { scene, size, renderer, invalidate } = useThrelte();
  const environment = industrialEnvironment();
  const root = new THREE.Group(), architecture = environment.group, installations = new THREE.Group();
  root.add(architecture, installations); scene.add(root);
  scene.background = new THREE.Color('#292c2c');
  scene.fog = new THREE.FogExp2('#4c463d', 0.008);
  const view = new THREE.PerspectiveCamera(58, 1, 0.1, 360);
  view.rotation.order = 'YXZ';
  const resources: { dispose: () => void }[] = [];
  function own<T extends { dispose: () => void }>(resource: T): T { resources.push(resource); return resource; }
  const cube = own(new THREE.BoxGeometry(1, 1, 1)), plane = own(new THREE.PlaneGeometry(1, 1));
  const artworkBody = own(new RoundedBoxGeometry(8.12, 8.12, 0.32, 2, 0.075));
  const sleeve = own(new THREE.MeshStandardMaterial({ color: '#393c3d', roughness: 0.48, metalness: 0.7 }));
  const clock = uniform(0), strength = uniform(1), accent = uniform(new THREE.Color('#6b5292'));
  const gpu = 'isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend === true;
  const roadMaterial = own(new THREE.MeshStandardNodeMaterial({ metalness: 0.42 }));
  const groundNoise = mx_noise_float(positionWorld.mul(0.3)).mul(0.5).add(0.5);
  roadMaterial.roughnessNode = groundNoise.pow(2).mul(0.42).add(0.16);
  roadMaterial.normalNode = bumpMap(mx_noise_float(positionWorld.mul(vec3(2.5, 1, 6))).add(sin(positionWorld.z.mul(8).add(clock.mul(0.4))).mul(0.04)), float(0.018));
  if (gpu) {
    const { wetStreet } = tslExports<{ wetStreet: { position: THREE.Node; clock: THREE.Node; accent: THREE.Node } }>(streetModule)('wetStreet');
    roadMaterial.colorNode = wetStreet({ position: positionWorld, clock, accent });
  } else {
    const worn = sin(positionWorld.x.mul(0.19)).mul(cos(positionWorld.z.mul(0.14))).mul(0.5).add(0.5);
    roadMaterial.colorNode = vec3(0.038, 0.043, 0.043).add(vec3(0.027, 0.024, 0.019).mul(worn));

  }
  const road = new THREE.Mesh(plane, roadMaterial); road.receiveShadow = true; road.rotation.x = -Math.PI / 2; road.scale.set(800, 800, 1); root.add(road);
  const loader = new THREE.TextureLoader();
  const textures = new Map<string, { texture: THREE.Texture; url: string }>();
  const neonMaterials = new Map<string, THREE.MeshBasicMaterial>();
  const visibleResources: { dispose: () => void }[] = [], clickable: THREE.Object3D[] = [];
  const flyers = new Map<string, { station: Station; group: THREE.Group; shadow: THREE.Mesh; child: boolean; amount: number }>();
  let focusedId = '', motionTime = 0, requestedPlaylist = '';
  const shadowMaterial = own(new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false }));
  shadowMaterial.colorNode = vec3(0.015, 0.02, 0.035);
  shadowMaterial.opacityNode = exp(uv().sub(0.5).length().pow(2).mul(-16)).mul(0.32);
  const raycaster = new THREE.Raycaster();
  let disposed = false, firstFrame = true, poseTime = 0, cell = '';
  const entrance = { x: 0, y: 10, z: 18, yaw: 0, pitch: -0.025 };
  const pose = { ...entrance };
  let flight: typeof pose | undefined;
  let shot: CameraShot | undefined, shotTime = 0;
  const visited = new Set<string>();
  function beginShot(station: Station) {
    flight = undefined; focusedId = station.album.id;
    shot = cameraShot(pose, station, size.current.width < 700); shotTime = 0;
    visited.add(station.album.id); ontourselect(station.album.id); invalidate();
  }
  export function stopCinematic() { shot = undefined; if (cinematic) oncinematicstop(); }
  const keys = new Set<string>();
  let nearby = $state.raw<Station[]>([]);
  let query = spatialIndex([]), childQuery = spatialIndex([]);
  function refreshNearby(force = false) {
    const nextCell = `${Math.floor(pose.x / 10)},${Math.floor(pose.z / 10)}`;
    if (!force && cell === nextCell) return;
    cell = nextCell; const limit = matchMedia('(pointer: coarse)').matches ? 16 : 24;
    const children = cluster ? childQuery(pose, limit - 1) : [];
    const roots = query(pose, limit - children.length);
    if (cluster && !roots.some(station => station.album.id === cluster.album.id)) roots.splice(Math.max(0, roots.length - 1), 1, cluster);
    const next = [...roots, ...children];
    if (force || next.map(station => station.album.id).join() !== nearby.map(station => station.album.id).join()) { nearby = next; onnear(next); }
  }
  export function pick(clientX: number, clientY: number): string | undefined {
    const rect = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1), view);
    return raycaster.intersectObjects(clickable.filter(object => object.visible && object.parent?.visible))[0]?.object.userData.id;
  }
  function frameArtwork(station: Station) {
    if (size.current.width >= 700) return approach(station);
    return { x: station.x + Math.sin(station.yaw) * 22, y: station.y + 1, z: station.z + Math.cos(station.yaw) * 22, yaw: station.yaw, pitch: -0.25 };
  }
  export function focusAlbum(station: Station) { stopCinematic(); focusedId = station.album.id; flight = frameArtwork(station); if (reduced) { Object.assign(pose, flight); flight = undefined; } invalidate(); }
  export function reset() { stopCinematic(); const first = size.current.width < 700 ? stations[0] : undefined; focusedId = first?.album.id ?? ''; requestedPlaylist = ''; flight = undefined; keys.clear(); Object.assign(pose, first ? frameArtwork(first) : entrance); refreshNearby(true); onpose({ ...pose }, !!flight, shot ? shotTime < shot.approachSeconds ? 'approach' : 'orbit' : 'manual'); invalidate(); }
  export function turn(dx: number, dy: number) { stopCinematic(); flight = undefined; pose.yaw -= dx * 0.004; pose.pitch = THREE.MathUtils.clamp(pose.pitch - dy * 0.003, -1.15, 1.15); invalidate(); }
  export function travel(forward: number, right = 0, up = 0) {
    stopCinematic(); flight = undefined;
    pose.x += -Math.sin(pose.yaw) * Math.cos(pose.pitch) * forward + Math.cos(pose.yaw) * right;
    pose.z += -Math.cos(pose.yaw) * Math.cos(pose.pitch) * forward - Math.sin(pose.yaw) * right;
    pose.y = THREE.MathUtils.clamp(pose.y + Math.sin(pose.pitch) * forward + up, 2, 60);
    invalidate();
  }
  export function setKey(key: string, down: boolean) { if (down) { stopCinematic(); keys.add(key); flight = undefined; } else keys.delete(key); }
  export function releaseKeys() { keys.clear(); }
  $effect(() => { const next = stations; childStations; cluster; untrack(() => { query = spatialIndex(next); childQuery = spatialIndex(childStations); environment.reserve([...next, ...childStations]); refreshNearby(true); invalidate(); }); });
  $effect(() => { resetRevision; untrack(reset); });
  $effect(() => { strength.value = holographic ? 1 : 0; invalidate(); });
  $effect(() => { floating; invalidate(); });
  $effect(() => { if (!active) untrack(() => keys.clear()); });
  $effect(() => {
    const enabled = cinematic && !reduced;
    untrack(() => {
      if (!enabled) { shot = undefined; if (cinematic) oncinematicstop(); return; }
      visited.clear(); keys.clear();
      const candidates = cluster && childStations.length ? childStations : stations;
      const target = candidates.find(station => station.album.id === selectedId) ?? candidates[0];
      if (target) beginShot(target);
    });
  });
  function box(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
    const mesh = new THREE.Mesh(cube, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  }
  function foilColor(art: THREE.Node<'vec3'>) {
    const direction = cameraPosition.sub(positionWorld).normalize();
    if (gpu) {
      const { recordFoil } = tslExports<{ recordFoil: { art: THREE.Node; uv: THREE.Node; view: THREE.Node; normal: THREE.Node; strength: THREE.Node } }>(foilModule)('recordFoil');
      return recordFoil({ art, uv: uv(), view: direction, normal: normalWorld, strength });
    }
    // Equivalent node graph emits GLSL for WebGL2; raw WGSL is WebGPU-only.
    const coord = uv();
    const phase = coord.x.mul(0.65).add(coord.y.mul(0.38)).add(direction.x.mul(0.7)).add(direction.y.mul(0.4));
    const pearl = vec3(0.55, 0.52, 0.64).add(vec3(0.43, 0.4, 0.34).mul(cos(phase.add(vec3(0.05, 0.38, 0.63)).mul(Math.PI * 2))));
    const engraving = sin(coord.x.mul(85).add(sin(coord.y.mul(18)).mul(4))).mul(0.5).add(0.5).pow(18);
    const sweep = coord.x.mul(0.72).add(coord.y.mul(0.52)).sub(0.6).add(direction.x.mul(0.65)).add(direction.y.mul(0.35));
    const band = exp(sweep.mul(sweep).mul(-12)), glint = exp(sweep.mul(sweep).mul(-210));
    const rim = float(1).sub(abs(direction.dot(normalWorld.normalize()))).pow(3);
    return art.mul(float(1).sub(strength.mul(band).mul(0.12))).add(strength.mul(pearl.mul(band.mul(0.16).add(engraving.mul(band).mul(0.1)).add(rim.mul(0.2))).add(vec3(glint.mul(0.15)))));
  }
  function label(station: Station) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 140;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#b1dce7'; context.font = '24px sans-serif'; context.fillText(station.album.kind === 'playlist' ? 'Playlist' : String(station.year ?? 'Undated'), 8, 32);
    context.fillStyle = '#eff4ff'; context.font = '30px sans-serif';
    const title = station.album.title.length > 38 ? station.album.title.slice(0, 37) + '…' : station.album.title;
    context.fillText(title, 8, 77, 745); context.fillStyle = '#c2d0e2'; context.font = '23px sans-serif'; context.fillText(station.album.sub, 8, 115, 745);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide }); visibleResources.push(map, material);
    const mesh = new THREE.Mesh(plane, material); mesh.scale.set(8, 1.46, 1); mesh.position.set(0, -4.8, 0.15); return mesh;
  }
  $effect(() => {
    const current = nearby;
    untrack(() => {
      const previousAmounts = new Map([...flyers].map(([id, flyer]) => [id, flyer.amount]));
      installations.clear(); clickable.length = 0; neonMaterials.clear(); flyers.clear();
      for (const resource of visibleResources.splice(0)) resource.dispose();
      const keep = new Set(current.map(station => station.album.id));
      for (const [id, entry] of textures) if (!keep.has(id)) { entry.texture.dispose(); textures.delete(id); }
      current.forEach(station => {
        const color = new THREE.Color().setHSL((catalog.colors[station.album.id]?.hue ?? (station.year ? station.year * 17 % 360 : 190)) / 360, 0.6, 0.62);
        const neon = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: station.album.id === selectedId ? 1 : 0.5 }); visibleResources.push(neon); neonMaterials.set(station.album.id, neon);
        const group = new THREE.Group(); group.position.set(station.x, station.y, station.z); group.rotation.y = station.yaw; installations.add(group);
        const body = new THREE.Mesh(artworkBody, sleeve); body.castShadow = true; group.add(body); body.userData.id = station.album.id; clickable.push(body);
        box(group, neon, -4.08, 0, 0, 0.035, 8, 0.2);
        let entry = textures.get(station.album.id);
        if (entry && entry.url !== station.album.cover) { entry.texture.dispose(); textures.delete(station.album.id); entry = undefined; }
        if (!entry && station.album.cover) {
          const map = loader.load(station.album.cover, () => { if (disposed || textures.get(station.album.id)?.texture !== map) map.dispose(); else invalidate(); }, undefined, () => {});
          map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 2; entry = { texture: map, url: station.album.cover }; textures.set(station.album.id, entry);
        }
        const material = new THREE.MeshBasicNodeMaterial({ toneMapped: false }); material.colorNode = foilColor(entry ? texture(entry.texture).rgb : vec3(color.r, color.g, color.b)); visibleResources.push(material);
        const cover = new THREE.Mesh(plane, material); cover.scale.set(8, 8, 1); cover.position.z = 0.17; cover.userData.id = station.album.id; group.add(cover); clickable.push(cover);
        const back = new THREE.Mesh(plane, material); back.scale.set(8, 8, 1); back.position.z = -0.17; back.rotation.y = Math.PI; back.userData.id = station.album.id; group.add(back); clickable.push(back);
        group.add(label(station));
        const shadow = new THREE.Mesh(plane, shadowMaterial); shadow.rotation.x = -Math.PI / 2; shadow.scale.set(15, 15, 1); shadow.position.set(station.x, 0.02, station.z); installations.add(shadow);
        const child = childStations.some(item => item.album.id === station.album.id);
        flyers.set(station.album.id, { station, group, shadow, child, amount: previousAmounts.get(station.album.id) ?? (focusedId === station.album.id ? 0 : 1) });
        // Playlist covers are visibly a collection even before their members load.
        if (station.album.kind === 'playlist') for (let layer = 1; layer <= 2; layer++) {
          const leaf = new THREE.Mesh(artworkBody, sleeve); leaf.position.set(layer * 0.5, layer * 0.3, -layer * 0.65); leaf.rotation.z = layer * -0.07; leaf.userData.id = station.album.id; group.add(leaf); clickable.push(leaf);
        }
      }); invalidate();
    });
  });
  $effect(() => {
    const selected = selectedId;
    const colors = nearby.map(station => ({ id: station.album.id, hue: catalog.colors[station.album.id]?.hue ?? (station.year ? station.year * 17 % 360 : 190) }));
    untrack(() => {
      for (const { id, hue } of colors) { const material = neonMaterials.get(id); if (material) { material.color.setHSL(hue / 360, 0.6, 0.62); material.opacity = id === selected ? 1 : 0.5; } }
      invalidate();
    });
  });
  const clusterOrigin = new THREE.Vector3();
  useTask(delta => {
    try {
      const dt = Math.min(delta, 0.05);
      if (keys.size) {
        const forward = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
        const right = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
        const up = Number(keys.has('e')) - Number(keys.has('q'));
        const norm = Math.max(1, Math.hypot(forward, right, up)); travel(forward * dt * 22 / norm, right * dt * 22 / norm, up * dt * 22 / norm);
      }
      if (shot && cinematic && !reduced) {
        // A playlist can publish artworks while its establishing shot is running.
        // Retarget from the exact current pose once its real members arrive.
        if (cluster && childStations.length && !childStations.some(station => station.album.id === shot!.station.album.id)) beginShot(childStations[0]);
        shotTime += dt;
        Object.assign(pose, sampleShot(shot, shotTime));
        if (!cluster && shot.station.album.kind === 'playlist' && shotTime >= shot.approachSeconds && requestedPlaylist !== shot.station.album.id) {
          requestedPlaylist = shot.station.album.id; onenterplaylist(shot.station.album.id);
        }
        if (shotTime >= shot.approachSeconds + orbitSeconds) {
          const candidates = cluster ? childQuery(pose, 16) : query(pose, 24);
          const next = nextTourStation(shot.station, candidates, visited);
          if (candidates.every(station => visited.has(station.album.id))) visited.clear();
          beginShot(next);
        }
      }
      if (flight) {
        const factor = reduced ? 1 : 1 - Math.exp(-dt * 5);
        for (const axis of ['x', 'y', 'z', 'pitch'] as const) pose[axis] = THREE.MathUtils.lerp(pose[axis], flight[axis], factor);
        const yawDelta = Math.atan2(Math.sin(flight.yaw - pose.yaw), Math.cos(flight.yaw - pose.yaw)); pose.yaw += yawDelta * factor;
        if (Math.hypot(pose.x - flight.x, pose.y - flight.y, pose.z - flight.z) < 0.02 && Math.abs(yawDelta) < 0.001) { Object.assign(pose, flight); flight = undefined; }
      }
      view.fov = size.current.width < 700 ? 72 : 58; view.aspect = size.current.width / Math.max(1, size.current.height); view.updateProjectionMatrix();
      view.position.set(pose.x, pose.y, pose.z); view.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); view.updateMatrixWorld();
      road.position.set(pose.x, -0.02, pose.z);
      refreshNearby(); if (!reduced) clock.value += dt;
      environment.update(clock.value, pose.yaw, pose.x, pose.z);
      if (floating) motionTime += dt;
      const expansion = cluster && childStations.length ? THREE.MathUtils.smoothstep(48 - ((pose.x - cluster.x) * Math.sin(cluster.yaw) + (pose.z - cluster.z) * Math.cos(cluster.yaw)), 0, 26) : 0;
      for (const flyer of flyers.values()) {
        const { station, group, shadow, child } = flyer;
        const resting = focusedId === station.album.id || station.album.id === cluster?.album.id || (!!cluster && station.album.id === selectedId);
        flyer.amount = reduced ? 0 : THREE.MathUtils.lerp(flyer.amount, resting ? 0 : 1, 1 - Math.exp(-dt * 6));
        const moved = artworkFlight(station, motionTime, flyer.amount);
        group.position.set(moved.x, moved.y, moved.z); group.rotation.set(moved.pitch, moved.yaw, moved.roll, 'YXZ'); group.scale.setScalar(1); group.visible = true;
        if (child && cluster) {
          group.position.lerpVectors(clusterOrigin.set(cluster.x, cluster.y, cluster.z), group.position, expansion);
          group.scale.setScalar(0.08 + expansion * 0.92); group.visible = expansion > 0.015;
        } else if (station.album.id === cluster?.album.id) { group.position.y += expansion * 4; group.scale.setScalar(1 - expansion); group.visible = expansion < 0.99; }
        if (cluster && !child && station.album.id !== cluster.album.id) { group.scale.setScalar(1 - expansion); group.visible = expansion < 0.95; }
        shadow.position.set(group.position.x, 0.02, group.position.z); shadow.visible = group.visible; shadow.scale.setScalar(12 + group.position.y * 0.4);
      }
      // Moving into a playlist is an intentional spatial action; load only that collection.
      if (!cluster && !flight) for (const station of nearby) {
        if (station.album.kind !== 'playlist' || station.album.id === requestedPlaylist || (shot && station.album.id !== shot.station.album.id)) continue;
        if (Math.hypot(pose.x - station.x, pose.y - station.y, pose.z - station.z) < 22) { requestedPlaylist = station.album.id; onenterplaylist(station.album.id); break; }
      }
      poseTime += dt; if (poseTime >= 0.1 || firstFrame) { poseTime = 0; onpose({ ...pose }, !!flight, shot ? shotTime < shot.approachSeconds ? 'approach' : 'orbit' : 'manual'); }
      // Manual motion and shader input respond on this frame; ambient work stops under overlays.
      if (!reduced || keys.size || flight || firstFrame) invalidate();
      if (firstFrame) { firstFrame = false; onready(); }
    } catch { onerror(); }
  }, { autoInvalidate: false, running: () => active });
  onDestroy(() => {
    disposed = true; scene.remove(root); keys.clear(); environment.dispose();
    for (const resource of visibleResources) resource.dispose();
    for (const entry of textures.values()) entry.texture.dispose();
    for (const resource of resources) resource.dispose();
  });
</script>
<T is={view} makeDefault manual />
