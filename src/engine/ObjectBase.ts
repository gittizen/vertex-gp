let nextId = 1

/** UObject-like základ (Unreal) / Object (Unity). */
export class ObjectBase {
  readonly id: number
  name: string
  private pendingKill = false

  constructor(name = 'Object') {
    this.id = nextId++
    this.name = name
  }

  markPendingKill(): void {
    this.pendingKill = true
  }

  isPendingKill(): boolean {
    return this.pendingKill
  }
}
