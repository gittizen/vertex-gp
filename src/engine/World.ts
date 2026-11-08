import * as THREE from 'three'
import type { Actor } from './Actor'
import { ObjectBase } from './ObjectBase'

/**
 * UWorld — scéna + actory + tick (Unreal World / Unity Scene).
 */
export class World extends ObjectBase {
  readonly scene = new THREE.Scene()
  private readonly actors: Actor[] = []
  timeSeconds = 0

  constructor(name = 'World') {
    super(name)
  }

  spawnActor<T extends Actor>(actor: T): T {
    this.actors.push(actor)
    actor.attachToWorld(this)
    actor.beginPlay()
    return actor
  }

  destroyActor(actor: Actor): void {
    actor.markPendingKill()
    actor.endPlay()
    actor.detachFromWorld()
    const i = this.actors.indexOf(actor)
    if (i >= 0) this.actors.splice(i, 1)
  }

  tick(dt: number): void {
    this.timeSeconds += dt
    for (const a of this.actors) {
      if (!a.isPendingKill()) a.tick(dt)
    }
    // Úklid
    for (let i = this.actors.length - 1; i >= 0; i--) {
      const a = this.actors[i]!
      if (a.isPendingKill()) {
        a.endPlay()
        a.detachFromWorld()
        this.actors.splice(i, 1)
      }
    }
  }

  getActors(): readonly Actor[] {
    return this.actors
  }

  /** Najdi světlo / named object ve scéně. */
  findObjectByName(name: string): THREE.Object3D | undefined {
    return this.scene.getObjectByName(name)
  }
}
