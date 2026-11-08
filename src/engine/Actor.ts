import * as THREE from 'three'
import { Component } from './Component'
import { ObjectBase } from './ObjectBase'
import type { World } from './World'

/**
 * AActor / GameObject — entita ve světě s transformem a komponentami.
 */
export class Actor extends ObjectBase {
  readonly root: THREE.Group
  world: World | null = null
  private readonly components: Component[] = []
  private begun = false

  constructor(name = 'Actor') {
    super(name)
    this.root = new THREE.Group()
    this.root.name = name
  }

  addComponent<T extends Component>(comp: T): T {
    comp.owner = this
    this.components.push(comp)
    if (this.begun) comp.beginPlay()
    return comp
  }

  getComponent<T extends Component>(ctor: new (...args: never[]) => T): T | null {
    for (const c of this.components) {
      if (c instanceof ctor) return c
    }
    return null
  }

  getComponents(): readonly Component[] {
    return this.components
  }

  beginPlay(): void {
    if (this.begun) return
    this.begun = true
    for (const c of this.components) c.beginPlay()
  }

  endPlay(): void {
    for (const c of this.components) c.endPlay()
    this.begun = false
  }

  tick(dt: number): void {
    if (this.isPendingKill()) return
    for (const c of this.components) {
      if (c.enabled) c.tick(dt)
    }
  }

  attachToWorld(world: World): void {
    this.world = world
    world.scene.add(this.root)
  }

  detachFromWorld(): void {
    this.root.removeFromParent()
    this.world = null
  }
}
