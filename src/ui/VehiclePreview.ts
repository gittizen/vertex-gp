import * as THREE from 'three'
import { createVehicleMesh } from '../vehicle/VehicleMeshes'
import { DEFAULT_VEHICLE_LOOK, type VehicleLook } from '../vehicle/VehicleLook'
import type { VehicleKind } from '../track/TrackDefs'
import { isMobileClient, mobileCamDist } from '../input/MobileLook'

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
  private pending: { id: number; x: number; y: number } | null = null
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
    const z = 5.2 * mobileCamDist()
    this.camera.position.set(0, 1.4 * Math.sqrt(mobileCamDist()), z)
    this.camera.lookAt(0, 0.55, 0)

    const hemi = new THREE.HemisphereLight(0xffffff, 0x334455, 1.15)
    this.scene.add(hemi)
    const key = new THREE.DirectionalLight(0xfff4e8, 1.15)
    key.position.set(3.2, 6.5, 4.2)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0x88aaff, 0.45)
    fill.position.set(-4, 2.2, -2.4)
    this.scene.add(fill)
    const rim = new THREE.PointLight(0xb8d0ff, 1.2, 8, 2)
    rim.position.set(-1.6, 1.8, -2.8)
    this.scene.add(rim)
    const nose = new THREE.PointLight(0xfff0e0, 0.85, 6, 2)
    nose.position.set(1.2, 1.6, 2.6)
    this.scene.add(nose)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 48),
      new THREE.MeshBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.55 }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = 0.01
    this.scene.add(floor)

    this.scene.add(this.root)

    // Mobil: vertikální scroll má přednost — drag modelu jen při jasném vodorovném gestu
    const mobile = isMobileClient()
    if (mobile) this.canvas.style.touchAction = 'pan-y'

    this.onPointerDown = (e) => {
      this.pending = { id: e.pointerId, x: e.clientX, y: e.clientY }
      this.lastX = e.clientX
      this.lastY = e.clientY
      if (!mobile) {
        this.dragging = true
        this.autoSpin = false
        this.canvas.setPointerCapture(e.pointerId)
      }
    }
    this.onPointerMove = (e) => {
      if (this.pending && e.pointerId === this.pending.id && !this.dragging) {
        const dx = e.clientX - this.pending.x
        const dy = e.clientY - this.pending.y
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
        // Vertikální pohyb → nech scroll stránky
        if (Math.abs(dy) >= Math.abs(dx) * 0.85) {
          this.pending = null
          return
        }
        this.dragging = true
        this.autoSpin = false
        this.pending = null
        try {
          this.canvas.setPointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
      }
      if (!this.dragging) return
      const dx = e.clientX - this.lastX
      const dy = e.clientY - this.lastY
      this.lastX = e.clientX
      this.lastY = e.clientY
      this.yaw += dx * 0.01
      this.pitch = Math.max(-0.35, Math.min(0.55, this.pitch + dy * 0.008))
    }
    this.onPointerUp = (e) => {
      this.pending = null
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

  setVehicle(kind: VehicleKind, look: VehicleLook | number, neon = DEFAULT_VEHICLE_LOOK.neon): void {
    if (this.mesh) {
      this.root.remove(this.mesh)
      disposeGroup(this.mesh)
      this.mesh = null
    }
    const fs = kind === 'skate' || kind === 'bike' || kind === 'scooter'
    const full: VehicleLook =
      typeof look === 'number'
        ? { ...DEFAULT_VEHICLE_LOOK, body: look, neon: fs ? -1 : neon }
        : { ...look, neon: fs ? -1 : look.neon }
    this.mesh = createVehicleMesh(kind, full.body, full.neon)
    const box = new THREE.Box3().setFromObject(this.mesh)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    this.mesh.position.sub(center)
    this.mesh.position.y += size.y * 0.5
    const maxDim = Math.max(size.x, size.y, size.z, 0.01)
    const scale = 2.35 / maxDim / mobileCamDist()
    this.root.scale.setScalar(scale)
    this.root.add(this.mesh)
    this.applyLook(full)
  }

  applyLook(look: VehicleLook): void {
    this.setColor(look.body)
    this.setNeon(look.neon < 0 ? -1 : look.neon)
    this.setWheelColor(look.wheel)
    this.setRiderColor(look.rider)
    this.setHelmColor(look.helm)
  }

  setColor(color: number): void {
    if (!this.mesh) return
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.bodyPaint) return
      obj.visible = !none
      if (none) return
      this.tintMaterial(obj.material, color, true)
    })
  }

  setNeon(color: number): void {
    if (!this.mesh) return
    const none = color < 0
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData.neonGlow) return
      obj.visible = !none
      if (none) return
      this.tintMaterial(obj.material, color, true, 0.85)
    })
  }

  setWheelColor(color: number): void {
    this.tintByFlag('wheelPaint', color, 0x1a1a1a)
  }

  setRiderColor(color: number): void {
    this.tintByFlag('riderPaint', color, 0x1c2430)
  }

  setHelmColor(color: number): void {
    this.tintByFlag('helmPaint', color, 0x2a2a32)
  }

  private tintByFlag(flag: string, color: number, noneHex: number): void {
    if (!this.mesh) return
    const none = color < 0
    const hex = none ? noneHex : color
    this.mesh.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.userData[flag]) return
      this.tintMaterial(obj.material, hex, !none)
    })
  }

  private tintMaterial(
    mat: THREE.Material | THREE.Material[],
    color: number,
    withEmissive: boolean,
    emissiveIntensity?: number,
  ): void {
    const list = Array.isArray(mat) ? mat : [mat]
    for (const m of list) {
      if (
        !(
          m instanceof THREE.MeshStandardMaterial ||
          m instanceof THREE.MeshLambertMaterial ||
          m instanceof THREE.MeshPhongMaterial ||
          m instanceof THREE.MeshBasicMaterial
        )
      ) {
        continue
      }
      m.color.setHex(color)
      if (withEmissive && 'emissive' in m) {
        m.emissive.setHex(color)
        if (emissiveIntensity !== undefined) m.emissiveIntensity = emissiveIntensity
      }
      m.needsUpdate = true
    }
  }

  dispose(): void {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerUp)
    if (this.mesh) {
      this.root.remove(this.mesh)
      disposeGroup(this.mesh)
      this.mesh = null
    }
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
