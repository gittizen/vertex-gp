export class Input {
  readonly keys = new Set<string>()
  private readonly justPressed = new Set<string>()

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      this.justPressed.add(e.code)
      if (
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space'
      ) {
        e.preventDefault()
      }
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
    })
  }

  endFrame(): void {
    this.justPressed.clear()
  }

  pressed(code: string): boolean {
    return this.justPressed.has(code)
  }

  get throttle(): number {
    return this.keys.has('ArrowUp') || this.keys.has('KeyW') ? 1 : 0
  }

  get brake(): number {
    return this.keys.has('ArrowDown') || this.keys.has('KeyS') ? 1 : 0
  }

  get steer(): number {
    let s = 0
    // Inverted vs key side so on-track left/right matches the camera
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) s += 1
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) s -= 1
    return s
  }
}
