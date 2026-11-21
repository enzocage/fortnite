import * as THREE from 'three';
import {
  ISLAND_RADIUS,
  STORM_PHASES,
  WORLD_HALF,
  clamp,
  lerp,
  mulberry32,
} from '../core';
import type { StormState } from '../types';

export interface StormUpdateResult {
  phaseChanged: boolean;
  shrinkStarted: boolean;
}

export class StormSystem {
  private seed: number;
  private rand: () => number;

  private phase = 1;
  private currentCenterX = 0;
  private currentCenterZ = 0;
  private currentRadius = WORLD_HALF;

  private startCenterX = 0;
  private startCenterZ = 0;
  private startRadius = WORLD_HALF;

  private nextCenterX = 0;
  private nextCenterZ = 0;
  private nextRadius = STORM_PHASES[0].targetRadius;

  private isShrinking = false;
  private phaseTimeRemaining = STORM_PHASES[0].waitDuration;
  private phaseDuration = STORM_PHASES[0].waitDuration;
  private dps = STORM_PHASES[0].dps;
  private finished = false;
  private elapsed = 0;

  private mesh: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private geometry: THREE.CylinderGeometry;

  constructor(seed = 4201) {
    this.seed = seed;
    this.rand = mulberry32(seed + 909);

    this.geometry = new THREE.CylinderGeometry(1, 1, 260, 72, 1, true);
    this.material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vLocalPos;
        void main() {
          vUv = uv;
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vLocalPos;
        void main() {
          float theta = vUv.x * 6.2831853;

          // Swirling top-to-bottom storm wall plasma energy bands
          float swirlWarp = sin(vUv.y * 10.0 + uTime * 1.4) * 0.65;
          float bandA = sin(theta * 6.0 + vUv.y * 16.0 + uTime * 2.6 + swirlWarp);
          float bandB = cos(theta * 10.0 - vUv.y * 22.0 + uTime * 3.4);
          float bandC = sin(theta * 15.0 + vUv.y * 30.0 + uTime * 4.5);
          float plasmaBands = clamp(0.5 + 0.28 * bandA + 0.22 * bandB + 0.14 * bandC, 0.0, 1.0);

          // Vertical descending plasma rain / ion streaks
          float streakPhase = sin(theta * 46.0 + vUv.y * 28.0 + uTime * 7.2);
          float streaks = pow(max(0.0, streakPhase), 10.0) * 0.26;

          // Vertical flickering purple/white lightning filaments (seamless integer harmonics)
          float jitter1 = sin(vUv.y * 34.0 + uTime * 9.5) * 0.34 + sin(vUv.y * 74.0 - uTime * 15.0) * 0.18;
          float boltWave1 = cos(theta * 11.0 + jitter1 + sin(uTime * 1.9) * 0.45);
          float filament1 = pow(max(0.0, boltWave1), 44.0);
          float halo1 = pow(max(0.0, boltWave1), 11.0);

          float jitter2 = cos(vUv.y * 46.0 - uTime * 12.5) * 0.38 + sin(vUv.y * 92.0 + uTime * 18.0) * 0.20;
          float boltWave2 = cos(theta * 17.0 + jitter2 - cos(uTime * 2.3) * 0.4);
          float filament2 = pow(max(0.0, boltWave2), 54.0);
          float halo2 = pow(max(0.0, boltWave2), 14.0);

          // Regional lightning flicker strobes around cylinder circumference
          float sector1 = 0.5 + 0.5 * sin(theta * 3.0 + uTime * 4.8);
          float strobe1 = pow(0.5 + 0.5 * sin(uTime * 18.5 + theta * 5.0), 4.0) * smoothstep(0.32, 0.94, sector1);
          float sector2 = 0.5 + 0.5 * cos(theta * 4.0 - uTime * 5.6);
          float strobe2 = pow(0.5 + 0.5 * cos(uTime * 25.0 - theta * 7.0), 5.0) * smoothstep(0.38, 0.95, sector2);

          float lightningHalo = clamp(halo1 * strobe1 * 0.65 + halo2 * strobe2 * 0.72, 0.0, 1.0);
          float lightningCore = clamp(filament1 * strobe1 * 1.45 + filament2 * strobe2 * 1.75, 0.0, 1.0);

          vec3 deepStorm = vec3(0.30, 0.05, 0.64);
          vec3 plasmaViolet = vec3(0.76, 0.22, 0.98);
          vec3 electricLavender = vec3(0.86, 0.68, 1.0);
          vec3 boltWhite = vec3(0.98, 0.95, 1.0);

          vec3 col = mix(deepStorm, plasmaViolet, plasmaBands * 0.68 + streaks);
          col = mix(col, electricLavender, lightningHalo * 0.85);
          col = mix(col, boltWhite, lightningCore);

          // Stronger glowing ground rim, smooth fade toward top
          float groundRim = 1.0 - smoothstep(0.0, 0.14, vUv.y);
          float topFade = 1.0 - smoothstep(0.68, 1.0, vUv.y);
          float alpha = (0.16 + plasmaBands * 0.12 + groundRim * 0.24 + streaks * 0.14 + lightningHalo * 0.24 + lightningCore * 0.38) * topFade;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.68));
        }
      `,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'StormWall';
    this.mesh.frustumCulled = false;

    this.reset(seed);
  }

  private pickNextCenter(
    currX: number,
    currZ: number,
    currR: number,
    nextR: number,
  ): { x: number; z: number } {
    const maxShift = Math.max(0, currR - nextR);
    if (maxShift <= 0.5) {
      return { x: currX, z: currZ };
    }

    // Bias next zone inside dry land so late rings land on playable terrain
    const islandSafeLimit = ISLAND_RADIUS * 0.62;
    for (let attempt = 0; attempt < 24; attempt++) {
      const a = this.rand() * Math.PI * 2;
      const dist = Math.sqrt(this.rand()) * maxShift * 0.78;
      const nx = currX + Math.cos(a) * dist;
      const nz = currZ + Math.sin(a) * dist;
      if (Math.hypot(nx, nz) <= Math.max(islandSafeLimit, currR * 0.55)) {
        return { x: nx, z: nz };
      }
    }

    // Fallback: pull gently toward island center while obeying containment
    const pullLen = Math.hypot(currX, currZ);
    if (pullLen <= maxShift) return { x: 0, z: 0 };
    const ratio = maxShift * 0.75 / (pullLen || 1);
    return {
      x: currX - currX * ratio,
      z: currZ - currZ * ratio,
    };
  }

  private syncMeshTransform(): void {
    const r = Math.max(0.15, this.currentRadius);
    this.mesh.position.set(this.currentCenterX, 110, this.currentCenterZ);
    this.mesh.scale.set(r, 1, r);
    this.mesh.visible = !this.finished || this.currentRadius > 0.01;
  }

  reset(seed = this.seed): void {
    this.seed = seed;
    this.rand = mulberry32(seed + 909);

    const first = STORM_PHASES[0];
    this.phase = 1;
    this.currentCenterX = 0;
    this.currentCenterZ = 0;
    this.currentRadius = WORLD_HALF;
    this.startCenterX = 0;
    this.startCenterZ = 0;
    this.startRadius = WORLD_HALF;

    const nextC = this.pickNextCenter(0, 0, WORLD_HALF, first.targetRadius);
    this.nextCenterX = nextC.x;
    this.nextCenterZ = nextC.z;
    this.nextRadius = first.targetRadius;

    this.isShrinking = false;
    this.phaseDuration = first.waitDuration;
    this.phaseTimeRemaining = first.waitDuration;
    this.dps = first.dps;
    this.finished = false;
    this.elapsed = 0;

    this.syncMeshTransform();
  }

  update(dt: number): StormUpdateResult {
    if (dt <= 0) {
      return { phaseChanged: false, shrinkStarted: false };
    }

    this.elapsed += dt;
    this.material.uniforms.uTime.value = this.elapsed;

    if (this.finished) {
      return { phaseChanged: false, shrinkStarted: false };
    }

    let phaseChanged = false;
    let shrinkStarted = false;
    let remaining = dt;

    while (remaining > 1e-7 && !this.finished) {
      const cfg = STORM_PHASES[this.phase - 1];
      const step = Math.min(remaining, Math.max(0, this.phaseTimeRemaining));
      this.phaseTimeRemaining -= step;
      remaining -= step;

      if (!this.isShrinking) {
        if (this.phaseTimeRemaining <= 1e-7) {
          this.isShrinking = true;
          shrinkStarted = true;
          this.startCenterX = this.currentCenterX;
          this.startCenterZ = this.currentCenterZ;
          this.startRadius = this.currentRadius;
          this.phaseDuration = cfg.shrinkDuration;
          this.phaseTimeRemaining = cfg.shrinkDuration;
        }
      } else {
        const t =
          this.phaseDuration > 0
            ? clamp(1 - this.phaseTimeRemaining / this.phaseDuration, 0, 1)
            : 1;
        this.currentCenterX = lerp(this.startCenterX, this.nextCenterX, t);
        this.currentCenterZ = lerp(this.startCenterZ, this.nextCenterZ, t);
        this.currentRadius = lerp(this.startRadius, this.nextRadius, t);

        if (this.phaseTimeRemaining <= 1e-7) {
          this.currentCenterX = this.nextCenterX;
          this.currentCenterZ = this.nextCenterZ;
          this.currentRadius = this.nextRadius;

          if (this.phase < STORM_PHASES.length) {
            this.phase += 1;
            phaseChanged = true;
            const nextCfg = STORM_PHASES[this.phase - 1];
            const nextC = this.pickNextCenter(
              this.currentCenterX,
              this.currentCenterZ,
              this.currentRadius,
              nextCfg.targetRadius,
            );
            this.nextCenterX = nextC.x;
            this.nextCenterZ = nextC.z;
            this.nextRadius = nextCfg.targetRadius;
            this.isShrinking = false;
            this.phaseDuration = nextCfg.waitDuration;
            this.phaseTimeRemaining = nextCfg.waitDuration;
            this.dps = nextCfg.dps;
          } else {
            this.isShrinking = false;
            this.phaseTimeRemaining = 0;
            this.finished = true;
          }
        }
      }
    }

    this.syncMeshTransform();
    return { phaseChanged, shrinkStarted };
  }

  getState(): StormState {
    return {
      phase: this.phase,
      totalPhases: STORM_PHASES.length,
      currentCenterX: this.currentCenterX,
      currentCenterZ: this.currentCenterZ,
      currentRadius: this.currentRadius,
      nextCenterX: this.nextCenterX,
      nextCenterZ: this.nextCenterZ,
      nextRadius: this.nextRadius,
      isShrinking: this.isShrinking,
      phaseTimeRemaining: Math.max(0, this.phaseTimeRemaining),
      phaseDuration: this.phaseDuration,
      dps: this.dps,
    };
  }

  isInStorm(x: number, z: number): boolean {
    if (this.currentRadius <= 0) return true;
    return Math.hypot(x - this.currentCenterX, z - this.currentCenterZ) > this.currentRadius;
  }

  getMesh(): THREE.Mesh {
    return this.mesh;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
