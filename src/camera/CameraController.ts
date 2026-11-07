import * as THREE from 'three'
import type { Vehicle } from '../vehicle/Vehicle'

export class CameraController {
  private readonly camera: THREE.PerspectiveCamera
  private readonly look = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()

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

    const back = 12
    const height = 9
    const lookAhead = 8

    this.desired.set(p.x - forwardX * back, height, p.z - forwardZ * back)
    this.look.set(p.x + forwardX * lookAhead, 0.6, p.z + forwardZ * lookAhead)

    const lerp = 1 - Math.exp(-6 * dt)
    this.camera.position.lerp(this.desired, lerp)
    this.camera.lookAt(this.look)
  }
}
