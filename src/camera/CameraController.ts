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
  /** Mobilní oddálení (1 = PC, 1.5 = telefon). */
  distScale = 1
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
    const heading = Number.isFinite(p.heading) ? p.heading : 0
    const forwardX = Math.sin(heading)
    const forwardZ = Math.cos(heading)
    const y = Number.isFinite(vehicle.groundY) ? vehicle.groundY : 0
    const speed = Math.abs(Number.isFinite(p.speed) ? p.speed : 0)
    const speed01 = Math.min(1, speed / 72)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return

    let baseFov: number

    if (this.mode === 'hood') {
      const { hoodZ, hoodY } = vehicle.hoodCam
      vehicle.mesh.updateMatrixWorld(true)
      this.hoodLocal.set(0, hoodY, hoodZ)
      this.hoodLocal.applyMatrix4(vehicle.mesh.matrixWorld)
      this.desired.copy(this.hoodLocal)
      this.hoodLookLocal.set(0, hoodY - 0.12, hoodZ + 24 + speed01 * 8)
      this.hoodLookLocal.applyMatrix4(vehicle.mesh.matrixWorld)
      this.look.copy(this.hoodLookLocal)
      baseFov = 74
    } else {
      const near = this.mode === 'near'
      const fit = vehicle.camFit
      const d = Math.max(1, this.distScale)
      // Stejné vyplnění záběru jako street auto — škálování dle siluety (+ mobilní oddálení)
      const back =
        (near ? 5.6 + speed01 * 2.4 : 9.2 + speed01 * 4.2) * (fit.back || 1) * d
      const height =
        (near ? 2.55 + speed01 * 0.55 : 4.2 + speed01 * 1.05) * (fit.height || 1) * d
      const lookAhead = (near ? 8.5 + speed01 * 5 : 11 + speed01 * 7) * d
      const lookY = y + (fit.lookY || 0.72) * d + speed01 * 0.28
      baseFov = near ? 58 : 54
      this.desired.set(p.x - forwardX * back, y + height, p.z - forwardZ * back)
      this.look.set(p.x + forwardX * lookAhead, lookY, p.z + forwardZ * lookAhead)
    }

    const fovBoost = this.mode === 'hood' ? 10 : 14
    const targetFov = baseFov + speed01 * fovBoost
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 5)
    this.camera.updateProjectionMatrix()

    const posRate =
      this.mode === 'hood' ? this.followRate * 3.6 : this.mode === 'near' ? this.followRate * 1.45 : this.followRate * 1.15
    const lerp = 1 - Math.exp(-posRate * dt)
    this.camera.position.x += (this.desired.x - this.camera.position.x) * lerp
    this.camera.position.z += (this.desired.z - this.camera.position.z) * lerp
    this.camera.position.y += (this.desired.y - this.camera.position.y) * Math.min(1, lerp * 1.4)

    const lookLerp = 1 - Math.exp(-(posRate * (this.mode === 'hood' ? 1.2 : 0.95)) * dt)
    this.lookSmooth.lerp(this.look, lookLerp)

    if (this.shake > 0.001) {
      const s = this.shake * this.shake
      const amp = this.mode === 'hood' ? 0.12 : 0.22
      this.camera.position.x += (Math.random() - 0.5) * s * amp
      this.camera.position.y += (Math.random() - 0.5) * s * amp * 0.45
      this.shake = Math.max(0, this.shake - dt * 3.2)
    }

    this.camera.lookAt(this.lookSmooth)
  }
}
