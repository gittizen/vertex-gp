import * as THREE from 'three'
import { Component } from '../Component'
import type { VisualSettingsValues } from '../../render/VisualSettings'
import type { RenderPipeline } from '../../render/RenderPipeline'

/**
 * Light rig — key/fill + shadow mapa, která JEZDÍ s hráčem
 * (fixní frustum na originu = na Hrubý mimo ±180 m „mizí“ světlo/silnice).
 */
export class SceneLightRig extends Component {
  private ambient!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  private sun!: THREE.DirectionalLight
  private rim!: THREE.DirectionalLight
  private readonly sunOffset = new THREE.Vector3(70, 140, 45)
  private readonly rimOffset = new THREE.Vector3(-90, 50, -80)

  beginPlay(): void {
    const scene = this.owner?.world?.scene
    if (!scene) return

    this.ambient = new THREE.AmbientLight(0xa8b0bc, 0.28)
    this.ambient.name = 'ambient'
    scene.add(this.ambient)

    this.hemi = new THREE.HemisphereLight(0xd0dae8, 0x2a3038, 0.62)
    this.hemi.name = 'hemi'
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff4e8, 1.35)
    this.sun.name = 'sun'
    this.sun.position.copy(this.sunOffset)
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.rim = new THREE.DirectionalLight(0x8898b0, 0.22)
    this.rim.name = 'rim'
    this.rim.position.copy(this.rimOffset)
    scene.add(this.rim)
  }

  configureShadows(pipeline: RenderPipeline, visual: VisualSettingsValues): void {
    pipeline.configureSunShadow(this.sun, visual)
  }

  /** Posune shadow kameru + sun target na auto — stabilní stíny na velkých okruzích. */
  follow(x: number, z: number): void {
    if (!this.sun) return
    this.sun.target.position.set(x, 0, z)
    this.sun.target.updateMatrixWorld()
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z)
    if (this.rim) {
      this.rim.position.set(x + this.rimOffset.x, this.rimOffset.y, z + this.rimOffset.z)
    }
  }

  setSunOffset(x: number, y: number, z: number): void {
    this.sunOffset.set(x, y, z)
  }

  getSun(): THREE.DirectionalLight {
    return this.sun
  }
}
