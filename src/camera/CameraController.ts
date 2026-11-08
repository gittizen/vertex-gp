import * as THREE from 'three'
import type { Vehicle } from '../vehicle/Vehicle'

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera
  private readonly look = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  /** Rychlost sledování (vyšší = těsnější). */
  followRate = 8

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera
  }

  get modeLabel(): string {
    return '2.5D'
  }

  update(dt: number, vehicle: Vehicle): void {
    const p = vehicle.physics
    const forwardX = Math.sin(p.heading)
    const forwardZ = Math.cos(p.heading)
    const y = vehicle.groundY

    const back = 12
    const height = 9
    const lookAhead = 8

    // Stejná výška vůči autu (kopce / skoky)
    this.desired.set(p.x - forwardX * back, y + height, p.z - forwardZ * back)
    this.look.set(p.x + forwardX * lookAhead, y + 0.6, p.z + forwardZ * lookAhead)

    const lerp = 1 - Math.exp(-this.followRate * dt)
    this.camera.position.x += (this.desired.x - this.camera.position.x) * lerp
    this.camera.position.z += (this.desired.z - this.camera.position.z) * lerp
    this.camera.position.y = this.desired.y
    this.camera.lookAt(this.look)
  }
}
