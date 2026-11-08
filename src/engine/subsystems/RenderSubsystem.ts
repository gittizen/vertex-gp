import * as THREE from 'three'
import { RenderPipeline } from '../../render/RenderPipeline'
import type { VisualSettingsValues } from '../../render/VisualSettings'
import type { World } from '../World'

/**
 * Render subsystem — jako Unity URP / Unreal Renderer Module.
 * Vlastní post-FX (ACES · bloom · grade · shadows · env).
 */
export class RenderSubsystem {
  readonly pipeline: RenderPipeline
  readonly camera: THREE.PerspectiveCamera

  constructor(
    canvas: HTMLCanvasElement,
    world: World,
    visual: VisualSettingsValues,
  ) {
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.4, 2800)
    this.pipeline = new RenderPipeline(canvas, world.scene, this.camera, visual)
    this.pipeline.renderer.setClearColor(0x0a0e14, 1)
    this.pipeline.attachEnvironment(world.scene)
  }

  get renderer(): THREE.WebGLRenderer {
    return this.pipeline.renderer
  }

  applyVisual(visual: VisualSettingsValues, sun?: THREE.DirectionalLight): void {
    this.pipeline.applySettings(visual, sun)
  }

  resize(cssW: number, cssH: number, internalScale: number): void {
    this.camera.aspect = cssW / cssH
    this.camera.updateProjectionMatrix()
    this.pipeline.setSize(cssW, cssH, internalScale)
  }

  draw(world: World): void {
    this.pipeline.render(world.scene, this.camera)
  }

  dispose(): void {
    this.pipeline.dispose()
  }
}
