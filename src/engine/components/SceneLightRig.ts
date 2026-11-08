import * as THREE from 'three'
import { Component } from '../Component'
import type { VisualSettingsValues } from '../../render/VisualSettings'
import type { RenderPipeline } from '../../render/RenderPipeline'

/**
 * Light rig ve stylu Unreal/Unity — fill + key + rim.
 * Bez PointLight follow (drahé na GPU).
 */
export class SceneLightRig extends Component {
  private ambient!: THREE.AmbientLight
  private hemi!: THREE.HemisphereLight
  private sun!: THREE.DirectionalLight
  private rim!: THREE.DirectionalLight

  beginPlay(): void {
    const scene = this.owner?.world?.scene
    if (!scene) return

    this.ambient = new THREE.AmbientLight(0xc8d0dc, 0.42)
    this.ambient.name = 'ambient'
    scene.add(this.ambient)

    this.hemi = new THREE.HemisphereLight(0xd8e8ff, 0x4a5a40, 0.85)
    this.hemi.name = 'hemi'
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xfff4e6, 1.15)
    this.sun.name = 'sun'
    this.sun.position.set(70, 130, 60)
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.rim = new THREE.DirectionalLight(0xa8c4ff, 0.35)
    this.rim.name = 'rim'
    this.rim.position.set(-70, 50, -90)
    scene.add(this.rim)
  }

  configureShadows(pipeline: RenderPipeline, visual: VisualSettingsValues): void {
    pipeline.configureSunShadow(this.sun, visual)
  }

  getSun(): THREE.DirectionalLight {
    return this.sun
  }
}
