import * as THREE from 'three'
import { createVehicleMesh } from '../vehicle/VehicleMeshes'
import type { VehicleKind } from '../track/TrackDefs'

/** Mini Three.js scéna vozidla v menu — otáčení, barva, auto-spin. */
export class VehiclePreview {
  private readonly canvas: HTMLCanvasElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly root = new THREE.Group()
  private mesh: THREE.Group | null = null
  private yaw = 0.55
  private pitch = 0.22
  private autoSpin = true
  private dragging = false
  private lastX = 0
  private lastY = 0
  private raf = 0
  private disposed = false
  private readonly onPointerDown: (e: PointerEvent) => void
  private readonly onPointerMove: (e: PointerEvent) => void
  private readonly onPointerUp: (e: PointerEvent) => void

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    this.renderer.setClearColor(0x000000, 0)
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 40)
    this.camera.position.set(0, 1.4, 5.2)
    this.camera.lookAt(0, 0.55, 0)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.1)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xffffff, 0.85)
    key.position.set(3, 6, 4)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35)
    fill.position.set(-4, 2, -2)
    this.scene.add(fill)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.55 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.01
    this.scene.add(floor)

    this.scene.add(this.root)

    this.onPointerDown = (e) => {
      this.dragging = true
      this.autoSpin = false
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.canvas.setPointerCapture(e.pointerId)
    }
    this.onPointerMove = (e) => {
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.yaw += dx * 0.01
      this.pitch = Math.max(-0.35, Math.min(0.55, this.pitch + dy * 0.008))
    }
    this.onPointerUp = (e) => {
      this.dragging = false
      try {
        this.canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        if (!this.disposed && !this.dragging) this.autoSpin = true
      }, 1200)
    }

    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerUp)

    this.resize()
    this.tick()
  }

  setVehicle(kind: VehicleKind, color: number, neon = 0xff2bd6): void {
    if (this.mesh) {
      this.root.remove(this.mesh)
      disposeGroup(this.mesh)
      this.mesh = null
    }
    this.mesh = createVehicleMesh(kind, color, neon)
    // Centrum a měřítko podle bounding boxu
    const box = new THREE.Box3().setFromObject(this.mesh)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    this.mesh.position.sub(center)
    this.mesh.position.y += size.y * 0.5
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    const scale = 2.35 / maxDim
    this.root.scale.setScalar(scale)
    this.root.add(this.mesh)
  }

  setColor(color: number): void {
    if (!this.mesh) return
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.bodyPaint) return
      obj.visible = !none
      if (none) return
      const mat = obj.material
      if (
        mat instanceof THREE.MeshLambertMaterial ||
        mat instanceof THREE.MeshPhongMaterial ||
        mat instanceof THREE.MeshBasicMaterial
      ) {
        mat.color.setHex(color)
      }
    })
  }

  setNeon(color: number): void {
    if (!this.mesh) return
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      if (obj.userData.neonGlow) {
        obj.visible = !none
        if (none) return
        const mat = obj.material
        if (
          mat instanceof THREE.MeshLambertMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshBasicMaterial
        ) {
          mat.color.setHex(color)
          if ('emissive' in mat) {
            ;(mat as THREE.MeshLambertMaterial).emissive.setHex(color)
            ;(mat as THREE.MeshLambertMaterial).emissiveIntensity = 0.7
          }
        }
        return
      }
      if (obj.userData.wheelPaint) {
        const mat = obj.material
        if (
          mat instanceof THREE.MeshLambertMaterial ||
          mat instanceof THREE.MeshPhongMaterial ||
          mat instanceof THREE.MeshBasicMaterial
        ) {
          const c = none ? 0x1a1a1a : color
          mat.color.setHex(c)
          if ('emissive' in mat) {
            ;(mat as THREE.MeshLambertMaterial).emissive.setHex(none ? 0x000000 : c)
            ;(mat as THREE.MeshLambertMaterial).emissiveIntensity = none ? 0 : 0.55
          }
        }
      }
    })
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    if (this.mesh) disposeGroup(this.mesh)
    this.renderer.dispose()
  }

  private resize(): void {
    const w = Math.max(1, this.canvas.clientWidth)
    const h = Math.max(1, this.canvas.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private tick = (): void => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.tick)
    this.resize()
    if (this.autoSpin && !this.dragging) this.yaw += 0.008
    this.root.rotation.set(this.pitch, this.yaw, 0)
    this.renderer.render(this.scene, this.camera)
  }
}

function disposeGroup(g: THREE.Object3D): void {
  g.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose()
      const mat = obj.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    }
  })
}
