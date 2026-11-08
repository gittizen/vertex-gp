import type { VisualSettingsValues } from '../render/VisualSettings'
import { World } from './World'
import { RenderSubsystem } from './subsystems/RenderSubsystem'

export type EngineBootOptions = {
  canvas: HTMLCanvasElement
  visual: VisualSettingsValues
  worldName?: string
}

/**
 * UGameInstance / Unity Engine bootstrap.
 * Klec Engine — free runtime nad Three.js (URP-like pipeline + World/Actor).
 */
export class Engine {
  static readonly VERSION = '0.2.0-klec'
  static readonly NAME = 'Klec Engine'

  readonly world: World
  readonly render: RenderSubsystem
  private running = false
  private lastTime = 0
  private raf = 0
  private tickHandler: ((dt: number) => void) | null = null

  constructor(opts: EngineBootOptions) {
    this.world = new World(opts.worldName ?? 'KlecWorld')
    this.render = new RenderSubsystem(opts.canvas, this.world, opts.visual)
    console.info(
      `%c${Engine.NAME} ${Engine.VERSION}%c · World ready`,
      'color:#2de2e6;font-weight:700',
      'color:#8899aa',
    )
  }

  /** Herní mód registruje svůj tick (GameMode). */
  setGameTick(handler: (dt: number) => void): void {
    this.tickHandler = handler
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    const loop = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.lastTime) / 1000)
      this.lastTime = now
      this.world.tick(dt)
      this.tickHandler?.(dt)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose(): void {
    this.stop()
    this.render.dispose()
  }
}
