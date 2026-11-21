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
          float angle = vUv.x * 6.2831853 * 10.0;
          float heightWave = vUv.y * 18.0;

          float swirl1 = sin(angle + heightWave - uTime * 2.4);
          float swirl2 = cos(angle * 1.5 - heightWave * 0.8 + uTime * 1.9);
          float bands = 0.5 + 0.5 * (swirl1 * 0.55 + swirl2 * 0.45);

          // Hexagonal / electric grid sparkle
          float grid = smoothstep(0.72, 0.98, abs(sin(angle * 2.0 + uTime)) * abs(cos(heightWave * 2.0 - uTime * 1.5)));

          vec3 basePurple = vec3(0.45, 0.08, 0.82);
          vec3 brightMagenta = vec3(0.86, 0.28, 0.98);
          vec3 col = mix(basePurple, brightMagenta, bands * 0.75 + grid * 0.35);

          // Stronger glowing ground rim, softer fade toward top
          float groundRim = 1.0 - smoothstep(0.0, 0.16, vUv.y);
          float topFade = 1.0 - smoothstep(0.78, 1.0, vUv.y);
          float alpha = (0.24 + bands * 0.14 + groundRim * 0.28 + grid * 0.12) * topFade;

          gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.72));
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
