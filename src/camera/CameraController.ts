import * as THREE from 'three'
import type { Vehicle } from '../vehicle/Vehicle'

/** chase = daleko zezadu · near = blíž zezadu · hood = Forza kapota */
type CamMode = 'chase' | 'near' | 'hood'

const MODE_ORDER: CamMode[] = ['chase', 'near', 'hood']

/**
 * Kamera ve stylu Forza / NFS — chase + hood na kapotě.
 */
export class CameraController {
  private readonly camera: THREE.PerspectiveCamera
  private readonly look = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly lookSmooth = new THREE.Vector3()
  private readonly hoodLocal = new THREE.Vector3()
  private readonly hoodLookLocal = new THREE.Vector3()
  /** Rychlost sledování pozice (vyšší = těsnější). */
  followRate = 8
  private mode: CamMode = 'chase'
  private shake = 0

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  get modeLabel(): string {
    if (this.mode === 'hood') return 'Kapota'
    if (this.mode === 'near') return 'Blízko'
    return 'Daleko'
  }

  cycleMode(): void {
    const i = MODE_ORDER.indexOf(this.mode)
    this.mode = MODE_ORDER[(i + 1) % MODE_ORDER.length]!
  }

  /** Impuls otřesu (náraz / boost). */
  addShake(amount: number): void {
    this.shake = Math.min(1.2, this.shake + amount)
  }

  update(dt: number, vehicle: Vehicle): void {
    const p = vehicle.physics
    const forwardX = Math.sin(p.heading)
    const forwardZ = Math.cos(p.heading)
    const y = vehicle.groundY
    const speed = Math.abs(p.speed)
    const speed01 = Math.min(1, speed / 55)

    let baseFov: number

    if (this.mode === 'hood') {
      // Forza Hood: přímo na kapotě, kouká rovně po trati (FOV ~80)
      const { hoodZ, hoodY } = vehicle.hoodCam
      vehicle.mesh.updateMatrixWorld(true)
      this.hoodLocal.set(0, hoodY, hoodZ)
      this.hoodLocal.applyMatrix4(vehicle.mesh.matrixWorld)
      this.desired.copy(this.hoodLocal)
      // Look rovně dopředu, mírně pod horizont — pocit rychlosti
      this.hoodLookLocal.set(0, hoodY - 0.15, hoodZ + 22 + speed01 * 6)
      this.hoodLookLocal.applyMatrix4(vehicle.mesh.matrixWorld)
      this.look.copy(this.hoodLookLocal)
      baseFov = 78
    } else {
      const near = this.mode === 'near'
      const back = near ? 6.4 + speed01 * 1.9 : 11.5 + speed01 * 3.5
      const height = near ? 3.25 + speed01 * 0.78 : 5.8 + speed01 * 1.4
      const lookAhead = near ? 7.5 + speed01 * 4.2 : 10 + speed01 * 6
      const lookY = y + 0.85 + speed01 * 0.4
      baseFov = near ? 56 : 52
      this.desired.set(p.x - forwardX * back, y + height, p.z - forwardZ * back)
      this.look.set(p.x + forwardX * lookAhead, lookY, p.z + forwardZ * lookAhead)
    }

    const fovBoost = this.mode === 'hood' ? 8 : 10
    const targetFov = baseFov + speed01 * fovBoost
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4)
    this.camera.updateProjectionMatrix()

    // Hood = skoro locknutá na auto (Forza); chase má followRate z nastavení
    const posRate =
      this.mode === 'hood' ? this.followRate * 3.2 : this.mode === 'near' ? this.followRate * 1.25 : this.followRate
    const lerp = 1 - Math.exp(-posRate * dt)
    this.camera.position.x += (this.desired.x - this.camera.position.x) * lerp
    this.camera.position.z += (this.desired.z - this.camera.position.z) * lerp
    this.camera.position.y += (this.desired.y - this.camera.position.y) * Math.min(1, lerp * 1.35)

    const lookLerp = 1 - Math.exp(-(posRate * (this.mode === 'hood' ? 1.1 : 0.85)) * dt)
    this.lookSmooth.lerp(this.look, lookLerp)

    if (this.shake > 0.001) {
      const s = this.shake * this.shake
      const amp = this.mode === 'hood' ? 0.18 : 0.35
      this.camera.position.x += (Math.random() - 0.5) * s * amp
      this.camera.position.y += (Math.random() - 0.5) * s * amp * 0.55
      this.shake = Math.max(0, this.shake - dt * 2.8)
    }

    this.camera.lookAt(this.lookSmooth)
  }
}
