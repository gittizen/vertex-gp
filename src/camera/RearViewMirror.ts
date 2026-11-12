import * as THREE from 'three'
import type { Vehicle } from '../vehicle/Vehicle'

/** Max vnitřní rozlišení zrcátka (extra full-scene pass). */
const MIRROR_RT_W = 128
const MIRROR_RT_H = 54
/** Obnovit scénu v RT každý N-tý frame (blit pořád). */
const MIRROR_REFRESH_EVERY = 3

/**
 * Funkční zpětné zrcátko — low-res RT + upscale do scissor viewportu.
 * Default vypnuto (extra draw call).
 *
 * Horizontální flip = negace projectionMatrix[0] + dočasné CW frontFace
 * (camera.scale.x = -1 by shodilo backface culling → prázdný obraz).
 * Shadow map se při mirror passu nepřepočítává (hlavní zdroj fps dropu).
 */
export class RearViewMirror {
  readonly camera: THREE.PerspectiveCamera
  private enabled = false
  private readonly look = new THREE.Vector3()
  private readonly size = new THREE.Vector2()
  private playerMesh: THREE.Object3D | null = null
  private readonly rt: THREE.WebGLRenderTarget
  private readonly blitScene = new THREE.Scene()
  private readonly blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private readonly blitMat: THREE.MeshBasicMaterial
  private frameSkip = 0

  constructor() {
    this.camera = new THREE.PerspectiveCamera(52, MIRROR_RT_W / MIRROR_RT_H, 0.6, 160)
    this.rt = new THREE.WebGLRenderTarget(MIRROR_RT_W, MIRROR_RT_H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    })
    this.rt.texture.colorSpace = THREE.SRGBColorSpace
    this.blitMat = new THREE.MeshBasicMaterial({
      map: this.rt.texture,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blitMat)
    this.blitScene.add(quad)
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.frameSkip = 0
  }

  isEnabled(): boolean {
    return this.enabled
  }

  update(vehicle: Vehicle): void {
    if (!this.enabled) return
    this.playerMesh = vehicle.mesh
    const p = vehicle.physics
    const heading = Number.isFinite(p.heading) ? p.heading : 0
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const y = Math.max(vehicle.groundY + 1.55, vehicle.mesh.position.y + 1.15)
    this.camera.position.set(p.x + fx * 0.15, y, p.z + fz * 0.15)
    this.look.set(p.x - fx * 24, y - 0.35, p.z - fz * 24)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(this.look)
  }

  /** Vykreslí zrcátko do horního středu canvasu (po hlavním renderu). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
    if (!this.enabled) return
    renderer.getSize(this.size)
    const mw = Math.floor(Math.min(320, this.size.x * 0.28))
    const mh = Math.floor(mw * 0.42)
    const mx = Math.floor((this.size.x - mw) / 2)
    const my = this.size.y - mh - Math.floor(this.size.y * 0.035)

    this.frameSkip++
    const refresh = this.frameSkip % MIRROR_REFRESH_EVERY === 1
    if (refresh) {
      this.camera.aspect = MIRROR_RT_W / MIRROR_RT_H
      this.camera.updateProjectionMatrix()
      this.camera.projectionMatrix.elements[0] *= -1

      const mesh = this.playerMesh
      const prevVisible = mesh?.visible ?? true
      if (mesh) mesh.visible = false

      const gl = renderer.getContext()
      const prevFrontFace = gl.getParameter(gl.FRONT_FACE) as number
      const prevTarget = renderer.getRenderTarget()
      const prevAutoClear = renderer.autoClear
      const prevShadowAuto = renderer.shadowMap.autoUpdate
      const prevShadowNeeds = renderer.shadowMap.needsUpdate

      // Nepřepočítávat shadow mapy — to zabíjelo FPS při zapnutém zrcátku
      renderer.shadowMap.autoUpdate = false
      renderer.shadowMap.needsUpdate = false
      renderer.setRenderTarget(this.rt)
      renderer.autoClear = true
      renderer.clear()
      gl.frontFace(gl.CW)
      renderer.render(scene, this.camera)
      gl.frontFace(prevFrontFace === gl.CW ? gl.CW : gl.CCW)

      renderer.setRenderTarget(prevTarget)
      renderer.autoClear = prevAutoClear
      renderer.shadowMap.autoUpdate = prevShadowAuto
      renderer.shadowMap.needsUpdate = prevShadowNeeds
      if (mesh) mesh.visible = prevVisible
    }

    const prevAutoClear = renderer.autoClear
    renderer.autoClear = false
    renderer.setScissorTest(true)
    renderer.setViewport(mx, my, mw, mh)
    renderer.setScissor(mx, my, mw, mh)
    renderer.clearDepth()
    renderer.render(this.blitScene, this.blitCam)
    renderer.setScissorTest(false)
    renderer.setViewport(0, 0, this.size.x, this.size.y)
    renderer.autoClear = prevAutoClear
  }
}
