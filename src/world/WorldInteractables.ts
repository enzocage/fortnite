import * as THREE from 'three';
import { POIS } from '../core';
import type {
  LaunchPadEntity,
  TerrainQuery,
  Vec3Like,
  ZiplineEntity,
} from '../types';

interface PadVisual {
  data: LaunchPadEntity;
  spinner: THREE.Object3D;
  pulseRing: THREE.Mesh;
  baseY: number;
}

interface ZiplineOrb {
  mesh: THREE.Mesh;
  zipline: ZiplineEntity;
  t: number;
}

export class WorldInteractables {
  private group = new THREE.Group();
  private launchPads: LaunchPadEntity[] = [];
  private ziplines: ZiplineEntity[] = [];
  private padVisuals: PadVisual[] = [];
  private ziplineOrbs: ZiplineOrb[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(terrain: TerrainQuery) {
    this.group.name = 'WorldInteractables';
    this.buildLaunchPads(terrain);
    this.buildZiplines(terrain);
  }

  private addGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private addMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildLaunchPads(terrain: TerrainQuery): void {
    const skyline = POIS.find((p) => p.id === 'skyline_spire')!;
    const scorched = POIS.find((p) => p.id === 'scorched_caldera')!;
    const frostpeak = POIS.find((p) => p.id === 'frostpeak_citadel')!;
    const metro = POIS.find((p) => p.id === 'metro_towers')!;
    const crystal = POIS.find((p) => p.id === 'crystal_basin')!;
    const oasis = POIS.find((p) => p.id === 'sunken_oasis')!;
    const crater = POIS.find((p) => p.id === 'crater_depot')!;

    const padSpecs: Array<{
      id: string;
      kind: 'launch_pad' | 'geyser';
      x: number;
      z: number;
      yOverride?: number;
      boostVy: number;
      boostForward: number;
    }> = [
      // Two high-power ground Launch Pads at Skyline Spire launching straight onto Floating Sky-Island (y=44m)!
      { id: 'pad_sky_1', kind: 'launch_pad', x: skyline.x + 8, z: skyline.z + 10, boostVy: 34, boostForward: 8 },
      { id: 'pad_sky_2', kind: 'launch_pad', x: skyline.x - 8, z: skyline.z + 10, boostVy: 34, boostForward: 8 },
      // Launch Pad ON TOP of the Floating Sky-Island (y=44.2m) for rapid cross-map redeploys!
      { id: 'pad_sky_top', kind: 'launch_pad', x: skyline.x, z: skyline.z + 10, yOverride: 44.16, boostVy: 26, boostForward: 24 },
      // Two Volcanic Thermal Geysers at Scorched Caldera
      { id: 'geyser_volc_1', kind: 'geyser', x: scorched.x - 16, z: scorched.z - 6, boostVy: 30, boostForward: 14 },
      { id: 'geyser_volc_2', kind: 'geyser', x: scorched.x + 3, z: scorched.z + 6, boostVy: 30, boostForward: 14 },
      // Frostpeak Alpine Overlook Launch Pad
      { id: 'pad_frost', kind: 'launch_pad', x: frostpeak.x + 12, z: frostpeak.z + 23, boostVy: 28, boostForward: 20 },
      // Metro Towers Rooftop Helipad Launch Pad
      {
        id: 'pad_metro_heli',
        kind: 'launch_pad',
        x: metro.x + 20.5,
        z: metro.z - 18.5,
        yOverride: terrain.getHeightAt(metro.x + 18, metro.z - 16) + 0.22 + 5 * 3.2 + 0.14,
        boostVy: 27,
        boostForward: 22,
      },
      // Crystal Basin Central Island Pad
      { id: 'pad_crystal', kind: 'launch_pad', x: crystal.x, z: crystal.z + 11, boostVy: 27, boostForward: 18 },
      // Sunken Oasis Mesa Pad
      { id: 'pad_oasis', kind: 'launch_pad', x: oasis.x + 12, z: oasis.z + 4, boostVy: 27, boostForward: 18 },
      // Crater Depot Meteor Rim Pad
      { id: 'pad_crater', kind: 'launch_pad', x: crater.x + 6, z: crater.z + 4, boostVy: 27, boostForward: 18 },
    ];

    const rimMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.7 }));
    const padCoreMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#06b6d4',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      }),
    );
    const padRingMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const geyserRockMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#2b2429', roughness: 0.9 }));
    const geyserGlowMat = this.addMat(
      new THREE.MeshBasicMaterial({
        color: '#fb923c',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );

    const rimGeo = this.addGeo(new THREE.CylinderGeometry(1.75, 2.0, 0.22, 8));
    const coreGeo = this.addGeo(new THREE.CylinderGeometry(1.32, 1.32, 0.26, 8));
    const ringGeo = this.addGeo(new THREE.RingGeometry(1.0, 1.45, 24));
    ringGeo.rotateX(-Math.PI * 0.5);
    const geyserConeGeo = this.addGeo(new THREE.CylinderGeometry(1.1, 2.1, 0.75, 10));
    const geyserPlumeGeo = this.addGeo(new THREE.CylinderGeometry(0.45, 0.95, 3.6, 12, 1, true));

    for (const spec of padSpecs) {
      const y = spec.yOverride ?? terrain.getHeightAt(spec.x, spec.z);
      const data: LaunchPadEntity = {
        id: spec.id,
        kind: spec.kind,
        x: spec.x,
        y,
        z: spec.z,
        radius: 2.1,
        boostVy: spec.boostVy,
        boostForward: spec.boostForward,
      };
      this.launchPads.push(data);

      const container = new THREE.Group();
      container.position.set(spec.x, y, spec.z);

      if (spec.kind === 'launch_pad') {
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.position.y = 0.11;
        const core = new THREE.Mesh(coreGeo, padCoreMat);
        core.position.y = 0.13;
        const ring = new THREE.Mesh(ringGeo, padRingMat);
        ring.position.y = 0.35;
        container.add(rim, core, ring);
        this.group.add(container);
        this.padVisuals.push({ data, spinner: core, pulseRing: ring, baseY: 0.35 });
      } else {
        const vent = new THREE.Mesh(geyserConeGeo, geyserRockMat);
        vent.position.y = 0.36;
        const plume = new THREE.Mesh(geyserPlumeGeo, geyserGlowMat);
        plume.position.y = 2.0;
        const ring = new THREE.Mesh(ringGeo, geyserGlowMat);
        ring.position.y = 0.85;
        container.add(vent, plume, ring);
        this.group.add(container);
        this.padVisuals.push({ data, spinner: plume, pulseRing: ring, baseY: 0.85 });
      }
    }
  }

  private buildZiplines(terrain: TerrainQuery): void {
    const pairs: Array<{ id: string; ax: number; az: number; bx: number; bz: number; hA: number; hB: number }> = [
      { id: 'zip_frost_suburbs', ax: -26, az: -216, bx: -146, bz: -162, hA: 7.5, hB: 7.5 },
      { id: 'zip_frost_pines', ax: 18, az: -222, bx: 142, bz: -175, hA: 7.5, hB: 7.5 },
      { id: 'zip_metro_crystal', ax: -48, az: -44, bx: 68, bz: -128, hA: 9.0, hB: 7.5 },
      { id: 'zip_market_skyline', ax: 168, az: 52, bx: 164, bz: 134, hA: 7.5, hB: 8.5 },
      { id: 'zip_crater_volcano', ax: 18, az: 126, bx: -148, bz: 124, hA: 8.0, hB: 8.0 },
      { id: 'zip_oasis_metro', ax: -198, az: -15, bx: -106, bz: -42, hA: 7.5, hB: 8.5 },
    ];

    const pylonMat = this.addMat(new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.45, metalness: 0.65 }));
    const cableMat = this.addMat(
      new THREE.MeshStandardMaterial({
        color: '#22d3ee',
        emissive: '#0ea5e9',
        emissiveIntensity: 0.85,
        roughness: 0.25,
      }),
    );
    const orbMat = this.addMat(new THREE.MeshBasicMaterial({ color: '#fef08a' }));
    const orbGeo = this.addGeo(new THREE.SphereGeometry(0.32, 8, 6));
    const unitCyl = this.addGeo(new THREE.CylinderGeometry(0.18, 0.24, 1, 8));
    const cableCyl = this.addGeo(new THREE.CylinderGeometry(0.08, 0.08, 1, 6));

    const up = new THREE.Vector3(0, 1, 0);

    for (const p of pairs) {
      const groundA = terrain.getHeightAt(p.ax, p.az);
      const groundB = terrain.getHeightAt(p.bx, p.bz);
      const start: Vec3Like = { x: p.ax, y: groundA + p.hA, z: p.az };
      const end: Vec3Like = { x: p.bx, y: groundB + p.hB, z: p.bz };

      const zEntity: ZiplineEntity = {
        id: p.id,
        start,
        end,
        speed: 26.0,
      };
      this.ziplines.push(zEntity);

      // Build start & end steel pylons
      for (const [gx, gy, gz, h] of [
        [p.ax, groundA, p.az, p.hA],
        [p.bx, groundB, p.bz, p.hB],
      ] as Array<[number, number, number, number]>) {
        const post = new THREE.Mesh(unitCyl, pylonMat);
        post.scale.set(1, h, 1);
        post.position.set(gx, gy + h * 0.5, gz);
        post.castShadow = true;
        this.group.add(post);

        const cap = new THREE.Mesh(orbGeo, cableMat);
        cap.position.set(gx, gy + h, gz);
        this.group.add(cap);
      }

      // Tensioned glowing energy cable between start & end
      const vStart = new THREE.Vector3(start.x, start.y, start.z);
      const vEnd = new THREE.Vector3(end.x, end.y, end.z);
      const dir = new THREE.Vector3().subVectors(vEnd, vStart);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(vStart, vEnd).multiplyScalar(0.5);

      const cable = new THREE.Mesh(cableCyl, cableMat);
      cable.position.copy(mid);
      cable.scale.set(1, len, 1);
      cable.quaternion.setFromUnitVectors(up, dir.normalize());
      this.group.add(cable);

      // Animated pulse orbs riding along the zipline
      for (const offset of [0.15, 0.65]) {
        const orb = new THREE.Mesh(orbGeo, orbMat);
        this.group.add(orb);
        this.ziplineOrbs.push({ mesh: orb, zipline: zEntity, t: offset });
      }
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  getLaunchPads(): LaunchPadEntity[] {
    return this.launchPads;
  }

  getZiplines(): ZiplineEntity[] {
    return this.ziplines;
  }

  update(dt: number, elapsed: number): void {
    for (let i = 0; i < this.padVisuals.length; i++) {
      const pv = this.padVisuals[i];
      pv.spinner.rotation.y += dt * (pv.data.kind === 'launch_pad' ? 2.4 : 1.8);
      const phase = (elapsed * 1.4 + i * 0.31) % 1;
      pv.pulseRing.position.y = pv.baseY + phase * (pv.data.kind === 'launch_pad' ? 1.4 : 2.6);
      const scale = 1.0 + phase * 0.4;
      pv.pulseRing.scale.set(scale, scale, scale);
    }

    for (let i = 0; i < this.ziplineOrbs.length; i++) {
      const o = this.ziplineOrbs[i];
      o.t = (o.t + dt * 0.22) % 1;
      const s = o.zipline.start;
      const e = o.zipline.end;
      o.mesh.position.set(
        s.x + (e.x - s.x) * o.t,
        s.y + (e.y - s.y) * o.t,
        s.z + (e.z - s.z) * o.t,
      );
    }
  }

  dispose(): void {
    this.group.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.padVisuals = [];
    this.ziplineOrbs = [];
    this.launchPads = [];
    this.ziplines = [];
  }
}
