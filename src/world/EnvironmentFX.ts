import * as THREE from 'three';
import { ISLAND_RADIUS, WATER_LEVEL, mulberry32 } from '../core';
import type { Vec3Like } from '../types';

interface CloudEntry {
  group: THREE.Group;
  speed: number;
  baseY: number;
  phase: number;
}

interface DistantIsland {
  group: THREE.Group;
}

interface AmbientParticle {
  vx: number;
  vy: number;
  vz: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}

export class EnvironmentFX {
  private group = new THREE.Group();
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private oceanMesh: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;
  private clouds: CloudEntry[] = [];
  private distantIslands: DistantIsland[] = [];
  private busGroup: THREE.Group;
  private thrusterFlames: THREE.Mesh[] = [];
  private burnerGlow: THREE.Mesh;

  private ambientPoints: THREE.Points;
  private ambientGeo: THREE.BufferGeometry;
  private ambientMat: THREE.PointsMaterial;
  private ambientParticles: AmbientParticle[] = [];
  private sunDir = new THREE.Vector3(0.55, 0.52, -0.65).normalize();

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(seed = 4201) {
    this.group.name = 'EnvironmentFX';

    // 1. Stylized Gradient Sky Dome + Sun Disc with dynamic Time-of-Day uniforms
    const skyGeo = new THREE.SphereGeometry(1400, 32, 20);
    this.geometries.push(skyGeo);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDayPhase: { value: 0 },
        uSunDir: { value: this.sunDir.clone() },
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunDir;
        uniform float uDayPhase;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, -0.2, 1.0);
          vec3 zenithDay = vec3(0.08, 0.42, 0.88);
          vec3 zenithGold = vec3(0.14, 0.34, 0.72);
          vec3 zenith = mix(zenithDay, zenithGold, uDayPhase);

          vec3 midDay = vec3(0.28, 0.72, 0.98);
          vec3 midGold = vec3(0.45, 0.64, 0.92);
          vec3 midSky = mix(midDay, midGold, uDayPhase);

          vec3 horDay = vec3(0.76, 0.93, 1.0);
          vec3 horGold = vec3(0.98, 0.82, 0.66);
          vec3 horizon = mix(horDay, horGold, uDayPhase);

          vec3 below = vec3(0.10, 0.36, 0.62);

          vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.35, h));
          col = mix(col, zenith, smoothstep(0.28, 0.95, h));
          if (h < 0.0) {
            col = mix(horizon, below, smoothstep(0.0, -0.2, h));
          }

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.88, 0.58) * pow(sunDot, 10.0) * (0.32 + uDayPhase * 0.16);
          col += vec3(1.0, 0.97, 0.85) * smoothstep(0.9965, 0.9992, sunDot) * 1.1;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.materials.push(this.skyMat);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyMesh.name = 'SkyDome';
    this.group.add(this.skyMesh);

    // 2. Animated Shimmering Turquoise Ocean Plane (circular with smooth horizon blend + river glow)
    const oceanGeo = new THREE.CircleGeometry(2200, 96);
    oceanGeo.rotateX(-Math.PI * 0.5);
    this.geometries.push(oceanGeo);

    this.oceanMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uIslandRadius: { value: ISLAND_RADIUS },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        void main() {
          vec3 p = position;
          float wave = sin(p.x * 0.045 + uTime * 1.35) * 0.06 + cos(p.z * 0.055 + uTime * 1.1) * 0.05;
          p.y += wave;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uIslandRadius;
        varying vec3 vWorldPos;
        void main() {
          float r = length(vWorldPos.xz);
          float shallowMix = 1.0 - smoothstep(uIslandRadius - 25.0, uIslandRadius + 95.0, r);
          // Crystal Basin & interior River Gorge turquoise shallows
          float basinDist = length(vWorldPos.xz - vec2(25.0, -115.0));
          float basinMix = 1.0 - smoothstep(42.0, 68.0, basinDist);
          float insideIsland = 1.0 - smoothstep(uIslandRadius - 20.0, uIslandRadius + 10.0, r);
          float coastal = clamp(max(max(shallowMix, basinMix), insideIsland), 0.0, 1.0);

          vec3 deepBlue = vec3(0.05, 0.34, 0.68);
          vec3 turquoise = vec3(0.11, 0.75, 0.85);
          vec3 col = mix(deepBlue, turquoise, coastal);

          float rippleA = sin(vWorldPos.x * 0.28 + vWorldPos.z * 0.22 + uTime * 2.1);
          float rippleB = cos(vWorldPos.x * 0.19 - vWorldPos.z * 0.31 + uTime * 1.7);
          float glint = smoothstep(0.62, 0.98, (rippleA + rippleB) * 0.5);
          col += vec3(0.55, 0.88, 0.96) * glint * 0.18 * (1.0 - smoothstep(420.0, 900.0, r));

          float coastRing = smoothstep(14.0, 0.0, abs(r - uIslandRadius));
          float foamWave = 0.5 + 0.5 * sin(r * 0.4 - uTime * 2.4);
          col = mix(col, vec3(0.86, 0.97, 1.0), coastRing * foamWave * 0.22);

          float horizonFog = smoothstep(520.0, 1550.0, r);
          vec3 skyHorizon = vec3(0.76, 0.93, 1.0);
          col = mix(col, skyHorizon, horizonFog * 0.92);
          float edgeAlpha = mix(0.88, 0.0, smoothstep(1700.0, 2180.0, r));

          gl_FragColor = vec4(col, edgeAlpha);
        }
      `,
    });
    this.materials.push(this.oceanMat);
    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMat);
    this.oceanMesh.position.y = WATER_LEVEL - 0.03;
    this.oceanMesh.name = 'OceanWater';
    this.group.add(this.oceanMesh);

    // 3. Distant Stylized Archipelago Islands beyond horizon
    this.buildDistantArchipelago(seed);

    // 4. 42 Drifting Low-Poly Stylized Clouds
    this.buildClouds(seed);

    // 5. Biome Ambient Particle Pool (snow, embers, dust, fireflies, pollen)
    const pCount = 120;
    const pPositions = new Float32Array(pCount * 3);
    const rand = mulberry32(seed + 1414);
    for (let i = 0; i < pCount; i++) {
      const ox = (rand() - 0.5) * 44;
      const oy = rand() * 14;
      const oz = (rand() - 0.5) * 44;
      pPositions[i * 3] = ox;
      pPositions[i * 3 + 1] = oy;
      pPositions[i * 3 + 2] = oz;
      this.ambientParticles.push({
        vx: (rand() - 0.5) * 1.4,
        vy: -0.6 - rand() * 1.2,
        vz: (rand() - 0.5) * 1.4,
        offsetX: ox,
        offsetY: oy,
        offsetZ: oz,
      });
    }
    this.ambientGeo = new THREE.BufferGeometry();
    this.ambientGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
    this.ambientMat = new THREE.PointsMaterial({
      color: '#ffffff',
      size: 0.28,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
    });
    this.geometries.push(this.ambientGeo);
    this.materials.push(this.ambientMat);
    this.ambientPoints = new THREE.Points(this.ambientGeo, this.ambientMat);
    this.ambientPoints.frustumCulled = false;
    this.group.add(this.ambientPoints);

    // 6. Iconic Battle Bus 3D Group
    const { busGroup, thrusterFlames, burnerGlow } = this.buildBattleBus();
    this.busGroup = busGroup;
    this.thrusterFlames = thrusterFlames;
    this.burnerGlow = burnerGlow;
    this.busGroup.visible = false;
    this.group.add(this.busGroup);
  }

  private buildDistantArchipelago(seed: number): void {
    const rand = mulberry32(seed + 1919);
    const mtnGeo = new THREE.DodecahedronGeometry(1, 1);
    const baseGeo = new THREE.CylinderGeometry(0.95, 1.2, 0.35, 12);
    const mtnMat = new THREE.MeshStandardMaterial({
      color: '#4f7a68',
      roughness: 0.92,
      metalness: 0.02,
    });
    const snowMtnMat = new THREE.MeshStandardMaterial({
      color: '#d8e4f0',
      roughness: 0.88,
    });
    this.geometries.push(mtnGeo, baseGeo);
    this.materials.push(mtnMat, snowMtnMat);

    const islandCount = 12;
    for (let i = 0; i < islandCount; i++) {
      const a = (i / islandCount) * Math.PI * 2 + (rand() - 0.5) * 0.25;
      const dist = 590 + rand() * 320;
      const ix = Math.cos(a) * dist;
      const iz = Math.sin(a) * dist;
      const rad = 52 + rand() * 55;
      const h = 22 + rand() * 30;

      const dg = new THREE.Group();
      dg.name = 'DistantIsland';
      dg.position.set(ix, -1.0, iz);

      const shelf = new THREE.Mesh(baseGeo, mtnMat);
      shelf.scale.set(rad * 1.35, 16, rad * 1.25);
      shelf.position.y = 3;
      dg.add(shelf);

      const mainHill = new THREE.Mesh(mtnGeo, i % 3 === 0 ? snowMtnMat : mtnMat);
      mainHill.scale.set(rad * 0.85, h, rad * 0.75);
      mainHill.position.y = h * 0.38;
      dg.add(mainHill);

      const sideHill = new THREE.Mesh(mtnGeo, mtnMat);
      sideHill.scale.set(rad * 0.6, h * 0.65, rad * 0.55);
      sideHill.position.set(rad * 0.45, h * 0.24, rad * 0.22);
      dg.add(sideHill);

      this.group.add(dg);
      this.distantIslands.push({ group: dg });
    }
  }

  private buildClouds(seed: number): void {
    const rand = mulberry32(seed + 515);
    const puffGeo = new THREE.DodecahedronGeometry(1, 0);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#e0f2fe',
      emissiveIntensity: 0.22,
      roughness: 0.95,
      metalness: 0.0,
    });
    this.geometries.push(puffGeo);
    this.materials.push(cloudMat);

    const cloudCount = 42;
    for (let i = 0; i < cloudCount; i++) {
      const cg = new THREE.Group();
      cg.name = 'CloudGroup';
      const baseY = 148 + rand() * 68;
      cg.position.set(
        (rand() - 0.5) * 1050,
        baseY,
        (rand() - 0.5) * 1050,
      );

      const puffCount = 3 + Math.floor(rand() * 3);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        const s = 5.5 + rand() * 7.5;
        puff.scale.set(s * 1.4, s * 0.68, s * 1.05);
        puff.position.set(
          (p - puffCount * 0.5) * 7.5 + (rand() - 0.5) * 3.0,
          (rand() - 0.5) * 1.8,
          (rand() - 0.5) * 5.0,
        );
        cg.add(puff);
      }

      this.group.add(cg);
      this.clouds.push({
        group: cg,
        speed: 2.2 + rand() * 3.6,
        baseY,
        phase: rand() * Math.PI * 2,
      });
    }
  }

  private buildBattleBus(): {
    busGroup: THREE.Group;
    thrusterFlames: THREE.Mesh[];
    burnerGlow: THREE.Mesh;
  } {
    const busGroup = new THREE.Group();
    busGroup.name = 'BattleBus';

    const royalBlue = new THREE.MeshStandardMaterial({
      color: '#2563eb',
      emissive: '#1e40af',
      emissiveIntensity: 0.32,
      roughness: 0.38,
      metalness: 0.25,
    });
    const stripeYellow = new THREE.MeshStandardMaterial({
      color: '#facc15',
      emissive: '#ca8a04',
      emissiveIntensity: 0.28,
      roughness: 0.4,
      metalness: 0.2,
    });
    const purpleMat = new THREE.MeshStandardMaterial({
      color: '#8b5cf6',
      emissive: '#5b21b6',
      emissiveIntensity: 0.28,
      roughness: 0.45,
      metalness: 0.2,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#38bdf8',
      emissive: '#0284c7',
      emissiveIntensity: 0.35,
      roughness: 0.15,
      metalness: 0.6,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      roughness: 0.9,
    });
    const metalMat = new THREE.MeshStandardMaterial({
      color: '#cbd5e1',
      roughness: 0.35,
      metalness: 0.75,
    });
    const flameMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.88,
    });
    const burnerMat = new THREE.MeshBasicMaterial({
      color: '#fb923c',
      transparent: true,
      opacity: 0.9,
    });

    this.materials.push(
      royalBlue,
      stripeYellow,
      purpleMat,
      glassMat,
      tireMat,
      metalMat,
      flameMat,
      burnerMat,
    );

    const addGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      this.geometries.push(g);
      return g;
    };

    // Bus body (facing +Z)
    const hull = new THREE.Mesh(addGeo(new THREE.BoxGeometry(3.2, 2.7, 9.2)), royalBlue);
    hull.position.set(0, 1.8, -0.3);
    hull.castShadow = true;
    busGroup.add(hull);

    // Front engine hood
    const hood = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.9, 1.65, 2.2)), royalBlue);
    hood.position.set(0, 1.28, 5.1);
    hood.castShadow = true;
    busGroup.add(hood);

    // Yellow side trim stripe
    const stripe = new THREE.Mesh(addGeo(new THREE.BoxGeometry(3.26, 0.34, 9.24)), stripeYellow);
    stripe.position.set(0, 1.4, -0.3);
    busGroup.add(stripe);

    // Front windshield & side windows
    const windshield = new THREE.Mesh(addGeo(new THREE.BoxGeometry(2.7, 1.0, 0.14)), glassMat);
    windshield.position.set(0, 2.5, 4.32);
    busGroup.add(windshield);

    const sideWin = new THREE.Mesh(addGeo(new THREE.BoxGeometry(3.25, 0.88, 7.2)), glassMat);
    sideWin.position.set(0, 2.38, -0.2);
    busGroup.add(sideWin);

    // Glowing headlights
    const headlightGeo = addGeo(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 10));
    headlightGeo.rotateX(Math.PI * 0.5);
    for (const hx of [-0.95, 0.95]) {
      const hl = new THREE.Mesh(headlightGeo, flameMat);
      hl.position.set(hx, 1.15, 6.22);
      busGroup.add(hl);
    }

    // 4 chunky wheels
    const wheelGeo = addGeo(new THREE.CylinderGeometry(0.68, 0.68, 0.48, 14));
    wheelGeo.rotateZ(Math.PI * 0.5);
    for (const wx of [-1.62, 1.62]) {
      for (const wz of [-2.8, 3.4]) {
        const wheel = new THREE.Mesh(wheelGeo, tireMat);
        wheel.position.set(wx, 0.68, wz);
        busGroup.add(wheel);
      }
    }

    // Giant Hot-Air Balloon above the bus
    const balloonGroup = new THREE.Group();
    balloonGroup.position.set(0, 11.2, -0.3);

    const balloonMain = new THREE.Mesh(addGeo(new THREE.SphereGeometry(5.2, 20, 14)), royalBlue);
    balloonMain.scale.set(1.0, 1.18, 1.05);
    balloonMain.castShadow = true;
    balloonGroup.add(balloonMain);

    const eqStripe = new THREE.Mesh(
      addGeo(new THREE.CylinderGeometry(5.28, 5.28, 1.25, 20)),
      stripeYellow,
    );
    balloonGroup.add(eqStripe);

    const topCap = new THREE.Mesh(
      addGeo(new THREE.CylinderGeometry(3.1, 4.4, 1.5, 18)),
      purpleMat,
    );
    topCap.position.y = 4.2;
    balloonGroup.add(topCap);

    // Basket ring + burner flame
    const neckRing = new THREE.Mesh(
      addGeo(new THREE.CylinderGeometry(1.75, 1.35, 1.2, 14)),
      metalMat,
    );
    neckRing.position.y = -5.6;
    balloonGroup.add(neckRing);

    const burnerGlow = new THREE.Mesh(addGeo(new THREE.ConeGeometry(0.95, 2.2, 10)), burnerMat);
    burnerGlow.position.set(0, -6.5, 0);
    balloonGroup.add(burnerGlow);

    // Suspension cables connecting bus roof to balloon
    const cableGeo = addGeo(new THREE.CylinderGeometry(0.06, 0.06, 8.2, 6));
    for (const [cx, cz] of [
      [-1.3, -3.2],
      [1.3, -3.2],
      [-1.3, 2.6],
      [1.3, 2.6],
    ]) {
      const cable = new THREE.Mesh(cableGeo, metalMat);
      cable.position.set(cx, -4.0, cz);
      balloonGroup.add(cable);
    }

    busGroup.add(balloonGroup);

    // Rear dual booster pods + glowing cyan thruster flames (facing -Z)
    const podGeo = addGeo(new THREE.CylinderGeometry(0.45, 0.58, 1.4, 12));
    podGeo.rotateX(Math.PI * 0.5);
    const flameGeo = addGeo(new THREE.ConeGeometry(0.46, 3.2, 12));
    flameGeo.rotateX(-Math.PI * 0.5);

    const thrusterFlames: THREE.Mesh[] = [];
    for (const px of [-0.9, 0.9]) {
      const pod = new THREE.Mesh(podGeo, metalMat);
      pod.position.set(px, 1.35, -5.2);
      busGroup.add(pod);

      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(px, 1.35, -7.2);
      busGroup.add(flame);
      thrusterFlames.push(flame);
    }

    return { busGroup, thrusterFlames, burnerGlow };
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  setBusTransform(pos: Vec3Like, yaw: number, active: boolean): void {
    this.busGroup.visible = active;
    this.busGroup.position.set(pos.x, pos.y, pos.z);
    this.busGroup.rotation.y = yaw;
  }

  update(
    dt: number,
    elapsed: number,
    playerPos?: Vec3Like,
    biome?: string,
  ): void {
    this.skyMat.uniforms.uTime.value = elapsed;
    this.oceanMat.uniforms.uTime.value = elapsed;

    // Gentle Time-of-Day cycle across 6 minutes (bright sunlit morning -> golden afternoon)
    const dayPhase = 0.5 - 0.5 * Math.cos(elapsed * 0.018);
    this.skyMat.uniforms.uDayPhase.value = dayPhase * 0.65;
    this.sunDir.set(
      0.55 - dayPhase * 0.25,
      0.52 - dayPhase * 0.14,
      -0.65 + dayPhase * 0.2,
    ).normalize();
    (this.skyMat.uniforms.uSunDir.value as THREE.Vector3).copy(this.sunDir);

    // Drift clouds gently across sky and wrap
    const wrapLimit = 560;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.group.position.x += c.speed * dt;
      if (c.group.position.x > wrapLimit) {
        c.group.position.x = -wrapLimit;
      }
      c.group.position.y = c.baseY + Math.sin(elapsed * 0.35 + c.phase) * 1.4;
    }

    // Battle Bus thruster flicker & slight bob
    if (this.busGroup.visible) {
      const pulse = 0.85 + Math.sin(elapsed * 26) * 0.22;
      for (const flame of this.thrusterFlames) {
        flame.scale.set(0.95 + Math.cos(elapsed * 22) * 0.08, 0.95, pulse);
      }
      this.burnerGlow.scale.set(1, 0.85 + Math.sin(elapsed * 18) * 0.2, 1);
    }

    // Camera/player-centered Biome Ambient Particle Pool
    if (playerPos && biome) {
      let targetOpacity = 0;
      let dirY = -1.5;
      if (biome === 'snow') {
        this.ambientMat.color.set('#ffffff');
        targetOpacity = 0.85;
        dirY = -2.2;
      } else if (biome === 'volcanic') {
        this.ambientMat.color.set('#fb923c');
        targetOpacity = 0.9;
        dirY = 2.4;
      } else if (biome === 'desert') {
        this.ambientMat.color.set('#fcd34d');
        targetOpacity = 0.55;
        dirY = 0.25;
      } else if (biome === 'cyber') {
        this.ambientMat.color.set('#22d3ee');
        targetOpacity = 0.8;
        dirY = 0.85;
      } else if (biome === 'forest') {
        this.ambientMat.color.set('#bef264');
        targetOpacity = 0.6;
        dirY = -0.65;
      }

      this.ambientMat.opacity += (targetOpacity - this.ambientMat.opacity) * Math.min(1, dt * 4);
      if (this.ambientMat.opacity > 0.02) {
        const attr = this.ambientGeo.getAttribute('position') as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < this.ambientParticles.length; i++) {
          const p = this.ambientParticles[i];
          p.offsetX += p.vx * dt;
          p.offsetY += dirY * dt;
          p.offsetZ += p.vz * dt;
          if (p.offsetY < -1) p.offsetY += 15;
          if (p.offsetY > 14) p.offsetY -= 15;
          if (p.offsetX > 22) p.offsetX -= 44;
          if (p.offsetX < -22) p.offsetX += 44;
          if (p.offsetZ > 22) p.offsetZ -= 44;
          if (p.offsetZ < -22) p.offsetZ += 44;

          arr[i * 3] = playerPos.x + p.offsetX;
          arr[i * 3 + 1] = playerPos.y + p.offsetY;
          arr[i * 3 + 2] = playerPos.z + p.offsetZ;
        }
        attr.needsUpdate = true;
      }
    }
  }

  getSunDirection(): Vec3Like {
    return { x: this.sunDir.x, y: this.sunDir.y, z: this.sunDir.z };
  }

  dispose(): void {
    this.group.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.clouds = [];
    this.distantIslands = [];
    this.ambientParticles = [];
    this.thrusterFlames = [];
  }
}
