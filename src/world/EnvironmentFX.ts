import * as THREE from 'three';
import { ISLAND_RADIUS, WATER_LEVEL, mulberry32 } from '../core';
import type { Vec3Like } from '../types';

interface CloudEntry {
  group: THREE.Group;
  speed: number;
  baseY: number;
  phase: number;
}

export class EnvironmentFX {
  private group = new THREE.Group();
  private skyMesh: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private oceanMesh: THREE.Mesh;
  private oceanMat: THREE.ShaderMaterial;
  private clouds: CloudEntry[] = [];
  private busGroup: THREE.Group;
  private thrusterFlames: THREE.Mesh[] = [];
  private burnerGlow: THREE.Mesh;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor(seed = 4201) {
    this.group.name = 'EnvironmentFX';

    // 1. Stylized Gradient Sky Dome + Sun Disc
    const skyGeo = new THREE.SphereGeometry(1400, 32, 20);
    this.geometries.push(skyGeo);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.55, 0.52, -0.65).normalize() },
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
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, -0.2, 1.0);
          vec3 zenith = vec3(0.08, 0.42, 0.88);
          vec3 midSky = vec3(0.28, 0.72, 0.98);
          vec3 horizon = vec3(0.76, 0.93, 1.0);
          vec3 below = vec3(0.10, 0.36, 0.62);

          vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.35, h));
          col = mix(col, zenith, smoothstep(0.28, 0.95, h));
          if (h < 0.0) {
            col = mix(horizon, below, smoothstep(0.0, -0.2, h));
          }

          float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.90, 0.62) * pow(sunDot, 10.0) * 0.32;
          col += vec3(1.0, 0.97, 0.85) * smoothstep(0.9965, 0.9992, sunDot) * 1.1;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.materials.push(this.skyMat);
    this.skyMesh = new THREE.Mesh(skyGeo, this.skyMat);
    this.skyMesh.name = 'SkyDome';
    this.group.add(this.skyMesh);

    // 2. Animated Shimmering Turquoise Ocean Plane (circular with smooth horizon blend)
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
          // Also brighten Crystal Basin lake waters
          float basinDist = length(vWorldPos.xz - vec2(25.0, -115.0));
          float basinMix = 1.0 - smoothstep(42.0, 68.0, basinDist);
          float coastal = clamp(max(shallowMix, basinMix), 0.0, 1.0);

          vec3 deepBlue = vec3(0.05, 0.34, 0.68);
          vec3 turquoise = vec3(0.11, 0.75, 0.85);
          vec3 col = mix(deepBlue, turquoise, coastal);

          // Shimmering wave highlights
          float rippleA = sin(vWorldPos.x * 0.28 + vWorldPos.z * 0.22 + uTime * 2.1);
          float rippleB = cos(vWorldPos.x * 0.19 - vWorldPos.z * 0.31 + uTime * 1.7);
          float glint = smoothstep(0.62, 0.98, (rippleA + rippleB) * 0.5);
          col += vec3(0.55, 0.88, 0.96) * glint * 0.18 * (1.0 - smoothstep(420.0, 900.0, r));

          // Subtle foam ring near coastline
          float coastRing = smoothstep(14.0, 0.0, abs(r - uIslandRadius));
          float foamWave = 0.5 + 0.5 * sin(r * 0.4 - uTime * 2.4);
          col = mix(col, vec3(0.86, 0.97, 1.0), coastRing * foamWave * 0.22);

          // Smooth atmospheric horizon blend so ocean melts seamlessly into sky
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

    // 3. 42 Drifting Low-Poly Stylized Clouds
    this.buildClouds(seed);

    // 4. Iconic Battle Bus 3D Group
    const { busGroup, thrusterFlames, burnerGlow } = this.buildBattleBus();
    this.busGroup = busGroup;
    this.thrusterFlames = thrusterFlames;
    this.burnerGlow = burnerGlow;
    this.busGroup.visible = false;
    this.group.add(this.busGroup);
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

  update(dt: number, elapsed: number): void {
    this.skyMat.uniforms.uTime.value = elapsed;
    this.oceanMat.uniforms.uTime.value = elapsed;

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
  }

  dispose(): void {
    this.group.clear();
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    for (const m of this.materials) m.dispose();
    this.materials = [];
    this.clouds = [];
    this.thrusterFlames = [];
  }
}
