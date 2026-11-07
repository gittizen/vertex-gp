import * as THREE from 'three'
import { matLambert } from '../render/Materials'
import type { TrackDef } from './TrackDefs'

export type TrackSample = {
  position: THREE.Vector3
  tangent: THREE.Vector3
  normal: THREE.Vector3
  t: number
}

type LutPoint = { x: number; z: number; nx: number; nz: number; tx: number; tz: number }

/** Lehká trať — méně meshů, LUT pro progress, sdílené materiály. */
export class Track {
  readonly def: TrackDef
  readonly curve: THREE.CatmullRomCurve3
  readonly halfWidth: number
  readonly group = new THREE.Group()
  readonly checkpoints: THREE.Vector3[] = []
  readonly length: number
  private readonly scene: THREE.Scene
  private readonly lut: LutPoint[] = []
  private readonly lutN = 96
  private readonly tmpPos = new THREE.Vector3()
  private readonly tmpTan = new THREE.Vector3()

  constructor(scene: THREE.Scene, def: TrackDef) {
    this.scene = scene
    this.def = def
    this.halfWidth = def.halfWidth
    const pts = def.points.map(([x, z]) => new THREE.Vector3(x, 0, z))
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', def.tension)
    this.length = this.curve.getLength()
    this.buildLut()
    this.buildMeshes()
    this.buildCheckpoints()
    this.addWorld()
    scene.add(this.group)
  }

  dispose(): void {
    this.scene.remove(this.group)
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
        obj.geometry.dispose()
        const mat = obj.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat.dispose()
      }
    })
  }

  setDecorQuality(dense: boolean): void {
    this.group.traverse((obj) => {
      if (obj.userData.decorTier === 'extra') obj.visible = dense
    })
  }

  private buildLut(): void {
    for (let i = 0; i < this.lutN; i++) {
      const t = i / this.lutN
      const p = this.curve.getPointAt(t)
      const tan = this.curve.getTangentAt(t).normalize()
      const nx = -tan.z
      const nz = tan.x
      this.lut.push({ x: p.x, z: p.z, nx, nz, tx: tan.x, tz: tan.z })
    }
  }

  private sideNormal(tangent: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
  }

  private buildMeshes(): void {
    const segments = 120
    const theme = this.def.theme
    const roadPositions: number[] = []
    const roadIndices: number[] = []
    const barrierL: number[] = []
    const barrierR: number[] = []
    const city = this.def.world === 'city'
    const wallH = city ? 0.55 : this.def.world === 'ice' ? 0.5 : 1.0
    const roadY = city ? 0.08 : 0.05

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const p = this.curve.getPointAt(t)
      const tangent = this.curve.getTangentAt(t).normalize()
      const n = this.sideNormal(tangent)
      const left = p.clone().addScaledVector(n, this.halfWidth)
      const right = p.clone().addScaledVector(n, -this.halfWidth)
      roadPositions.push(left.x, roadY, left.z, right.x, roadY, right.z)

      barrierL.push(left.x + n.x * 0.3, 0, left.z + n.z * 0.3, left.x + n.x * 0.3, wallH, left.z + n.z * 0.3)
      barrierR.push(right.x - n.x * 0.3, 0, right.z - n.z * 0.3, right.x - n.x * 0.3, wallH, right.z - n.z * 0.3)

      if (i < segments) {
        const a = i * 2
        roadIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }

    const roadGeo = new THREE.BufferGeometry()
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3))
    roadGeo.setIndex(roadIndices)
    roadGeo.computeVertexNormals()
    this.group.add(
      new THREE.Mesh(
        roadGeo,
        city
          ? matLambert(theme.road, { emissive: 0x2a2a40, emissiveIntensity: 0.25 })
          : matLambert(theme.road),
      ),
    )

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(480, 32),
      matLambert(theme.ground),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
    this.group.add(ground)

    const edgeOpacity = city ? 1 : 0.65
    const edgeMat = new THREE.LineBasicMaterial({
      color: theme.edge,
      transparent: !city,
      opacity: edgeOpacity,
    })
    const leftEdge: THREE.Vector3[] = []
    const rightEdge: THREE.Vector3[] = []
    const centerDash: THREE.Vector3[] = []
    for (let i = 0; i <= 100; i++) {
      const s = this.sample(i / 100)
      leftEdge.push(s.position.clone().addScaledVector(s.normal, this.halfWidth - 0.2).setY(roadY + 0.05))
      rightEdge.push(s.position.clone().addScaledVector(s.normal, -(this.halfWidth - 0.2)).setY(roadY + 0.05))
      if (city && i % 2 === 0 && i < 100) {
        centerDash.push(s.position.clone().setY(roadY + 0.06))
        centerDash.push(this.sample((i + 0.45) / 100).position.clone().setY(roadY + 0.06))
      }
    }
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge), edgeMat))
    this.group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge), edgeMat.clone()))
    if (city && centerDash.length) {
      this.group.add(
        new THREE.LineSegments(
          new THREE.BufferGeometry().setFromPoints(centerDash),
          new THREE.LineBasicMaterial({ color: 0xfff66a }),
        ),
      )
      // Široké světlé okraje tratě (zvýraznění)
      this.addCityEdgeGlow(theme.accent, 1)
      this.addCityEdgeGlow(theme.detail, -1)
    }

    this.addBarrierRibbon(barrierL, theme.barrierL)
    this.addBarrierRibbon(barrierR, theme.barrierR)

    const start = this.sample(0)
    for (let i = -3; i <= 3; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth / 3.5, 0.04, 1.2),
        matLambert(i % 2 === 0 ? 0xf0f0f0 : 0x151515),
      )
      stripe.position.set(
        start.position.x + start.normal.x * i * (this.halfWidth / 3.5),
        0.1,
        start.position.z + start.normal.z * i * (this.halfWidth / 3.5),
      )
      stripe.rotation.y = Math.atan2(start.tangent.x, start.tangent.z)
      this.group.add(stripe)
    }
  }

  private addWorld(): void {
    if (this.def.world === 'city') this.buildCity()
    else if (this.def.world === 'circuit') this.buildCircuit()
    else this.buildIce()
  }

  private buildCity(): void {
    const theme = this.def.theme
    const facades = [0x2a2838, 0x242230, 0x323040, 0x1e1c28]
    const neons = [0xff2bd6, 0x2de2e6, 0xff6a3d, 0x7b61ff]
    const wallMats = facades.map((c) => matLambert(c))
    const neonMats = neons.map((c) => matLambert(c, { emissive: c, emissiveIntensity: 0.7 }))

    for (let i = 0; i < 18; i++) {
      const s = this.sample(i / 18)
      for (const side of [-1, 1] as const) {
        const dist = this.halfWidth + 7 + (i % 2) * 8
        const floors = 3 + ((i + (side > 0 ? 1 : 0)) % 5)
        const h = floors * 3.2
        const w = 6 + (i % 3)
        const d = 5.5
        const block = new THREE.Group()

        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, d),
          wallMats[(i + (side > 0 ? 1 : 0)) % wallMats.length],
        )
        wall.position.y = h / 2
        block.add(wall)

        // Jedna neonová „okna“ deska místo stovek meshů
        const neon = neons[i % neons.length]
        const windows = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.75, h * 0.7, 0.12),
          neonMats[i % neonMats.length],
        )
        windows.position.set(0, h * 0.5, d / 2 + 0.05)
        block.add(windows)

        if (i % 3 === 0) {
          const sign = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.55, 0.4, 0.1),
            matLambert(neon, { emissive: neon, emissiveIntensity: 0.9 }),
          )
          sign.position.set(0, h * 0.72, d / 2 + 0.12)
          block.add(sign)
        }

        block.position.set(
          s.position.x + s.normal.x * dist * side,
          0,
          s.position.z + s.normal.z * dist * side,
        )
        block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + (side > 0 ? 0 : Math.PI)
        if (i >= 14) block.userData.decorTier = 'extra'
        this.group.add(block)
      }
    }

    const poleM = matLambert(0x2a2a30)
    for (let i = 0; i < 14; i++) {
      const s = this.sample(i / 14)
      const side = i % 2 === 0 ? 1 : -1
      const neon = i % 2 === 0 ? theme.accent : theme.detail
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.5, 5), poleM)
      pole.position.set(
        s.position.x + s.normal.x * (this.halfWidth + 2.2) * side,
        2.75,
        s.position.z + s.normal.z * (this.halfWidth + 2.2) * side,
      )
      this.group.add(pole)
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 6, 6),
        matLambert(neon, { emissive: neon, emissiveIntensity: 1 }),
      )
      lamp.position.copy(pole.position).setY(5.4)
      this.group.add(lamp)
    }
  }

  private buildCircuit(): void {
    const theme = this.def.theme
    const stepM = matLambert(0x555555)
    const baseM = matLambert(0x4a4a4a)
    const roofM = matLambert(theme.accent)
    const crowdM = matLambert(0xc62828)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)

    for (let i = 0; i < 6; i++) {
      const s = this.sample(0.06 + i * 0.14)
      const side = i % 2 === 0 ? -1 : 1
      const stand = new THREE.Group()
      const base = new THREE.Mesh(new THREE.BoxGeometry(20, 1.2, 6), baseM)
      base.position.y = 0.6
      stand.add(base)
      for (let r = 0; r < 4; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(20, 0.6, 1.1), stepM)
        step.position.set(0, 1.2 + r * 0.65, -1.3 - r * 0.8)
        stand.add(step)
        // Jeden pruh „fanoušků“ místo jednotlivých figurek
        const crowd = new THREE.Mesh(new THREE.BoxGeometry(18, 0.55, 0.5), crowdM)
        crowd.position.set(0, 1.65 + r * 0.65, -1.3 - r * 0.8)
        stand.add(crowd)
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(21, 0.3, 7), roofM)
      roof.position.set(0, 4.4, -2)
      stand.add(roof)
      stand.position.set(
        s.position.x + s.normal.x * (this.halfWidth + 10) * side,
        0,
        s.position.z + s.normal.z * (this.halfWidth + 10) * side,
      )
      stand.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(stand)
    }

    for (let i = 0; i < 24; i++) {
      const s = this.sample(i / 24)
      const side = i % 2 === 0 ? 1 : -1
      const dist = this.halfWidth + 16 + (i % 3) * 4
      const tree = new THREE.Group()
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.32, 2.8, 5), trunk)
      t.position.y = 1.4
      tree.add(t)
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.7, 6, 6), leaf)
      canopy.position.y = 3.5
      tree.add(canopy)
      tree.position.set(
        s.position.x + s.normal.x * dist * side,
        0,
        s.position.z + s.normal.z * dist * side,
      )
      if (i >= 16) tree.userData.decorTier = 'extra'
      this.group.add(tree)
    }

    for (let i = 0; i < 12; i++) {
      const s = this.sample(0.2 + i * 0.05)
      const side = i % 2 === 0 ? 1 : -1
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.25, 0.7),
        matLambert(i % 2 === 0 ? 0xe10600 : 0xffffff),
      )
      curb.position.set(
        s.position.x + s.normal.x * (this.halfWidth + 0.6) * side,
        0.15,
        s.position.z + s.normal.z * (this.halfWidth + 0.6) * side,
      )
      curb.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(curb)
    }
  }

  private buildIce(): void {
    const theme = this.def.theme
    const rock = matLambert(0x6a7580)
    const snow = matLambert(0xeef5fa)
    const pine = matLambert(theme.detail)
    const trunk = matLambert(0x4a3220)
    const marker = matLambert(theme.accent)

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const r = 340 + (i % 3) * 40
      const h = 60 + (i % 4) * 22
      const mountain = new THREE.Group()
      const peak = new THREE.Mesh(new THREE.ConeGeometry(42, h, 5), rock)
      peak.position.y = h / 2
      mountain.add(peak)
      const cap = new THREE.Mesh(new THREE.ConeGeometry(20, h * 0.3, 5), snow)
      cap.position.y = h * 0.78
      mountain.add(cap)
      mountain.position.set(Math.cos(ang) * r, 0, Math.sin(ang) * r)
      if (i >= 6) mountain.userData.decorTier = 'extra'
      this.group.add(mountain)
    }

    const lake = new THREE.Mesh(new THREE.CircleGeometry(50, 20), matLambert(0x3a7aaa))
    lake.rotation.x = -Math.PI / 2
    lake.position.set(120, 0.03, -40)
    this.group.add(lake)

    for (let i = 0; i < 20; i++) {
      const s = this.sample(i / 20)
      const side = i % 2 === 0 ? 1 : -1
      const dist = this.halfWidth + 14 + (i % 4) * 5
      const tree = new THREE.Group()
      const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 2.2, 5), trunk)
      bole.position.y = 1.1
      tree.add(bole)
      const layer = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 5), pine)
      layer.position.y = 3.2
      tree.add(layer)
      tree.position.set(
        s.position.x + s.normal.x * dist * side,
        0,
        s.position.z + s.normal.z * dist * side,
      )
      if (i >= 14) tree.userData.decorTier = 'extra'
      this.group.add(tree)
    }

    for (let i = 0; i < 16; i++) {
      const s = this.sample(i / 16)
      for (const side of [-1, 1] as const) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.3, 5), marker)
        pole.position.set(
          s.position.x + s.normal.x * (this.halfWidth + 1.1) * side,
          0.65,
          s.position.z + s.normal.z * (this.halfWidth + 1.1) * side,
        )
        this.group.add(pole)
      }
    }
  }

  /** Neonové pruhy podél městské tratě — trať je jasně čitelná. */
  private addCityEdgeGlow(color: number, side: 1 | -1): void {
    const positions: number[] = []
    const indices: number[] = []
    const segs = 80
    const w = 0.55
    for (let i = 0; i <= segs; i++) {
      const s = this.sample(i / segs)
      const ox = s.normal.x * (this.halfWidth - 0.1) * side
      const oz = s.normal.z * (this.halfWidth - 0.1) * side
      const ix = s.normal.x * (this.halfWidth - 0.1 - w) * side
      const iz = s.normal.z * (this.halfWidth - 0.1 - w) * side
      positions.push(
        s.position.x + ox, 0.12, s.position.z + oz,
        s.position.x + ix, 0.12, s.position.z + iz,
      )
      if (i < segs) {
        const a = i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    this.group.add(
      new THREE.Mesh(
        geo,
        matLambert(color, { emissive: color, emissiveIntensity: 0.85 }),
      ),
    )
  }

  private addBarrierRibbon(positions: number[], color: number): void {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    const indices: number[] = []
    const pairs = positions.length / 6
    for (let i = 0; i < pairs - 1; i++) {
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(indices)
    geo.computeVertexNormals()
    this.group.add(new THREE.Mesh(geo, matLambert(color)))
  }

  private buildCheckpoints(): void {
    for (let i = 0; i < 20; i++) this.checkpoints.push(this.curve.getPointAt(i / 20))
  }

  sample(t: number): TrackSample {
    const tt = ((t % 1) + 1) % 1
    const position = this.curve.getPointAt(tt, this.tmpPos).clone()
    const tangent = this.curve.getTangentAt(tt, this.tmpTan).clone().normalize()
    return { position, tangent, normal: this.sideNormal(tangent), t: tt }
  }

  /** Rychlý progress přes LUT (+ volitelný hint z minulého framu). */
  progressAt(x: number, z: number, hint?: number): number {
    const n = this.lutN
    let bestI = 0
    let bestD = Infinity

    if (hint !== undefined) {
      const start = Math.floor((((hint % 1) + 1) % 1) * n)
      for (let k = -10; k <= 10; k++) {
        const i = (start + k + n) % n
        const p = this.lut[i]
        const d = (p.x - x) ** 2 + (p.z - z) ** 2
        if (d < bestD) {
          bestD = d
          bestI = i
        }
      }
    }

    const needFull = hint === undefined || bestD > this.halfWidth * this.halfWidth * 9
    if (needFull) {
      bestD = Infinity
      for (let i = 0; i < n; i++) {
        const p = this.lut[i]
        const d = (p.x - x) ** 2 + (p.z - z) ** 2
        if (d < bestD) {
          bestD = d
          bestI = i
        }
      }
    }

    // Jemná interpolace mezi sousedy
    const i0 = bestI
    const i1 = (bestI + 1) % n
    const a = this.lut[i0]
    const b = this.lut[i1]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const len2 = abx * abx + abz * abz || 1
    const u = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2))
    return (i0 + u) / n
  }

  constrain(x: number, z: number, hint?: number): { x: number; z: number; hit: boolean; t: number } {
    const t = this.progressAt(x, z, hint)
    const idx = Math.floor(t * this.lutN) % this.lutN
    const p = this.lut[idx]
    const lateral = (x - p.x) * p.nx + (z - p.z) * p.nz
    const limit = this.halfWidth + 0.55
    if (Math.abs(lateral) <= limit) return { x, z, hit: false, t }
    const clamped = Math.sign(lateral) * limit
    return {
      x: p.x + p.nx * clamped,
      z: p.z + p.nz * clamped,
      hit: true,
      t,
    }
  }

  getStartPose(gridIndex: number): { x: number; z: number; heading: number } {
    const row = Math.floor(gridIndex / 2)
    const side = gridIndex % 2 === 0 ? -1 : 1
    const t = 0.012 + row * 0.018
    const s = this.sample(t)
    const lateral = side * Math.min(this.def.vehicle === 'rally' ? 4.2 : 3.2, this.halfWidth * 0.28)
    return {
      x: s.position.x + s.normal.x * lateral,
      z: s.position.z + s.normal.z * lateral,
      heading: Math.atan2(s.tangent.x, s.tangent.z),
    }
  }
}
