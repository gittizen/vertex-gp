import * as THREE from 'three'
import type { Vehicle } from '../vehicle/Vehicle'

/**
 * Funkční zpětné zrcátko — druhá kamera do scissor viewportu.
 * Default vypnuto (extra draw call).
 */
export class RearViewMirror {
  readonly camera: THREE.PerspectiveCamera
  private enabled = false
  private readonly look = new THREE.Vector3()
  private readonly size = new THREE.Vector2()

  constructor() {
    this.camera = new THREE.PerspectiveCamera(48, 16 / 9, 0.35, 220)
    // Horizontální flip = skutečné zrcadlo
    this.camera.scale.x = -1
  }

  setEnabled(on: boolean): void {
    this.enabled = on
  }

  isEnabled(): boolean {
    return this.enabled
  }

  update(vehicle: Vehicle): void {
    if (!this.enabled) return
    const p = vehicle.physics
    const fx = Math.sin(p.heading)
    const fz = Math.cos(p.heading)
    const y = vehicle.groundY + 1.35
    // Mírně nad kabinou, kouká dozadu
    this.camera.position.set(p.x + fx * 0.35, y, p.z + fz * 0.35)
    this.look.set(p.x - fx * 18, y - 0.15, p.z - fz * 18)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.look)
  }

  /** Vykreslí zrcátko do horního středu canvasu (po hlavním renderu). */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
  ): void {
    if (!this.enabled) return
    renderer.getSize(this.size)
    const mw = Math.floor(Math.min(320, this.size.x * 0.28))
    const mh = Math.floor(mw * 0.42)
    const mx = Math.floor((this.size.x - mw) / 2)
    const my = this.size.y - mh - Math.floor(this.size.y * 0.035)

    this.camera.aspect = mw / Math.max(1, mh)
    this.camera.updateProjectionMatrix()

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.clearDepth()
    renderer.setScissorTest(true)
    renderer.setViewport(mx, my, mw, mh)
    renderer.setScissor(mx, my, mw, mh)
    renderer.render(scene, this.camera)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, this.size.x, this.size.y)
    renderer.autoClear = prevAutoClear
  }
}
