import type { Actor } from './Actor'
import { ObjectBase } from './ObjectBase'

/** ActorComponent — Unity MonoBehaviour / Unreal ActorComponent. */
export abstract class Component extends ObjectBase {
  owner: Actor | null = null
  enabled = true

  beginPlay(): void {}
  endPlay(): void {}
  tick(_dt: number): void {}
}
