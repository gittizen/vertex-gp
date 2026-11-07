import * as THREE from 'three'
import type { VehicleKind } from '../track/TrackDefs'
import { createVehicleMesh } from './VehicleMeshes'
import { VehiclePhysics, type VehicleControls, type VehicleTuning } from './VehiclePhysics'
import type { Track } from '../track/Track'

export type DriverInfo = {
  id: string
  name: string
  team: string
  color: number
  isPlayer: boolean
}

export class Vehicle {
  mesh: THREE.Group
  readonly physics: VehiclePhysics
  readonly info: DriverInfo
  kind: VehicleKind = 'formula'
  lap = 0
  checkpoint = 0
  raceDistance = 0
  finished = false
  finishTime = 0
  bestLapMs = Infinity
  currentLapStart = 0
  armedForLap = false
  /** Cache progress pro rychlý constrain / AI */
  trackT = 0

  constructor(info: DriverInfo, tuning?: Partial<VehicleTuning>, kind: VehicleKind = 'formula') {
    this.info = info
    this.physics = new VehiclePhysics(tuning)
    this.kind = kind
    this.mesh = createVehicleMesh(kind, info.color)
  }

  setKind(kind: VehicleKind, scene?: THREE.Scene): void {
    if (this.kind === kind) {
      this.setColor(this.info.color)
      return
    }
    const parent = this.mesh.parent
    parent?.remove(this.mesh)
    disposeGroup(this.mesh)
    this.kind = kind
    this.mesh = createVehicleMesh(kind, this.info.color)
    if (parent) parent.add(this.mesh)
    else scene?.add(this.mesh)
  }

  reset(x: number, z: number, heading: number, raceTimeMs: number): void {
    this.physics.reset(x, z, heading)
    this.lap = 0
    this.checkpoint = 0
    this.raceDistance = 0
    this.finished = false
    this.finishTime = 0
    this.bestLapMs = Infinity
    this.currentLapStart = raceTimeMs
    this.armedForLap = false
    this.trackT = 0
    this.syncMesh()
  }

  update(dt: number, controls: VehicleControls, track: Track): void {
    if (this.finished) {
      this.physics.speed *= Math.exp(-2 * dt)
      this.physics.latVel *= Math.exp(-3 * dt)
      this.syncMesh()
      return
    }

    this.physics.surfaceGrip = track.def.surfaceGrip
    this.physics.update(dt, controls)
    const hit = track.constrain(this.physics.x, this.physics.z, this.trackT)
    this.physics.x = hit.x
    this.physics.z = hit.z
    this.trackT = hit.t
    if (hit.hit) {
      this.physics.speed *= this.kind === 'rally' ? 0.88 : 0.82
      this.physics.latVel *= 0.35
      this.physics.angularVel *= 0.45
    }
    this.syncMesh()
  }

  syncMesh(): void {
    this.mesh.position.set(this.physics.x, 0.2, this.physics.z)
    this.mesh.rotation.y = this.physics.heading
    // Mírný náklon do smyku — méně „vektorové“
    const lean = clamp(this.physics.latVel * 0.04 + this.physics.angularVel * 0.08, -0.22, 0.22)
    this.mesh.rotation.z = -lean
  }

  setColor(color: number): void {
    this.info.color = color
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.bodyPaint) {
        const mat = obj.material
        if (
          mat instanceof THREE.MeshLambertMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshBasicMaterial
        ) {
          mat.color.setHex(color)
        }
      }
    })
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function disposeGroup(g: THREE.Group): void {
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}
