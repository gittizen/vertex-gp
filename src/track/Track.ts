import * as THREE from 'three'
import {
  groundMap,
  matAsphalt,
  matAsphaltShoulder,
  matCityRoad,
  matGround,
  matLambert,
  matRoadMark,
  normalizeAsphaltColor,
  plasterMap,
  shadeRoad,
} from '../render/Materials'
import { createSkyBackdrop } from '../render/SkyBackdrop'
import type { DecorLevel } from '../render/AtmosphereSettings'
import type { TrackDef } from './TrackDefs'
import { createVariedHouse } from './HouseKit'

export type TrackSample = {
  position: THREE.Vector3
  tangent: THREE.Vector3
  normal: THREE.Vector3
  t: number
}

type LutPoint = { x: number; y: number; z: number; nx: number; nz: number; tx: number; tz: number }

/** Obdélníková rampa / kicker — launch při průjezdu. */
export type JumpPad = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** Vertikální složka skoku (m/s při 1 m/s rychlosti) */
  launch: number
  /** Extra přední boost */
  boost: number
  /** Minimální |speed| pro odraz */
  minSpeed: number
}

export class Track {
  readonly def: TrackDef
  readonly curve: THREE.CatmullRomCurve3
  readonly halfWidth: number
  readonly group = new THREE.Group()
  readonly checkpoints: THREE.Vector3[] = []
  readonly length: number
  readonly jumpPads: JumpPad[] = []
  private readonly scene: THREE.Scene
  private readonly lut: LutPoint[] = []
  private readonly lutN: number
  private readonly tmpPos = new THREE.Vector3()
  private readonly tmpTan = new THREE.Vector3()
  private readonly decorRoot = new THREE.Group()
  /** Vzdálené hory + mraky (mimo decor toggle — pořád vidět). */
  skyBackdrop: THREE.Group | null = null
  /** Skutečná světla lamp (city / plaza) — max pár kusů kvůli FPS. */
  private readonly sceneLights: THREE.PointLight[] = []
  /** Override tempa AI (např. po změně vozidla). */
  aiSpeedMult: number
  /** Výška středu asfaltu nad curve Y — musí sedět mesh i surfaceYAt. */
  private readonly roadLift = 0.14

  constructor(scene: THREE.Scene, def: TrackDef) {
    this.scene = scene
    this.def = def
    this.aiSpeedMult = def.aiSpeedMult
    this.halfWidth = def.halfWidth
    // Bankovaný ovál: kratší LUT stačí (velký R); stage potřebuje hustší
    this.lutN = def.loop ? ((def.bankAngleDeg ?? 0) > 0.05 ? 128 : 160) : 320
    const loop = def.loop
    const pts = def.points.map(([x, z], i) => {
      const y = def.heights?.[i] ?? 0
      return new THREE.Vector3(x, y, z)
    })
    const curveType = def.heights ? 'centripetal' : 'catmullrom'
    this.curve = new THREE.CatmullRomCurve3(pts, loop, curveType, def.tension)
    this.length = this.curve.getLength()
    this.buildLut()
    this.buildMeshes()
    this.buildCheckpoints()
    this.decorRoot.name = 'worldDecor'
    this.group.add(this.decorRoot)
    this.addWorld()
    this.addRoadsideNature()
    this.enableWorldShadows()
    this.addSkyBody()
    this.addSkyBackdrop()
    scene.add(this.group)
  }

  /** Tráva/keře/kameny — vždy mimo asfalt (Námko mělo zelené „v silnici“). */
  private addRoadsideNature(): void {
    if (this.def.sandbox || this.def.world === 'city' || this.def.world === 'plaza') return
    // Kasárny / Vodochody / Hrubý / Námko — vlastní dekorace (roadside dřív lezl do asfaltu)
    if (
      this.def.id === 'kasarny' ||
      this.def.id === 'vodochody' ||
      this.def.id === 'hruby' ||
      this.def.id === 'klecany'
    ) {
      return
    }
    // Serpentýny — vlásenky: žádná tráva/keře na asfalt (dřív „zelený plácek“)
    if (this.def.id === 'serpentiny') return
    // Námko = hustý okruh → jen kameny dál od hrany, žádné keře do zatáček
    const tight = this.def.id === 'klecany'
    const climb = this.def.world === 'climb' || !!this.def.heights
    const grass = matLambert(this.def.id === 'hruby' ? 0x3a5230 : 0x3a5230)
    const dry = matLambert(0x6a5a38)
    const bush = matLambert(0x2a4024)
    const rock = matLambert(0x6a6860)
    // Námko: žádné roadside objekty na asfalt — jen dál od hrany, méně kusů
    const n = tight ? 10 : climb ? 28 : this.def.loop ? 36 : 44
    const clear = this.halfWidth + (tight ? 11 : climb ? 7 : 6)
    for (let i = 0; i < n; i++) {
      const s = this.sample((i + 0.37) / n)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const footprint = tight ? 2.2 : 1.4
      const lat = this.safeLateral(s, side, footprint)
      if (lat < clear) continue
      const x = s.position.x + s.normal.x * lat * side
      const z = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(x, z, s.position.y) < clear) continue
      const y = this.settleY(x, z)
      const kind = tight ? 5 + (i % 2) : i % 7
      if (kind < 3) {
        const tuft = new THREE.Mesh(
          new THREE.ConeGeometry(0.28 + (i % 3) * 0.1, 0.55 + (i % 2) * 0.2, 5),
          i % 2 ? grass : dry,
        )
        tuft.position.set(x, y + 0.22, z)
        tuft.rotation.y = (i * 0.7) % Math.PI
        this.group.add(tuft)
      } else if (kind < 5) {
        const shrub = new THREE.Mesh(new THREE.SphereGeometry(0.45 + (i % 3) * 0.12, 6, 5), bush)
        shrub.position.set(x, y + 0.32, z)
        shrub.scale.set(1.1, 0.7, 1)
        this.group.add(shrub)
      } else {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22 + (i % 4) * 0.06, 0), rock)
        stone.position.set(x, y + 0.1, z)
        stone.rotation.set(i * 0.3, i * 0.5, i * 0.2)
        this.group.add(stone)
      }
    }
  }

  /**
   * Stíny jen z „objektů“ (budovy, stromy, auta…), nikdy z terénu/pásů u silnice.
   * BufferGeometry berm/apron/fill + castShadow = z-fight a „mizící asfalt“ (Hrubý).
   */
  private enableWorldShadows(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      m.receiveShadow = true
      m.castShadow = false
      const name = m.name || ''
      if (
        name === 'road' ||
        name.startsWith('cloud') ||
        name === 'horizonHaze' ||
        name.startsWith('distantMountains') ||
        m.userData.noCastShadow
      ) {
        return
      }
      const g = m.geometry
      const solid =
        g instanceof THREE.BoxGeometry ||
        g instanceof THREE.ConeGeometry ||
        g instanceof THREE.SphereGeometry ||
        g instanceof THREE.CylinderGeometry ||
        g instanceof THREE.DodecahedronGeometry ||
        g instanceof THREE.TorusGeometry
      if (solid) m.castShadow = true
    })
  }

  private addSkyBackdrop(): void {
    const mid = this.def.sandbox ? new THREE.Vector3(0, 0, 0) : this.sample(0.5).position.clone()
    mid.y = 0
    // Dosah tratě od středu — etapy (Novostavby) sahají dál než default radius hor
    let trackReach = 0
    if (!this.def.sandbox) {
      const n = this.def.loop ? 24 : 48
      for (let i = 0; i <= n; i++) {
        const p = this.sample(i / n).position
        trackReach = Math.max(trackReach, Math.hypot(p.x - mid.x, p.z - mid.z))
      }
    }
    this.skyBackdrop = createSkyBackdrop(this.def, mid, { trackReach })
    this.group.add(this.skyBackdrop)
  }

  dispose(): void {
    // Nejdřív platné pozadí — shared sky texturu nedisposovat (cache)
    const prevBg = this.scene.background
    this.scene.background = new THREE.Color(this.def.theme.sky)
    if (prevBg instanceof THREE.Texture && !prevBg.userData.sharedSky) prevBg.dispose()
    this.scene.fog = this.scene.fog // no-op keep; applyTheme nastaví znovu
    this.skyBackdrop = null
    for (const light of this.sceneLights) {
      light.parent?.remove(light)
      light.dispose()
    }
    this.sceneLights.length = 0
    this.scene.remove(this.group)
    const seenGeo = new Set<THREE.BufferGeometry>()
    const seenMat = new Set<THREE.Material>()
    this.group.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments)) {
        return
      }
      if (!seenGeo.has(obj.geometry)) {
        seenGeo.add(obj.geometry)
        obj.geometry.dispose()
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        if (seenMat.has(m)) continue
        seenMat.add(m)
        m.dispose()
      }
    })
  }

  setDecorQuality(level: DecorLevel): void {
    if (level === 'off') {
      this.decorRoot.visible = false
      return
    }
    this.decorRoot.visible = true
    this.decorRoot.children.forEach((child, i) => {
      // simple = každá druhá dekorace; rich = vše
      child.visible = level === 'rich' || i % 2 === 0
    })
  }

  private buildLut(): void {
    const n = this.lutN
    for (let i = 0; i < n; i++) {
      const t = this.def.loop ? i / n : i / (n - 1)
      const p = this.curve.getPointAt(Math.min(1, t))
      const tan = this.curve.getTangentAt(Math.min(1, t)).normalize()
      this.lut.push({
        x: p.x,
        y: p.y,
        z: p.z,
        nx: -tan.z,
        nz: tan.x,
        tx: tan.x,
        tz: tan.z,
      })
    }
  }

  private sideNormal(tangent: THREE.Vector3): THREE.Vector3 {
    return new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
  }

  /** Nejbližší bod středové linie (pro výšku terénu / clearance). */
  private nearestLut(x: number, z: number): LutPoint {
    let best = this.lut[0]!
    let bestD = Infinity
    for (const p of this.lut) {
      const d = (x - p.x) * (x - p.x) + (z - p.z) * (z - p.z)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /**
   * Výška „země“ v bodě — u tratě kopíruje profil, dál klesá na flat ground.
   * Ať domy/stromy nesedí ve vzduchu nad zeleným diskem.
   */
  /** Organický micro-relief (deterministický) — ne flat deska. */
  private groundNoise(x: number, z: number): number {
    return (
      Math.sin(x * 0.085 + z * 0.05) * 0.22 +
      Math.cos(z * 0.11 - x * 0.04) * 0.16 +
      Math.sin((x + z) * 0.031) * 0.35 +
      Math.sin(x * 0.27) * Math.cos(z * 0.23) * 0.12
    )
  }

  /** Terasa/svahy jako Klecánek — domy nesedí ve vzduchu (60+ fps). */
  private usesValleyTerrace(): boolean {
    const id = this.def.id
    return (
      id === 'klecanek' ||
      id === 'mexiku' ||
      id === 'kasarny' ||
      id === 'klecany' ||
      id === 'zlaty'
    )
  }

  /** Bank: vnitřní hrana na roadLift, střed + raise, vnější 2× raise — ne utopení. */
  private bankRaise(): number {
    const deg = this.def.bankAngleDeg ?? 0
    if (deg < 0.05) return 0
    return this.halfWidth * Math.tan((deg * Math.PI) / 180)
  }

  private terrainYAt(x: number, z: number, roadLift = this.roadLift, groundY = -0.02): number {
    const p = this.nearestLut(x, z)
    const dist = Math.hypot(x - p.x, z - p.z)
    const raise = this.bankRaise()
    // U bankovaného oválu crest = výška středu (ne vnitřní díra)
    let crest = p.y + roadLift + raise
    if (raise > 0.001 && dist <= this.halfWidth + 6) {
      const olen = Math.hypot(p.x, p.z) || 1
      const nOut = (p.nx * p.x + p.nz * p.z) / olen
      const lat = (x - p.x) * p.nx + (z - p.z) * p.nz
      crest = p.y + roadLift + raise + nOut * lat * (raise / this.halfWidth)
    }
    const valley = this.usesValleyTerrace()
    const forest = this.def.id === 'serpentiny'
    // Údolí / terasa vedle silnice drží výšku asfaltu (domy/bloky nesedí na špejlích)
    const roadClear = this.halfWidth + 0.25
    const bermOuter = this.halfWidth + (valley || forest ? 7.5 : 5.2)
    const midBank = this.halfWidth + (valley ? 34 : forest ? 28 : 18)
    const fade = this.halfWidth + (valley ? 120 : forest ? 100 : 160)
    const noise = this.groundNoise(x, z)
    // Pod asfaltem mírně níž — bez díry, bez z-fightu; noise až dál od hrany
    if (dist <= roadClear) return crest - 0.08
    if (dist <= bermOuter) {
      const u = (dist - roadClear) / Math.max(0.01, bermOuter - roadClear)
      const s = u * u * (3 - 2 * u)
      const edge = crest - 0.05
      const outer =
        valley || forest
          ? crest - 0.02 + noise * 0.1 * s
          : crest * 0.55 + groundY * 0.45 + noise * 0.08 * s
      return edge * (1 - s) + outer * s
    }
    if (dist <= midBank) {
      const u = (dist - bermOuter) / Math.max(0.01, midBank - bermOuter)
      const s = u * u * (3 - 2 * u)
      if (valley || forest) {
        // Terasa pod domy / les ≈ výška vozovky, pak mírný spád
        const inner = crest - 0.01 + noise * (forest ? 0.28 : 0.14)
        const outer = crest * (forest ? 0.7 : 0.78) + groundY * (forest ? 0.3 : 0.22) + noise * 0.45
        return inner * (1 - s) + outer * s
      }
      const inner = crest * 0.55 + groundY * 0.45 + noise * 0.35
      const outer = crest * 0.18 + groundY * 0.82 + noise * 0.55
      return inner * (1 - s) + outer * s
    }
    if (dist >= fade) {
      if (!valley && !forest) return groundY + noise * 0.45
      // Vzdálené úbočí / lesní hřeben
      const ridge = Math.abs(Math.sin(x * 0.018 + z * 0.014)) * (forest ? 4.2 : 3.2) + noise * 0.8
      return groundY + ridge + (forest ? crest * 0.08 : 0)
    }
    const t = (dist - midBank) / (fade - midBank)
    const s = t * t * (3 - 2 * t)
    if (valley || forest) {
      const bermEdge = crest * 0.55 + groundY * 0.45 + noise * 0.5
      const outerHill =
        groundY +
        Math.abs(Math.sin(x * 0.02 + z * 0.016)) * (forest ? 5.2 : 4.5) +
        crest * 0.12 +
        noise * 0.7
      return bermEdge * (1 - s) + outerHill * s
    }
    const bermEdge = crest * 0.18 + groundY * 0.82 + noise * 0.55
    return bermEdge * (1 - s) + (groundY + noise * 0.45) * s
  }

  /** Usadí objekt na terén (spodek na zemi, ne levitace). */
  private settleY(x: number, z: number, sink = 0.04): number {
    return this.terrainYAt(x, z) - sink
  }

  /**
   * Svahy údolí / terasy (málo meshů) — Klecánek, Mexiko, Kasárny, Zlatý.
   * Domy/bloky sedí v terénu, ne na špejlích; 60+ fps.
   */
  private addValleyBanks(
    mat: THREE.Material,
    rockMat: THREE.Material,
    opts?: { segs?: number; innerLat?: number; outerLat?: number },
  ): void {
    const segs = opts?.segs ?? 14
    const innerLat = opts?.innerLat ?? this.halfWidth + 12
    const outerLat = opts?.outerLat ?? this.halfWidth + 28
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < segs; i++) {
        const midT = (i + 0.5) / segs
        const s = this.sample(midT)
        for (const band of [
          { lat: innerLat, w: 16, hMul: 0.95, along: 22 },
          { lat: outerLat, w: 20, hMul: 1.2, along: 26 },
        ]) {
          const x = s.position.x + s.normal.x * band.lat * side
          const z = s.position.z + s.normal.z * band.lat * side
          // Střed + polovina šířky boxu musí být mimo asfalt
          if (this.minRoadDist(x, z, s.position.y) < this.halfWidth + band.w * 0.5 + 4) continue
          const ground = this.terrainYAt(x, z)
          const top = Math.max(ground, s.position.y * band.hMul + (side < 0 ? 0.35 : 0.12))
          const h = Math.max(1.4, top - ground + 1.4)
          const lobe = new THREE.Mesh(
            new THREE.BoxGeometry(band.w, h, band.along),
            i % 4 === 0 ? rockMat : mat,
          )
          lobe.position.set(x, ground + h * 0.4, z)
          lobe.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
          // Bez náklonu směrem nad asfalt
          lobe.rotation.z = 0
          lobe.castShadow = false
          lobe.receiveShadow = true
          this.decorRoot.add(lobe)
        }
      }
    }
  }

  /** Serpentýny Řež — hustý les kolem vlásenek (InstancedMesh = 60+ fps). */
  private addSerpentinyForest(trunkMat: THREE.Material, leafMat: THREE.Material): void {
    const dummy = new THREE.Object3D()
    const boleGeo = new THREE.CylinderGeometry(0.2, 0.32, 3.4, 5)
    const canopyGeo = new THREE.SphereGeometry(2.1, 5, 5)
    const n = 48
    const boles = new THREE.InstancedMesh(boleGeo, trunkMat, n)
    const canopies = new THREE.InstancedMesh(canopyGeo, leafMat, n)
    let placed = 0
    for (let i = 0; i < n * 2 && placed < n; i++) {
      const t = (i * 0.37) % 1
      const s = this.sample(t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const dist = this.halfWidth + 9 + (i % 5) * 3.2
      const tx = s.position.x + s.normal.x * dist * side
      const tz = s.position.z + s.normal.z * dist * side
      if (this.minRoadDist(tx, tz, s.position.y) < this.halfWidth + 9.5) continue
      const gy = this.settleY(tx, tz)
      const scale = 0.85 + (i % 4) * 0.12
      dummy.position.set(tx, gy + 1.7 * scale, tz)
      dummy.scale.setScalar(scale)
      dummy.rotation.set(0, (i * 0.7) % Math.PI, 0)
      dummy.updateMatrix()
      boles.setMatrixAt(placed, dummy.matrix)
      dummy.position.y = gy + 3.6 * scale
      dummy.scale.setScalar(scale * (0.9 + (i % 3) * 0.08))
      dummy.updateMatrix()
      canopies.setMatrixAt(placed, dummy.matrix)
      placed++
    }
    boles.count = placed
    canopies.count = placed
    boles.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    boles.castShadow = false
    canopies.castShadow = false
    this.decorRoot.add(boles, canopies)

    // Podrost — nízké keře (1 draw)
    const bushGeo = new THREE.SphereGeometry(0.9, 4, 3)
    const bushMat = matLambert(0x243820)
    const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 24)
    let bi = 0
    for (let i = 0; i < 40 && bi < 24; i++) {
      const s = this.sample((i + 0.2) / 40)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const dist = this.halfWidth + 7.5 + (i % 3) * 2.2
      const bx = s.position.x + s.normal.x * dist * side
      const bz = s.position.z + s.normal.z * dist * side
      if (this.minRoadDist(bx, bz, s.position.y) < this.halfWidth + 6.5) continue
      dummy.position.set(bx, this.settleY(bx, bz) + 0.35, bz)
      dummy.scale.setScalar(0.8 + (i % 3) * 0.2)
      dummy.rotation.set(0, i, 0)
      dummy.updateMatrix()
      bushes.setMatrixAt(bi++, dummy.matrix)
    }
    bushes.count = bi
    bushes.instanceMatrix.needsUpdate = true
    this.decorRoot.add(bushes)
  }

  /**
   * Hustý plášť terénu — startuje u bermy, víc prstenců = méně děr vedle silnice.
   * Vždy (ne jen u heights), ať i flat tratě mají okolí.
   */
  private addTerrainBlanket(
    mat: THREE.Material,
    groundY: number,
    roadLift: number,
  ): void {
    // Heights/climb/city: méně segmentů = méně hitch (Do Klecánek / Mexiko / Kasárny / Serpentýny)
    const city = this.def.world === 'city'
    const climbHeights = !!this.def.heights
    const valleyLite = this.usesValleyTerrace() || this.def.id === 'serpentiny'
    const heavyDecor =
      this.def.id === 'mexiku' ||
      this.def.id === 'kasarny' ||
      this.def.id === 'klecanek' ||
      this.def.id === 'serpentiny'
    const segs = city
      ? 56
      : heavyDecor
        ? 64
        : valleyLite
          ? 68
          : this.def.world === 'town' || this.def.loop
            ? 72
            : climbHeights
              ? 80
              : 128
    const rings = city
      ? [
          this.halfWidth + 3.4,
          this.halfWidth + 10,
          this.halfWidth + 22,
          this.halfWidth + 48,
          this.halfWidth + 95,
        ]
      : valleyLite
        ? [
            this.halfWidth + 3.4,
            this.halfWidth + 7,
            this.halfWidth + 14,
            this.halfWidth + 26,
            this.halfWidth + 44,
            this.halfWidth + 70,
          ]
        : this.def.world === 'town' || this.def.loop
          ? [
              // Kratší prstence — na okruhu dlouhé ringy = rampa přes sousední asfalt
              this.halfWidth + 3.4,
              this.halfWidth + 7,
              this.halfWidth + 12,
              this.halfWidth + 20,
              this.halfWidth + 32,
              this.halfWidth + 48,
            ]
          : [
              this.halfWidth + 3.4,
              this.halfWidth + 5.5,
              this.halfWidth + 9,
              this.halfWidth + 14,
              this.halfWidth + 22,
              this.halfWidth + 34,
              this.halfWidth + 50,
              this.halfWidth + 72,
              this.halfWidth + 100,
              this.halfWidth + 140,
            ]
    const cols = rings.length

    // Okruh: blanket se musí zastavit PŘED cizím asfaltem (ne rampa skrz silnici)
    const asphaltCeil = this.halfWidth + 1.25
    for (const side of [-1, 1] as const) {
      const pos: number[] = []
      const idx: number[] = []
      const uvs: number[] = []
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const s = this.sample(Math.min(1, t))
        // Největší laterál, který ještě není na (jiném) asfaltu
        let maxClear = rings[cols - 1]!
        for (let probe = rings[0]!; probe <= rings[cols - 1]!; probe += 1.5) {
          const px = s.position.x + s.normal.x * probe * side
          const pz = s.position.z + s.normal.z * probe * side
          if (this.minRoadDist(px, pz) < asphaltCeil) {
            maxClear = Math.max(rings[0]!, probe - 1.5)
            break
          }
        }
        for (let r = 0; r < cols; r++) {
          const lat = Math.min(rings[r]!, maxClear)
          const x = s.position.x + s.normal.x * lat * side
          const z = s.position.z + s.normal.z * lat * side
          const y = this.terrainYAt(x, z, roadLift, groundY)
          pos.push(x, y, z)
          uvs.push(x * 0.04, z * 0.04)
        }
      }
      for (let i = 0; i < segs; i++) {
        for (let r = 0; r < cols - 1; r++) {
          const a = i * cols + r
          const b = a + 1
          const c = a + cols
          const d = c + 1
          if (side > 0) idx.push(a, c, b, b, c, d)
          else idx.push(a, b, c, b, d, c)
        }
      }
      if (idx.length < 3) continue
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.name = 'terrainBlanket'
      mesh.receiveShadow = this.def.world !== 'rally'
      mesh.castShadow = false
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }
  }

  private buildMeshes(): void {
    if (this.def.sandbox) {
      this.buildSandboxMeshes()
      return
    }
    const banked = (this.def.bankAngleDeg ?? 0) > 0.05
    // City/loop/bank: méně segmentů = méně hitch; climb má víc kvůli výškám
    const segments =
      this.def.world === 'city'
        ? 140
        : banked
          ? 160
          : this.def.world === 'rally'
            ? 260
            : this.def.loop
              ? 220
              : this.def.heights
                ? 300
                : 400
    const theme = this.def.theme
    const roadPositions: number[] = []
    const roadIndices: number[] = []
    const barrierL: number[] = []
    const barrierR: number[] = []
    const world = this.def.world
    const wallH = world === 'city' ? 0.45 : 0.4
    const bermW = 5.2
    const groundY = -0.02
    const roadLift = this.roadLift
    const bermLpos: number[] = []
    const bermRpos: number[] = []
    const shoulderLpos: number[] = []
    const shoulderRpos: number[] = []
    const skirtLpos: number[] = []
    const skirtRpos: number[] = []
    const apronLpos: number[] = []
    const apronRpos: number[] = []
    const apron2Lpos: number[] = []
    const apron2Rpos: number[] = []
    const fillPos: number[] = []
    const roadUvs: number[] = []
    let along = 0
    let prevPt: THREE.Vector3 | null = null

    const bankRad = ((this.def.bankAngleDeg ?? 0) * Math.PI) / 180
    const bankTan = Math.tan(bankRad)
    // Zvednout střed o raise → vnitřní hrana zůstane na roadLift (ne −4 m pod zemí)
    const raise = bankTan > 0.001 ? this.halfWidth * bankTan : 0

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const p = this.curve.getPointAt(Math.min(1, t))
      const tangent = this.curve.getTangentAt(Math.min(1, t)).normalize()
      const n = this.sideNormal(tangent)
      const y = p.y + roadLift + raise
      const left = p.clone().addScaledVector(n, this.halfWidth)
      const right = p.clone().addScaledVector(n, -this.halfWidth)
      // Bank: vnější hrana výš, spád dovnitř (NASCAR) — podle směru normály vs. střed oválu
      let yL = y
      let yR = y
      if (bankTan > 0.001) {
        const olen = Math.hypot(p.x, p.z) || 1
        const nOut = (n.x * p.x + n.z * p.z) / olen
        yL = y + nOut * this.halfWidth * bankTan
        yR = y - nOut * this.halfWidth * bankTan
      }
      roadPositions.push(left.x, yL, left.z, right.x, yR, right.z)
      if (prevPt) along += p.distanceTo(prevPt)
      prevPt = p.clone()
      const v = along * 0.085
      roadUvs.push(0, v, 1, v)

      // Fill pod vozovkou sleduje crest (ne flat groundY) — žádná černá díra
      const underL = yL - 0.22
      const underR = yR - 0.22
      fillPos.push(left.x, underL, left.z, right.x, underR, right.z)

      const tNorm = i / segments
      const shW = 1.05
      // Na okruhu stáhni krajnici/bermu, když by pás lezl přes cizí asfalt (cíl Námka)
      const safeOutLat = (want: number, side: 1 | -1) => {
        if (!this.def.loop) return want
        let use = want
        for (let k = 0; k < 10; k++) {
          const tx = p.x + n.x * use * side
          const tz = p.z + n.z * use * side
          if (!this.barrierCutsForeignAsphalt(tx, tz, tNorm, 0.55)) return use
          use = Math.max(this.halfWidth + 0.15, use - 0.85)
        }
        return this.halfWidth + 0.12
      }
      const lShLat = safeOutLat(this.halfWidth + shW, 1)
      const rShLat = safeOutLat(this.halfWidth + shW, -1)
      const lShIn = p.clone().addScaledVector(n, this.halfWidth - 0.02)
      const lShOut = p.clone().addScaledVector(n, lShLat)
      const rShIn = p.clone().addScaledVector(n, -(this.halfWidth - 0.02))
      const rShOut = p.clone().addScaledVector(n, -rShLat)
      // Shoulder nad cizím asfaltem = schovej pod vozovku (žádný „okraj ve vzduchu“)
      const shYL0 = yL - 0.01
      const shYR0 = yR - 0.01
      const shYL = this.barrierCutsForeignAsphalt(lShOut.x, lShOut.z, tNorm, 0.55) ? yL - 0.35 : shYL0
      const shYR = this.barrierCutsForeignAsphalt(rShOut.x, rShOut.z, tNorm, 0.55) ? yR - 0.35 : shYR0
      shoulderLpos.push(lShOut.x, shYL, lShOut.z, lShIn.x, shYL0, lShIn.z)
      shoulderRpos.push(rShIn.x, shYR0, rShIn.z, rShOut.x, shYR, rShOut.z)

      const lBermLat = safeOutLat(this.halfWidth + bermW, 1)
      const rBermLat = safeOutLat(this.halfWidth + bermW, -1)
      const lIn = p.clone().addScaledVector(n, Math.min(lShLat, lBermLat))
      const lOut = p.clone().addScaledVector(n, lBermLat)
      const rIn = p.clone().addScaledVector(n, -Math.min(rShLat, rBermLat))
      const rOut = p.clone().addScaledVector(n, -rBermLat)
      // Berm/apron Y: na okruhu flat drop (Námko); bankovaný ovál → spád k zemi (ne visutý plášť)
      const bermCutL = this.barrierCutsForeignAsphalt(lOut.x, lOut.z, tNorm, 0.55)
      const bermCutR = this.barrierCutsForeignAsphalt(rOut.x, rOut.z, tNorm, 0.55)
      const bermOutY = (ox: number, oz: number, edgeY: number, cut: boolean) => {
        if (cut) return edgeY - 0.4
        if (banked) return Math.max(groundY, edgeY * 0.35 + groundY * 0.65)
        if (this.def.loop) return edgeY - 0.1
        return this.terrainYAt(ox, oz, roadLift, groundY)
      }
      const lOutY = bermOutY(lOut.x, lOut.z, yL, bermCutL)
      const rOutY = bermOutY(rOut.x, rOut.z, yR, bermCutR)
      const lInY = bermCutL ? yL - 0.4 : yL - 0.06
      const rInY = bermCutR ? yR - 0.4 : yR - 0.06
      bermLpos.push(lOut.x, lOutY, lOut.z, lIn.x, lInY, lIn.z)
      bermRpos.push(rIn.x, rInY, rIn.z, rOut.x, rOutY, rOut.z)

      // Skirt jen krátký (k under), ne až na flat ground — méně „prosklené stěny“
      skirtLpos.push(left.x, yL, left.z, left.x, underL, left.z)
      skirtRpos.push(right.x, underR, right.z, right.x, yR, right.z)

      const apronW = this.def.loop ? bermW + 4 : bermW + 7
      const apron2W = this.def.loop ? bermW + 8 : bermW + 16
      const sideLat = (lat: number, side: 1 | -1) => {
        const use = safeOutLat(lat, side)
        return p.clone().addScaledVector(n, use * side)
      }
      const lApron = sideLat(this.halfWidth + apronW, 1)
      const rApron = sideLat(this.halfWidth + apronW, -1)
      const lApron2 = sideLat(this.halfWidth + apron2W, 1)
      const rApron2 = sideLat(this.halfWidth + apron2W, -1)
      const apronEdgeY = (edgeY: number, drop: number) =>
        banked ? Math.max(groundY, edgeY * drop + groundY * (1 - drop)) : this.def.loop ? edgeY - 0.14 : undefined
      const apronYL = apronEdgeY(yL, 0.2)
      const apronYR = apronEdgeY(yR, 0.2)
      const apron2YL = apronEdgeY(yL, 0.08)
      const apron2YR = apronEdgeY(yR, 0.08)
      const buryApron = (x: number, z: number, base: number, edgeY: number) =>
        this.barrierCutsForeignAsphalt(x, z, tNorm, 0.55) ? edgeY - 0.42 : base
      const lApronY = buryApron(
        lApron.x,
        lApron.z,
        apronYL ?? this.terrainYAt(lApron.x, lApron.z, roadLift, groundY),
        yL,
      )
      const rApronY = buryApron(
        rApron.x,
        rApron.z,
        apronYR ?? this.terrainYAt(rApron.x, rApron.z, roadLift, groundY),
        yR,
      )
      const lApron2Y = buryApron(
        lApron2.x,
        lApron2.z,
        apron2YL ?? this.terrainYAt(lApron2.x, lApron2.z, roadLift, groundY),
        yL,
      )
      const rApron2Y = buryApron(
        rApron2.x,
        rApron2.z,
        apron2YR ?? this.terrainYAt(rApron2.x, rApron2.z, roadLift, groundY),
        yR,
      )
      apronLpos.push(lApron.x, lApronY, lApron.z, lOut.x, lOutY, lOut.z)
      apronRpos.push(rOut.x, rOutY, rOut.z, rApron.x, rApronY, rApron.z)
      apron2Lpos.push(lApron2.x, lApron2Y, lApron2.z, lApron.x, lApronY, lApron.z)
      apron2Rpos.push(rApron.x, rApronY, rApron.z, rApron2.x, rApron2Y, rApron2.z)

      // Zábradlí: při průniku s cizím asfaltem vynech (h=0 + skip ve ribbonu)
      const bxL = left.x + n.x * 0.2
      const bzL = left.z + n.z * 0.2
      const bxR = right.x - n.x * 0.2
      const bzR = right.z - n.z * 0.2
      const hL = this.barrierCutsForeignAsphalt(bxL, bzL, tNorm, 0.35) ? 0 : wallH
      const hR = this.barrierCutsForeignAsphalt(bxR, bzR, tNorm, 0.35) ? 0 : wallH
      barrierL.push(bxL, yL, bzL, bxL, yL + hL, bzL)
      barrierR.push(bxR, yR, bzR, bxR, yR + hR, bzR)

      if (i < segments) {
        const a = i * 2
        // Winding → normály nahoru (FrontSide by jinak silnici sežral)
        roadIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }

    const roadGeo = new THREE.BufferGeometry()
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3))
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2))
    roadGeo.setIndex(roadIndices)
    roadGeo.computeVertexNormals()
    const roadMat = world === 'city' ? matCityRoad(theme.road) : matAsphalt(theme.road)
    roadMat.polygonOffset = true
    roadMat.polygonOffsetFactor = -1
    roadMat.polygonOffsetUnits = -1
    const roadMesh = new THREE.Mesh(roadGeo, roadMat)
    roadMesh.name = 'roadAsphalt'
    roadMesh.userData.roadSurface = true
    roadMesh.name = 'road'
    roadMesh.renderOrder = 2
    roadMesh.receiveShadow = true
    roadMesh.castShadow = false
    roadMesh.userData.noCastShadow = true
    this.group.add(roadMesh)

    const gMap = groundMap(world, this.def.id)
    // Berm u silnice = prach/štěrk (ne tráva), ať „zelené“ nevleze do asfaltu
    const bermHex =
      world === 'city'
        ? 0x08090e
        : world === 'plaza'
          ? 0x5a6068
          : world === 'rally'
            ? 0x5a4a32
            : this.def.id === 'klecany'
              ? 0x5a5848
              : this.def.id === 'kasarny' || this.def.id === 'mexiku'
                ? 0x6a6a66
                : this.def.id === 'hruby'
                  ? 0x6a6a40
                  : this.def.id === 'vodochody'
                    ? 0x6a7a58
                    : 0x4a4a42
    const bermMat = matGround(bermHex, { map: gMap })
    bermMat.polygonOffset = true
    bermMat.polygonOffsetFactor = 2
    bermMat.polygonOffsetUnits = 2
    const bermDark = matGround(
      world === 'city'
        ? 0x0a0c12
        : this.def.id === 'klecany'
          ? 0x3a3830
          : this.def.id === 'mexiku'
            ? 0x4a4a48
            : 0x3a3a42,
    )
    bermDark.polygonOffset = true
    bermDark.polygonOffsetFactor = 1
    bermDark.polygonOffsetUnits = 1
    const shoulderMat =
      world === 'city'
        ? matCityRoad(shadeRoad(theme.road, 0.82))
        : matAsphaltShoulder(theme.road)
    // Fill pod tratí — skoro barva silnice, ne černá / zelená
    const fillMat =
      world === 'city'
        ? matCityRoad(shadeRoad(theme.road, 0.9))
        : matAsphalt(shadeRoad(normalizeAsphaltColor(theme.road), 0.88))
    const addStrip = (pos: number[], mat: THREE.Material, order = 0) => {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setIndex(roadIndices)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = order
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }
    addStrip(fillPos, fillMat, 0)
    addStrip(bermLpos, bermMat, 0)
    addStrip(bermRpos, bermMat, 0)
    addStrip(apronLpos, bermMat, 0)
    addStrip(apronRpos, bermMat, 0)
    addStrip(apron2Lpos, bermMat, 0)
    addStrip(apron2Rpos, bermMat, 0)
    addStrip(skirtLpos, bermDark, 1)
    addStrip(skirtRpos, bermDark, 1)
    addStrip(shoulderLpos, shoulderMat, 1)
    addStrip(shoulderRpos, shoulderMat, 1)

    const groundSize =
      (world === 'rally' || world === 'climb') && !this.def.loop ? 2400 : world === 'town' ? 720 : 560
    const farMat = matGround(theme.ground, { map: gMap })
    const groundSegs =
      this.usesValleyTerrace() || this.def.id === 'serpentiny' ? 32 : 48
    const ground = new THREE.Mesh(new THREE.CircleGeometry(groundSize, groundSegs), farMat)
    ground.name = 'farGround'
    ground.rotation.x = -Math.PI / 2
    // Níže než berm — žádný „jezero“ pod tratí / z-fight se zelenou
    ground.position.y = groundY - 0.35
    // Rally (Novostavby): stíny na obřím groundu = černá kaše
    ground.receiveShadow = world !== 'rally'
    if ((world === 'rally' || world === 'climb') && !this.def.loop) {
      const mid = this.sample(0.5).position
      ground.position.set(mid.x, groundY - 0.35, mid.z)
    }
    this.group.add(ground)
    // City / Vodochody: vlastní deck — blanket = hitch + z-fight se runway
    if (world !== 'city' && this.def.id !== 'vodochody') {
      this.addTerrainBlanket(farMat, groundY, roadLift)
    }

    this.addRoadMarkings()

    this.addBarrierRibbon(barrierL, theme.barrierL)
    this.addBarrierRibbon(barrierR, theme.barrierR)

    const start = this.sample(0)
    for (let i = -3; i <= 3; i++) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth / 3.5, 0.04, 1.2),
        matLambert(i % 2 === 0 ? 0xf0f0f0 : 0x151515),
      )
      const sx = start.position.x + start.normal.x * i * (this.halfWidth / 3.5)
      const sz = start.position.z + start.normal.z * i * (this.halfWidth / 3.5)
      stripe.position.set(sx, this.surfaceYAt(sx, sz, 0) + 0.08, sz)
      stripe.rotation.order = 'YXZ'
      stripe.rotation.y = Math.atan2(start.tangent.x, start.tangent.z)
      stripe.rotation.z = this.bankRollAt(sx, sz, 0)
      this.group.add(stripe)
    }

    if (!this.def.loop) {
      this.addStageFinishGate()
    }
  }

  /** Volná plocha (Plácek) — velký asfaltový pad, bez závodní pásky. */
  private buildSandboxMeshes(): void {
    const theme = this.def.theme
    const b = this.def.sandboxBounds ?? { halfX: 170, halfZ: 110 }
    const padW = b.halfX * 2
    const padD = b.halfZ * 2

    const padY = 0.12
    // Fog vypnutý + polygonOffset — jinak černý z-fight / mlha na velké ploše
    const padMat = matAsphalt(theme.road)
    padMat.fog = false
    padMat.polygonOffset = true
    padMat.polygonOffsetFactor = -2
    padMat.polygonOffsetUnits = -2
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(padW, padD), padMat)
    pad.rotation.x = -Math.PI / 2
    pad.position.y = padY
    pad.renderOrder = 2
    pad.receiveShadow = true
    pad.castShadow = false
    pad.userData.noCastShadow = true
    this.group.add(pad)
    // Základ POD padem (ne koplanární) — žádný černý flicker
    const baseH = 0.1
    const padBase = new THREE.Mesh(
      new THREE.BoxGeometry(padW + 0.6, baseH, padD + 0.6),
      matGround(0x3a3a42),
    )
    padBase.position.y = padY - baseH * 0.5 - 0.02
    padBase.receiveShadow = true
    padBase.castShadow = false
    padBase.userData.noCastShadow = true
    this.group.add(padBase)

    // Světlé čáry — flat ribbon mesh nad padem
    const markY = padY + 0.04
    const stripeMat = matRoadMark(0xe8e8ec)
    const addStripe = (ax: number, az: number, bx: number, bz: number, halfW: number) => {
      const dx = bx - ax
      const dz = bz - az
      const len = Math.hypot(dx, dz) || 1
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2, 0.025, len), stripeMat)
      mesh.position.set((ax + bx) * 0.5, markY, (az + bz) * 0.5)
      mesh.rotation.y = Math.atan2(dx, dz)
      mesh.renderOrder = 3
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const x = (i / 3) * b.halfX * 0.85
      const z = (i / 3) * b.halfZ * 0.85
      addStripe(-b.halfX * 0.92, z, b.halfX * 0.92, z, 0.12)
      addStripe(x, -b.halfZ * 0.92, x, b.halfZ * 0.92, 0.12)
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(17.65, 18.35, 64), matRoadMark(0xffffff))
    ring.rotation.x = -Math.PI / 2
    ring.position.y = markY
    ring.renderOrder = 3
    ring.castShadow = false
    ring.receiveShadow = true
    ring.userData.noCastShadow = true
    this.group.add(ring)

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(560, 40),
      matGround(theme.ground, { map: groundMap('plaza', 'placek') }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.08
    ground.receiveShadow = true
    this.group.add(ground)

    // Nízký okraj plochy (vizuální curb)
    const curbH = 0.35
    const curbMat = matLambert(theme.barrierL)
    const edges: Array<[number, number, number, number]> = [
      [0, -b.halfZ - 0.4, padW + 1.2, 0.8],
      [0, b.halfZ + 0.4, padW + 1.2, 0.8],
      [-b.halfX - 0.4, 0, 0.8, padD + 1.2],
      [b.halfX + 0.4, 0, 0.8, padD + 1.2],
    ]
    for (const [cx, cz, w, d] of edges) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(w, curbH, d), curbMat)
      curb.position.set(cx, curbH * 0.5, cz)
      this.group.add(curb)
    }
  }

  /**
   * Markování — okraje + středová tratovací čára.
   * PODMÍNKA: každý okruh (loop) musí mít středové dash (racing line).
   */
  private addRoadMarkings(): void {
    const world = this.def.world
    const hw = this.halfWidth
    const markLift = 0.025
    const samples =
      world === 'city'
        ? 72
        : this.usesValleyTerrace() || this.def.id === 'serpentiny'
          ? 110
          : world === 'climb' || world === 'rally'
            ? 160
            : this.def.loop
              ? (this.def.bankAngleDeg ?? 0) > 0.05
                ? 140
                : 160
              : 140
    const edgeW = world === 'city' ? 0.2 : 0.14
    const dashW = world === 'city' ? 0.16 : 0.11

    const addRibbon = (pts: THREE.Vector3[], halfW: number, color: number, order = 3) => {
      if (pts.length < 2) return
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!
        const q = pts[Math.min(pts.length - 1, i + 1)]!
        const dx = q.x - p.x
        const dz = q.z - p.z
        const len = Math.hypot(dx, dz) || 1
        const nx = (-dz / len) * halfW
        const nz = (dx / len) * halfW
        pos.push(p.x + nx, p.y, p.z + nz, p.x - nx, p.y, p.z - nz)
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const a = i * 2
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      const mat = matRoadMark(color)
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = order
      mesh.castShadow = false
      mesh.receiveShadow = true
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }

    const markYAt = (x: number, z: number, hint: number) => this.surfaceYAt(x, z, hint) + markLift

    const solidL: THREE.Vector3[] = []
    const solidR: THREE.Vector3[] = []
    const flushEdgeRibbon = (side: 'L' | 'R') => {
      const pts = side === 'L' ? solidL : solidR
      if (pts.length >= 2) {
        addRibbon(pts.splice(0, pts.length), edgeW, world === 'city' ? 0xfff8e0 : 0xeef0f4)
      } else {
        pts.length = 0
      }
    }
    for (let i = 0; i <= samples; i++) {
      const tNorm = i / samples
      const s = this.sample(tNorm)
      const lx = s.position.x + s.normal.x * (hw - 0.32)
      const lz = s.position.z + s.normal.z * (hw - 0.32)
      const rx = s.position.x - s.normal.x * (hw - 0.32)
      const rz = s.position.z - s.normal.z * (hw - 0.32)
      const l = new THREE.Vector3(lx, markYAt(lx, lz, tNorm), lz)
      const r = new THREE.Vector3(rx, markYAt(rx, rz, tNorm), rz)
      // Na okruhu: přeruš okrajovou čáru, která by ležela v cizím asfaltu (cíl Námka)
      if (this.barrierCutsForeignAsphalt(l.x, l.z, tNorm, 0.2)) flushEdgeRibbon('L')
      else solidL.push(l)
      if (this.barrierCutsForeignAsphalt(r.x, r.z, tNorm, 0.2)) flushEdgeRibbon('R')
      else solidR.push(r)
    }
    flushEdgeRibbon('L')
    flushEdgeRibbon('R')

    // Středová tratovací čára — povinná na každém okruhu (i bankovaný ovál)
    const dashCol = world === 'city' ? 0xffd040 : world === 'rally' ? 0xe8d090 : 0xf2f2f6
    for (let i = 0; i < samples; i += 2) {
      const ta = i / samples
      const tb = Math.min(1, (i + 0.55) / samples)
      const a = this.sample(ta)
      const b = this.sample(tb)
      addRibbon(
        [
          new THREE.Vector3(a.position.x, markYAt(a.position.x, a.position.z, ta), a.position.z),
          new THREE.Vector3(b.position.x, markYAt(b.position.x, b.position.z, tb), b.position.z),
        ],
        dashW,
        dashCol,
        3,
      )
    }
  }

  private addSkyBody(): void {
    // Nikdy „míč u trati“ — jen vzdálený disk v nebi (sky gradient nese barvu)
    if (this.def.skyBody === 'moon' || this.def.world === 'city') {
      const moon = new THREE.Mesh(
        new THREE.SphereGeometry(12, 12, 12),
        matLambert(0xe8e8f0, { emissive: 0xd0d4e8, emissiveIntensity: 0.45 }),
      )
      moon.position.set(-280, 160, -220)
      this.group.add(moon)
      return
    }
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(22, 14, 14),
      matLambert(0xffc080, { emissive: 0xff9040, emissiveIntensity: 0.7 }),
    )
    // Daleko za obzorem — Námko / Hrubý / Kasárny / climb
    sun.position.set(480, 180, -520)
    this.group.add(sun)
  }

  private addWorld(): void {
    // Veškeré this.group.add během world buildu → dekorace (lze vypnout v nastavení)
    const savedAdd = this.group.add.bind(this.group)
    this.group.add = ((...objs: THREE.Object3D[]) => {
      for (const o of objs) this.decorRoot.add(o)
      return this.group
    }) as typeof this.group.add
    try {
      if (this.def.world === 'city') this.buildCity()
      else if (this.def.id === 'kasarny') this.buildKasarnySkate()
      else if (this.def.id === 'vodochody') this.buildVodochody()
      else if (this.def.id === 'hruby') this.buildHruby()
      else if (this.def.world === 'town') this.buildTown()
      else if (this.def.world === 'climb') {
        if (this.def.id === 'mexiku') this.buildMexiku()
        else this.buildClimb()
      } else if (this.def.world === 'plaza') this.buildPlaza()
      else this.buildRally()
      if (!this.def.loop && !this.def.sandbox) this.addStageFinishLandmark()
    } finally {
      this.group.add = savedAdd
    }
  }

  /** Cíl stage — jen sloupy vedle asfaltu (nic nad vozovkou). */
  private addStageFinishGate(): void {
    const fin = this.sample(1)
    const accent = this.def.theme.accent
    const fy = this.surfaceYAt(fin.position.x, fin.position.z, 1)
    for (const side of [-1, 1] as const) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.14, 2.6, 5),
        matLambert(0x3a3a3a),
      )
      const px = fin.position.x + fin.normal.x * (this.halfWidth + 1.1) * side
      const pz = fin.position.z + fin.normal.z * (this.halfWidth + 1.1) * side
      pole.position.set(px, fy + 1.3, pz)
      this.group.add(pole)
      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.32, 0.06),
        matLambert(accent, { emissive: accent, emissiveIntensity: 0.3 }),
      )
      flag.position.set(px, fy + 2.55, pz)
      this.group.add(flag)
    }
  }

  /**
   * Ukončení stage tratí — různá témata (náměstí / zákaz vjezdu / vyhlídka…), 60+ fps.
   * Klecánek už má hřbitov v buildClimb.
   */
  private addStageFinishLandmark(): void {
    const id = this.def.id
    if (id === 'klecanek') return
    const fin = this.sample(1)
    const yaw = Math.atan2(fin.tangent.x, fin.tangent.z)
    const n = fin.normal
    const place = (lat: number, along = 8) => {
      const x = fin.position.x + n.x * lat + fin.tangent.x * along
      const z = fin.position.z + n.z * lat + fin.tangent.z * along
      return { x, z, y: this.settleY(x, z) }
    }

    if (id === 'mexiku') {
      // Náměstíčko + zákaz vjezdu
      const pl = place(this.halfWidth + 16, 10)
      if (this.minRoadDist(pl.x, pl.z, fin.position.y) >= this.halfWidth + 10) {
        const plaza = new THREE.Mesh(
          new THREE.CylinderGeometry(7, 7, 0.1, 10),
          matLambert(0x7a7a76),
        )
        plaza.position.set(pl.x, pl.y + 0.04, pl.z)
        this.decorRoot.add(plaza)
      }
      this.addNoEntrySign(fin, 1, 6)
      return
    }
    if (id === 'zlaty') {
      // Vyhlídková plošina
      const pl = place(this.halfWidth + 14, 12)
      if (this.minRoadDist(pl.x, pl.z, fin.position.y) >= this.halfWidth + 9) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(12, 0.25, 8), matLambert(0xc4a878))
        pad.position.set(pl.x, pl.y + 0.12, pl.z)
        pad.rotation.y = yaw
        this.decorRoot.add(pad)
        const rail = new THREE.Mesh(new THREE.BoxGeometry(11, 0.7, 0.15), matLambert(0xd4a017))
        rail.position.set(pl.x, pl.y + 0.55, pl.z)
        rail.rotation.y = yaw
        this.decorRoot.add(rail)
      }
      return
    }
    if (id === 'serpentiny') {
      // Konec lesní cesty — závora + zákaz
      this.addNoEntrySign(fin, -1, 5)
      const gx = fin.position.x + fin.tangent.x * 4
      const gz = fin.position.z + fin.tangent.z * 4
      const boom = new THREE.Mesh(new THREE.BoxGeometry(this.halfWidth * 2.1, 0.18, 0.18), matLambert(0xc45c3a))
      boom.position.set(gx, fin.position.y + 1.1, gz)
      boom.rotation.y = yaw
      boom.rotation.z = 0.08
      this.decorRoot.add(boom)
      return
    }
    if (id === 'turini') {
      // Staveniště — stop hromada + tabule
      const pl = place(-(this.halfWidth + 12), 9)
      if (this.minRoadDist(pl.x, pl.z, fin.position.y) >= this.halfWidth + 8) {
        const pile = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.4, 6), matLambert(0x6a5a42))
        pile.position.set(pl.x, pl.y + 1.1, pl.z)
        this.decorRoot.add(pile)
      }
      this.addNoEntrySign(fin, 1, 5)
      return
    }
    // Fallback — malé náměstí
    const pl = place(this.halfWidth + 14, 10)
    if (this.minRoadDist(pl.x, pl.z, fin.position.y) >= this.halfWidth + 9) {
      const plaza = new THREE.Mesh(
        new THREE.CylinderGeometry(6.5, 6.5, 0.1, 10),
        matLambert(0x9a8a78),
      )
      plaza.position.set(pl.x, pl.y + 0.04, pl.z)
      this.decorRoot.add(plaza)
    }
    this.addNoEntrySign(fin, 1, 5)
  }

  private addNoEntrySign(
    s: { position: THREE.Vector3; tangent: THREE.Vector3; normal: THREE.Vector3 },
    side: 1 | -1,
    along = 5,
  ): void {
    const lat = this.halfWidth + 3.2
    const x = s.position.x + s.normal.x * lat * side + s.tangent.x * along
    const z = s.position.z + s.normal.z * lat * side + s.tangent.z * along
    if (this.minRoadDist(x, z, s.position.y) < this.halfWidth + 2.2) return
    const g = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.6, 5), matLambert(0x3a3a3a))
    pole.position.y = 1.3
    g.add(pole)
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 12),
      matLambert(0xc62828, { emissive: 0xc62828, emissiveIntensity: 0.15 }),
    )
    disc.position.set(0, 2.45, 0.05)
    g.add(disc)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.12, 0.06), matLambert(0xf0f0f0))
    bar.position.set(0, 2.45, 0.08)
    g.add(bar)
    g.position.set(x, this.settleY(x, z), z)
    g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
    this.decorRoot.add(g)
  }

  /**
   * Kasárny Klecany — Dolní + Horní: betonové bloky, parade, skate park.
   * (mapa / ÚP: dvě plochy spojené E–W osou)
   */
  private buildKasarnySkate(): void {
    const theme = this.def.theme
    const concrete = matLambert(0x8a9098)
    const concreteDark = matLambert(0x5a6068)
    const roof = matLambert(0x4a5058)
    const railMat = matLambert(0xc8c8d0)
    const rampMat = matLambert(0x6a7078)
    const bankEarth = matLambert(0x4a5240)
    const rock = matLambert(0x6a6a62)
    const graffiti = [theme.accent, theme.barrierL, theme.barrierR, theme.detail].map((c) =>
      matLambert(c, { emissive: c, emissiveIntensity: 0.35 }),
    )

    // Terasa/svahy jako Klecánek — méně segs = méně hitch
    this.addValleyBanks(bankEarth, rock, { segs: 7, innerLat: this.halfWidth + 14, outerLat: this.halfWidth + 30 })

    // Kasárenské bloky — jen když celý footprint (rohy) mimo asfalt
    const asphaltClear = this.halfWidth + 2.2
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.4) / 6
      const s = this.sample(t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const depth = 6
      const len = 10 + (i % 2) * 2
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const lat = this.safeLateral(s, side, Math.max(len, depth) * 0.55 + 12)
      const gx = s.position.x + s.normal.x * lat * side
      const gz = s.position.z + s.normal.z * lat * side
      // BoxGeometry(len,·,depth): local X = len (⊥ k trati), local Z = depth (podél)
      if (!this.boxClearOfRoad(gx, gz, yaw, len * 0.5, depth * 0.5, asphaltClear, s.position.y)) {
        continue
      }
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 5.2, depth), concrete)
      body.position.y = 2.6
      g.add(body)
      const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.35, depth + 0.6), roof)
      top.position.y = 5.35
      g.add(top)
      const tag = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 0.12), graffiti[i % graffiti.length]!)
      tag.position.set(0, 2.2, depth * 0.5 + 0.1)
      g.add(tag)
      g.position.set(gx, this.settleY(gx, gz), gz)
      g.rotation.y = yaw
      this.decorRoot.add(g)
    }

    // Parade / skate plaza — zarovnaná s tratí, mimo asfalt (ne „modrý koberec“)
    const dolni = this.sample(0.12)
    const plazaLat = Math.max(this.safeLateral(dolni, 1, 28), this.halfWidth + 42)
    const px = dolni.position.x + dolni.normal.x * plazaLat
    const pz = dolni.position.z + dolni.normal.z * plazaLat
    const plazaYaw = Math.atan2(dolni.tangent.x, dolni.tangent.z)
    if (
      this.minRoadDist(px, pz, dolni.position.y) >= this.halfWidth + 30 &&
      this.boxClearOfRoad(px, pz, plazaYaw, 18, 11, this.halfWidth + 4, dolni.position.y)
    ) {
      const plaza = new THREE.Mesh(new THREE.PlaneGeometry(36, 22), concreteDark)
      plaza.rotation.order = 'YXZ'
      plaza.rotation.y = plazaYaw
      plaza.rotation.x = -Math.PI / 2
      plaza.position.set(px, this.terrainYAt(px, pz) + 0.04, pz)
      this.group.add(plaza)

      const n = dolni.normal
      const tng = dolni.tangent
      const placeOff = (along: number, out: number) => {
        const x = px + tng.x * along + n.x * out
        const z = pz + tng.z * along + n.z * out
        return { x, z, y: this.terrainYAt(x, z) }
      }
      const pipeAt = placeOff(-6, 2)
      if (this.minRoadDist(pipeAt.x, pipeAt.z, dolni.position.y) >= this.halfWidth + 20) {
        const pipe = new THREE.Mesh(
          new THREE.CylinderGeometry(4.2, 4.2, 10, 10, 1, false, 0, Math.PI * 0.55),
          rampMat,
        )
        pipe.rotation.order = 'YXZ'
        pipe.rotation.y = plazaYaw
        pipe.rotation.z = Math.PI / 2
        pipe.position.set(pipeAt.x, pipeAt.y + 2.1, pipeAt.z)
        this.group.add(pipe)
      }
      const boxAt = placeOff(5, -1.5)
      if (this.minRoadDist(boxAt.x, boxAt.z, dolni.position.y) >= this.halfWidth + 20) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(7, 1.1, 3), concrete)
        box.position.set(boxAt.x, boxAt.y + 0.55, boxAt.z)
        box.rotation.y = plazaYaw
        this.group.add(box)
      }
      const railAt = placeOff(1, 5)
      if (this.minRoadDist(railAt.x, railAt.z, dolni.position.y) >= this.halfWidth + 20) {
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 9, 6), railMat)
        rail.rotation.order = 'YXZ'
        rail.rotation.y = plazaYaw
        rail.rotation.z = Math.PI / 2
        rail.position.set(railAt.x, railAt.y + 0.85, railAt.z)
        this.group.add(rail)
      }
    }

    // Menší plaza Horní
    const horni = this.sample(0.55)
    const plaza2Lat = Math.max(this.safeLateral(horni, -1, 24), this.halfWidth + 36)
    const hx = horni.position.x + horni.normal.x * plaza2Lat * -1
    const hz = horni.position.z + horni.normal.z * plaza2Lat * -1
    const horniYaw = Math.atan2(horni.tangent.x, horni.tangent.z)
    if (
      this.minRoadDist(hx, hz, horni.position.y) >= this.halfWidth + 24 &&
      this.boxClearOfRoad(hx, hz, horniYaw, 13, 9, this.halfWidth + 4, horni.position.y)
    ) {
      const plaza2 = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), concreteDark)
      plaza2.rotation.order = 'YXZ'
      plaza2.rotation.y = horniYaw
      plaza2.rotation.x = -Math.PI / 2
      plaza2.position.set(hx, this.terrainYAt(hx, hz) + 0.04, hz)
      this.group.add(plaza2)
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(12, 0.45, 1.1), concrete)
      ledge.position.set(hx, this.terrainYAt(hx, hz) + 0.28, hz)
      ledge.rotation.y = horniYaw
      this.group.add(ledge)
    }

    // Rampy mimo vozovku
    const roadClear = this.halfWidth + 7
    for (let i = 0; i < 5; i++) {
      const s = this.sample(0.1 + i * 0.16)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 5)
      if (lat < roadClear) continue
      const rx = s.position.x + s.normal.x * lat * side
      const rz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(rx, rz, s.position.y) < roadClear) continue
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.35, 4.5), rampMat)
      ramp.rotation.x = -0.28
      ramp.position.set(rx, this.terrainYAt(rx, rz) + 0.55, rz)
      ramp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.decorRoot.add(ramp)
    }

    // Stromy — InstancedMesh (60+ fps), koruna mimo asfalt
    const leaf = matLambert(theme.detail)
    const trunk = matLambert(0x5a3a22)
    const dummy = new THREE.Object3D()
    const boleGeo = new THREE.CylinderGeometry(0.2, 0.28, 2.6, 5)
    const canopyGeo = new THREE.SphereGeometry(1.6, 5, 5)
    const nTrees = 10
    const boles = new THREE.InstancedMesh(boleGeo, trunk, nTrees)
    const canopies = new THREE.InstancedMesh(canopyGeo, leaf, nTrees)
    const treeClear = this.halfWidth + 3.5
    let placed = 0
    for (let i = 0; i < nTrees * 2 && placed < nTrees; i++) {
      const s = this.sample(0.2 + i * 0.045)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 14)
      if (lat < this.halfWidth + 12) continue
      const tx = s.position.x + s.normal.x * lat * side
      const tz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(tx, tz, s.position.y) < treeClear + 1.6) continue
      if (!this.boxClearOfRoad(tx, tz, 0, 1.6, 1.6, treeClear, s.position.y)) continue
      const gy = this.settleY(tx, tz)
      dummy.position.set(tx, gy + 1.3, tz)
      dummy.rotation.set(0, (i * 0.6) % Math.PI, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      boles.setMatrixAt(placed, dummy.matrix)
      dummy.position.y = gy + 3.2
      dummy.updateMatrix()
      canopies.setMatrixAt(placed, dummy.matrix)
      placed++
    }
    boles.count = placed
    canopies.count = placed
    boles.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    this.decorRoot.add(boles, canopies)
  }

  /** Plácek — voda, tráva, stromy, lavičky; volný freestyle areál. */
  private buildPlaza(): void {
    const b = this.def.sandboxBounds ?? { halfX: 170, halfZ: 110 }
    const theme = this.def.theme

    // Jezero / řeka na jihu
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 160),
      matLambert(0x2a6a8a, { emissive: 0x143848, emissiveIntensity: 0.35 }),
    )
    water.rotation.x = -Math.PI / 2
    water.position.set(0, -0.35, b.halfZ + 95)
    this.group.add(water)

    const shore = new THREE.Mesh(
      new THREE.PlaneGeometry(430, 18),
      matLambert(0xc2b89a),
    )
    shore.rotation.x = -Math.PI / 2
    shore.position.set(0, -0.2, b.halfZ + 12)
    this.group.add(shore)

    // Mola
    for (const ox of [-40, 20, 70]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 22), matLambert(0x8a6a48))
      pier.position.set(ox, 0.05, b.halfZ + 18)
      this.group.add(pier)
    }

    // Trávník kolem plochy (pod asfaltem, fog off — žádný černý závoj přes pad)
    const lawnMat = matGround(theme.detail)
    for (const [lx, lz, lw, ld] of [
      [0, -b.halfZ - 36, b.halfX * 2.2, 48],
      [-b.halfX - 40, 0, 56, b.halfZ * 2.05],
      [b.halfX + 40, 0, 56, b.halfZ * 2.05],
      [0, b.halfZ + 28, b.halfX * 2.05, 36],
    ] as const) {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lawnMat)
      lawn.rotation.x = -Math.PI / 2
      lawn.position.set(lx, -0.06, lz)
      lawn.receiveShadow = true
      this.group.add(lawn)
    }

    // Stromy kolem
    const trunkMat = matLambert(0x5a3a22)
    const leafMat = matLambert(0x2f6a38, { emissive: 0x1a3a20, emissiveIntensity: 0.15 })
    const treeSpots: Array<[number, number]> = []
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2
      const r = Math.max(b.halfX, b.halfZ) + 22 + (i % 5) * 6
      treeSpots.push([Math.cos(ang) * r * 0.95, Math.sin(ang) * r * 0.7])
    }
    for (const [tx, tz] of treeSpots) {
      if (tz > b.halfZ + 5) continue // ne do vody
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.2, 6), trunkMat)
      trunk.position.set(tx, 2.1, tz)
      this.group.add(trunk)
      const crown = new THREE.Mesh(new THREE.SphereGeometry(2.4 + (Math.abs(tx) % 7) * 0.12, 8, 6), leafMat)
      crown.position.set(tx, 5.2, tz)
      this.group.add(crown)
    }

    // Lavičky u břehu
    const benchMat = matLambert(0x6a5040)
    for (let i = -3; i <= 3; i++) {
      const bx = i * 22
      const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 0.7), benchMat)
      seat.position.set(bx, 0.55, b.halfZ - 4)
      this.group.add(seat)
      const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.7, 0.12), benchMat)
      back.position.set(bx, 0.95, b.halfZ - 3.65)
      this.group.add(back)
    }

    // Curb rail (vizuál) + skoková rampa s fyzikou
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(14, 0.18, 0.35),
      matLambert(0xb0b8c0, { emissive: 0x404850, emissiveIntensity: 0.2 }),
    )
    rail.position.set(-35, 0.55, -20)
    this.group.add(rail)

    const rampX = 40
    const rampZ = 15
    const rampW = 5.5
    const rampD = 8
    const rampH = 1.6
    // Klínová rampa (vyšší na +Z)
    const rampGeo = new THREE.BufferGeometry()
    const hw = rampW / 2
    const hd = rampD / 2
    const verts = new Float32Array([
      // top wedge face
      -hw, 0.08, -hd, hw, 0.08, -hd, hw, rampH, hd, -hw, rampH, hd,
    ])
    rampGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3))
    rampGeo.setIndex([0, 1, 2, 0, 2, 3])
    rampGeo.computeVertexNormals()
    const kicker = new THREE.Mesh(rampGeo, matLambert(0x8a9098))
    kicker.position.set(rampX, 0.28, rampZ)
    this.group.add(kicker)
    // Bočnice
    for (const side of [-1, 1]) {
      const sideM = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, rampH, rampD),
        matLambert(0x6a7078),
      )
      sideM.position.set(rampX + side * (hw + 0.1), rampH * 0.5, rampZ)
      this.group.add(sideM)
    }
    this.jumpPads.push({
      minX: rampX - hw,
      maxX: rampX + hw,
      minZ: rampZ - hd,
      maxZ: rampZ + hd,
      launch: 0.55,
      boost: 4.5,
      minSpeed: 8,
    })

    // Druhá menší rampa naproti
    const r2x = -50
    const r2z = 25
    const k2 = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.1, 6), matLambert(0x888890))
    k2.position.set(r2x, 0.55, r2z)
    k2.rotation.x = -0.28
    this.group.add(k2)
    this.jumpPads.push({
      minX: r2x - 2.4,
      maxX: r2x + 2.4,
      minZ: r2z - 3.2,
      maxZ: r2z + 3.2,
      launch: 0.42,
      boost: 3.2,
      minSpeed: 7,
    })

    // Další skokánky + street props (větší Plácek)
    const addBoxPad = (
      x: number,
      z: number,
      w: number,
      h: number,
      d: number,
      launch: number,
      boost: number,
      minSpeed: number,
      tilt = -0.22,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matLambert(0x8a9098))
      mesh.position.set(x, h * 0.45, z)
      mesh.rotation.x = tilt
      this.group.add(mesh)
      this.jumpPads.push({
        minX: x - w * 0.5,
        maxX: x + w * 0.5,
        minZ: z - d * 0.5,
        maxZ: z + d * 0.5,
        launch,
        boost,
        minSpeed,
      })
    }
    addBoxPad(90, -40, 5.2, 1.25, 7, 0.48, 3.8, 7)
    addBoxPad(-95, -55, 4.8, 1.05, 6.5, 0.4, 3.1, 6.5)
    addBoxPad(20, -70, 6, 1.45, 8, 0.52, 4.2, 8, -0.3)
    addBoxPad(-20, 70, 5, 1.15, 6.8, 0.44, 3.4, 7)

    // Quarter pipe vizuál
    const qPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(5.5, 5.5, 12, 12, 1, false, 0, Math.PI * 0.5),
      matLambert(0x7a8088),
    )
    qPipe.rotation.order = 'YXZ'
    qPipe.rotation.y = Math.PI * 0.25
    qPipe.rotation.z = Math.PI / 2
    qPipe.position.set(110, 2.4, 55)
    this.group.add(qPipe)
    this.jumpPads.push({
      minX: 104,
      maxX: 116,
      minZ: 49,
      maxZ: 61,
      launch: 0.62,
      boost: 5,
      minSpeed: 9,
    })

    // Box / rail standy
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(10, 1.0, 3.2), matLambert(0x9a9890))
    ledge.position.set(-80, 0.5, -10)
    this.group.add(ledge)
    const rail2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 12, 6),
      matLambert(0xb8c0c8, { emissive: 0x404850, emissiveIntensity: 0.15 }),
    )
    rail2.rotation.z = Math.PI / 2
    rail2.position.set(55, 0.85, -55)
    this.group.add(rail2)
    const bank = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 5), matLambert(0x868c94))
    bank.position.set(-110, 0.35, 40)
    bank.rotation.z = 0.18
    this.group.add(bank)

    // Domky v dálce (siluety)
    const houseMat = matLambert(theme.building)
    for (let i = 0; i < 8; i++) {
      const hx = -150 + i * 38 + (i % 2) * 8
      const hz = -b.halfZ - 55 - (i % 3) * 10
      const h = 6 + (i % 4) * 2.5
      const house = new THREE.Mesh(new THREE.BoxGeometry(10, h, 8), houseMat)
      house.position.set(hx, h * 0.5, hz)
      this.group.add(house)
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(7, 3.2, 4),
        matLambert(theme.accent),
      )
      roof.position.set(hx, h + 1.4, hz)
      roof.rotation.y = Math.PI / 4
      this.group.add(roof)
    }

    // Lampy + reálné PointLight (plaza čitelná večer)
    const poleMat = matLambert(0x333840)
    const lampMat = matLambert(0xffe8a0, { emissive: 0xffcc66, emissiveIntensity: 0.85 })
    for (const [lx, lz] of [
      [-b.halfX + 8, -b.halfZ + 8],
      [b.halfX - 8, -b.halfZ + 8],
      [-b.halfX + 8, b.halfZ - 8],
      [b.halfX - 8, b.halfZ - 8],
      [0, -b.halfZ + 6],
      [0, b.halfZ - 6],
    ] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6), poleMat)
      pole.position.set(lx, 2.75, lz)
      this.group.add(pole)
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), lampMat)
      bulb.position.set(lx, 5.5, lz)
      this.group.add(bulb)
      if (this.sceneLights.length < 3) this.addSceneLamp(lx, 5.35, lz, 0xffe0a8, 0.7, 22)
    }
  }

  private buildCity(): void {
    this.addCitySideStreets()

    // Moře dál — tmavší, ať neubere kontrast silnici
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(120, 16),
      matLambert(0x0e1a28, { emissive: 0x061018, emissiveIntensity: 0.06 }),
    )
    sea.rotation.x = -Math.PI / 2
    sea.position.set(270, -0.6, 50)
    this.group.add(sea)
    const shore = new THREE.Mesh(new THREE.RingGeometry(112, 128, 16), matLambert(0x3a342c))
    shore.rotation.x = -Math.PI / 2
    shore.position.set(270, -0.52, 50)
    this.group.add(shore)

    // Terénní fleky — park / parkoviště / dlažba (4× variabilita okolí)
    const terrainPatches: Array<{ col: number; r: number; t: number; side: 1 | -1; push: number }> =
      [
        { col: 0x1a2818, r: 10, t: 0.08, side: 1, push: 22 },
        { col: 0x2a2c34, r: 8, t: 0.22, side: -1, push: 20 },
        { col: 0x3a3428, r: 9, t: 0.38, side: 1, push: 24 },
        { col: 0x142018, r: 11, t: 0.55, side: -1, push: 26 },
        { col: 0x2c2430, r: 7, t: 0.7, side: 1, push: 21 },
        { col: 0x1c2218, r: 10, t: 0.88, side: -1, push: 23 },
        { col: 0x323840, r: 6, t: 0.15, side: 1, push: 18 },
        { col: 0x243018, r: 8, t: 0.62, side: -1, push: 19 },
      ]
    for (const p of terrainPatches) {
      const s = this.sample(p.t)
      const lat = this.safeLateral(s, p.side, p.r + 4) + p.push
      const px = s.position.x + s.normal.x * lat * p.side
      const pz = s.position.z + s.normal.z * lat * p.side
      if (this.minRoadDist(px, pz, s.position.y) < this.halfWidth + p.r + 3) continue
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(p.r, 8),
        matLambert(p.col, { emissive: p.col, emissiveIntensity: 0.04 }),
      )
      patch.rotation.x = -Math.PI / 2
      patch.position.set(px, this.terrainYAt(px, pz) - 0.04, pz)
      this.group.add(patch)
    }

    // Budovy — víc pokusů + fallback dál od trati (dřív většina skipnutá)
    let placed = 0
    for (let i = 0; i < 36 && placed < 28; i++) {
      const s = this.sample((i + 0.15) / 36)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const house = createVariedHouse(i * 11 + 7, 'city')
      const yaw = Math.atan2(s.tangent.x, s.tangent.z) + (side < 0 ? Math.PI : 0)
      const need = Math.max(house.halfW, house.halfD)
      const offsets = [5, 8, 11, 15, 20]
      let done = false
      for (const extra of offsets) {
        const dist = this.safeLateral(s, side, need + 6) + extra
        const bx = s.position.x + s.normal.x * dist * side
        const bz = s.position.z + s.normal.z * dist * side
        if (
          !this.boxClearOfRoad(bx, bz, yaw, house.halfW, house.halfD, this.halfWidth + 2.5, s.position.y)
        ) {
          continue
        }
        house.group.position.set(bx, this.settleY(bx, bz), bz)
        house.group.rotation.y = yaw
        this.group.add(house.group)
        placed++
        done = true
        break
      }
      if (!done) {
        // Poslední šance — daleko, ať mapa není prázdná
        const dist = this.halfWidth + need + 36
        const bx = s.position.x + s.normal.x * dist * side
        const bz = s.position.z + s.normal.z * dist * side
        house.group.position.set(bx, this.settleY(bx, bz), bz)
        house.group.rotation.y = yaw
        this.group.add(house.group)
        placed++
      }
    }

    // Tribuny — barevné sedačky (čitelnost), mimo asfalt
    this.addGrandstand(0.15, 1, 'long')
    this.addGrandstand(0.48, -1, 'tier')
    this.addGrandstand(0.78, 1, 'long')

    const poleM = matLambert(0x2a2a30)
    const lampGlow = 0xffd090
    for (let i = 0; i < 4; i++) {
      const s = this.sample((i + 0.2) / 4)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 2.2)
      const px = s.position.x + s.normal.x * lat * side
      const pz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(px, pz, s.position.y) < this.halfWidth + 4) continue
      const py = this.terrainYAt(px, pz)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.5, 5), poleM)
      pole.position.set(px, py + 2.75, pz)
      this.group.add(pole)
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 6, 6),
        matLambert(lampGlow, { emissive: lampGlow, emissiveIntensity: 0.85 }),
      )
      lamp.position.set(px, py + 5.4, pz)
      this.group.add(lamp)
      // Max 2 PointLight na city — FPS
      if (i < 2) this.addSceneLamp(px, py + 5.2, pz, lampGlow, 0.85, 24)
    }
  }

  /** PointLight u lampy — bez stínů, krátký dosah. */
  private addSceneLamp(
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
  ): void {
    if (this.sceneLights.length >= 4) return
    const light = new THREE.PointLight(color, intensity, distance, 2)
    light.position.set(x, y, z)
    light.castShadow = false
    this.group.add(light)
    this.sceneLights.push(light)
  }

  /** Dekorativní odbočky — dál od vozovky, méně kusů (FPS). */
  private addCitySideStreets(): void {
    const asphalt = matLambert(0x4a4e56)
    const curbMat = matLambert(0x6a6e76)
    const clearance = 10

    for (let i = 0; i < 6; i++) {
      const t = (i + 0.45) / 6
      const s = this.sample(t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const branchLen = 18 + (i % 3) * 6
      const branchW = this.halfWidth * 0.55
      const start = Math.max(this.safeLateral(s, side, branchW * 0.5), this.halfWidth + clearance)

      const branch = new THREE.Mesh(new THREE.BoxGeometry(branchW, 0.07, branchLen), asphalt)
      const bx = s.position.x + s.normal.x * (start + branchLen / 2) * side
      const bz = s.position.z + s.normal.z * (start + branchLen / 2) * side
      if (this.minRoadDist(bx, bz, s.position.y) < this.halfWidth + branchW * 0.5 + 2) continue
      const by = this.terrainYAt(bx, bz) + 0.035
      branch.position.set(bx, by, bz)
      branch.rotation.y = Math.atan2(s.normal.x, s.normal.z)
      this.group.add(branch)

      const curb = new THREE.Mesh(new THREE.BoxGeometry(branchW + 0.4, 0.12, 0.35), curbMat)
      const cx = s.position.x + s.normal.x * (start + branchLen + 0.4) * side
      const cz = s.position.z + s.normal.z * (start + branchLen + 0.4) * side
      curb.position.set(cx, this.terrainYAt(cx, cz) + 0.08, cz)
      curb.rotation.y = branch.rotation.y
      this.group.add(curb)
    }
  }

  private addGrandstand(t: number, side: 1 | -1, kind: 'long' | 'tier' | 'cross'): void {
    const s = this.sample(t)
    const stand = new THREE.Group()
    const baseM = matLambert(0x3a3a44)
    const seatM = matLambert(kind === 'tier' ? 0x8a3030 : kind === 'cross' ? 0x4a5568 : 0x555560)
    const roofM = matLambert(this.def.theme.accent)
    const footprint = kind === 'long' ? 16 : kind === 'tier' ? 10 : 12

    if (kind === 'long') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(28, 1.2, 5), baseM)
      base.position.y = 0.6
      stand.add(base)
      for (let r = 0; r < 3; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(28, 0.55, 1.1), seatM)
        step.position.set(0, 1.2 + r * 0.6, -1.2 - r * 0.75)
        stand.add(step)
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(29, 0.25, 6), roofM)
      roof.position.set(0, 3.4, -1.5)
      stand.add(roof)
    } else if (kind === 'tier') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(16, 1.4, 8), baseM)
      base.position.y = 0.7
      stand.add(base)
      for (let r = 0; r < 5; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 1.2), seatM)
        step.position.set(0, 1.3 + r * 0.55, -1.5 - r * 0.85)
        stand.add(step)
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.3, 8), roofM)
      roof.position.set(0, 4.4, -2)
      stand.add(roof)
    } else {
      // Příčná — kolmo k trati
      const base = new THREE.Mesh(new THREE.BoxGeometry(8, 1.2, 18), baseM)
      base.position.y = 0.6
      stand.add(base)
      for (let r = 0; r < 4; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 18), seatM)
        step.position.set(-1.2 - r * 0.9, 1.2 + r * 0.55, 0)
        stand.add(step)
      }
    }

    const lat = this.safeLateral(s, side, footprint)
    const gx = s.position.x + s.normal.x * lat * side
    const gz = s.position.z + s.normal.z * lat * side
    stand.position.set(gx, this.settleY(gx, gz), gz)
    stand.rotation.y =
      Math.atan2(s.tangent.x, s.tangent.z) + (kind === 'cross' ? Math.PI / 2 : 0)
    this.group.add(stand)
  }

  /** Klecany za úsvitu — náměstí, kostel, zámek, Topolová, sídliště, Vltava. */
  /**
   * Min. vzdálenost bodu od středové linie (LUT).
   * refY + mosty: segmenty s |Δy| > bridgeGap se nepočítají (překřížení ve výšce).
   */
  private minRoadDist(x: number, z: number, refY?: number, bridgeGap = 3.2): number {
    let best = Infinity
    for (const p of this.lut) {
      if (refY !== undefined && Math.abs(p.y - refY) > bridgeGap) continue
      const d = Math.hypot(x - p.x, z - p.z)
      if (d < best) best = d
    }
    return best
  }

  /**
   * Vzdálenost k „cizí“ části středové linie (mimo krátký lokální oblouk).
   * excludeArc malý — u cíle/startu i u kruháčů (Hrubý) jinak wrap schová overlap.
   */
  private minRoadDistForeign(x: number, z: number, localT: number, excludeArc = 0.025): number {
    const n = this.lutN
    let best = Infinity
    for (let i = 0; i < n; i++) {
      const t = this.def.loop ? i / n : i / Math.max(1, n - 1)
      let dT = Math.abs(t - localT)
      if (this.def.loop) dT = Math.min(dT, 1 - dT)
      if (dT < excludeArc) continue
      const p = this.lut[i]!
      const d = Math.hypot(x - p.x, z - p.z)
      if (d < best) best = d
    }
    return best
  }

  /**
   * Bod leží nad/v asfaltu jiné části okruhu (fantom okraj — Námko, Hrubý…).
   * margin: jak blízko smí být k cizímu středu (halfWidth = hrana cizí silnice).
   */
  private barrierCutsForeignAsphalt(
    x: number,
    z: number,
    localT: number,
    margin = 1.15,
  ): boolean {
    if (!this.def.loop) return false
    if (this.minRoadDistForeign(x, z, localT) < this.halfWidth + margin) return true
    // Extra: bod hluboko v nějakém asfaltu (střed pásu) = fantom i při slabém foreign hit
    return this.minRoadDist(x, z) < this.halfWidth * 0.55
  }

  /**
   * Laterál od středu tratě tak, aby střed objektu (+ footprint) nezasahoval do asfaltu
   * ani do jiné části okruhu (mosty = jiná výška OK).
   */
  private safeLateral(s: TrackSample, side: 1 | -1, footprint: number): number {
    // +8 m od hrany asfaltu — domy/props nemají sedět „na krajnici“
    const need = this.halfWidth + footprint + 8
    const refY = s.position.y
    let lat = need
    for (let i = 0; i < 20; i++) {
      const x = s.position.x + s.normal.x * lat * side
      const z = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(x, z, refY) >= need) return lat
      lat += 5
    }
    return lat
  }

  /**
   * Rohy boxu (local X = šířka, local Z = délka podél yaw) mimo asfalt.
   * yaw = Math.atan2(tangent.x, tangent.z) jako u meshe.
   */
  private boxClearOfRoad(
    cx: number,
    cz: number,
    yaw: number,
    halfX: number,
    halfZ: number,
    minDist: number,
    refY?: number,
  ): boolean {
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    for (const lx of [-halfX, halfX]) {
      for (const lz of [-halfZ, halfZ]) {
        const wx = cx + lx * c + lz * s
        const wz = cz - lx * s + lz * c
        if (this.minRoadDist(wx, wz, refY) < minDist) return false
      }
    }
    return true
  }

  /**
   * Námko — vesnický okruh ve stylu Do Klecánek: terasa, landmarky, málo draw callů (60+ fps).
   */
  private buildTown(): void {
    const theme = this.def.theme
    const plaster = [
      matLambert(0xc8b8a4, { map: plasterMap('namko-0', '#c8b8a4') }),
      matLambert(0xd4c4b0, { map: plasterMap('namko-1', '#d4c4b0') }),
      matLambert(0xb8a890, { map: plasterMap('namko-2', '#b8a890') }),
    ]
    const roof = matLambert(0xa04532)
    const roofDark = matLambert(0x6a2a22)
    const stone = matLambert(0x8a8074)
    const panel = matLambert(0xb0a898)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const bankEarth = matLambert(0x4a5a34)
    const rock = matLambert(0x6a6a62)
    const asphaltClear = this.halfWidth + 5.5

    // Banky dál od hrany — box šířky 16 sahá ±8 od středu; inner musí být halfWidth+8+rezerva
    this.addValleyBanks(bankEarth, rock, {
      segs: 12,
      innerLat: this.halfWidth + 24,
      outerLat: this.halfWidth + 38,
    })

    // Náměstí + kašna — přísný clearance (dřív 3 objekty lezly do asfaltu)
    {
      const square = this.sample(0.12)
      const plazaLat = this.safeLateral(square, 1, 10) + 14
      const px = square.position.x + square.normal.x * plazaLat
      const pz = square.position.z + square.normal.z * plazaLat
      if (
        this.minRoadDist(px, pz) >= asphaltClear + 14 &&
        this.boxClearOfRoad(px, pz, 0, 7, 7, asphaltClear + 2, square.position.y)
      ) {
        const py = this.settleY(px, pz)
        const plaza = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 0.1, 10), matLambert(0x9a8a78))
        plaza.position.set(px, py + 0.04, pz)
        this.decorRoot.add(plaza)
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.9, 7), stone)
        fountain.position.set(px, py + 0.5, pz)
        this.decorRoot.add(fountain)
      }
    }

    // Kostel
    {
      const churchS = this.sample(0.88)
      const churchLat = this.safeLateral(churchS, 1, 9) + 6
      const cx = churchS.position.x + churchS.normal.x * churchLat
      const cz = churchS.position.z + churchS.normal.z * churchLat
      if (this.minRoadDist(cx, cz, churchS.position.y) >= asphaltClear + 8) {
        const church = new THREE.Group()
        const nave = new THREE.Mesh(new THREE.BoxGeometry(7, 6, 12), plaster[0])
        nave.position.y = 3
        church.add(nave)
        const tower = new THREE.Mesh(new THREE.BoxGeometry(3.4, 12, 3.4), plaster[1])
        tower.position.set(0, 6, 5)
        church.add(tower)
        const spire = new THREE.Mesh(new THREE.ConeGeometry(2.1, 4.2, 4), roofDark)
        spire.position.set(0, 14.2, 5)
        church.add(spire)
        const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.8, 4), roof)
        naveRoof.rotation.y = Math.PI / 4
        naveRoof.position.set(0, 7.2, -1)
        church.add(naveRoof)
        church.position.set(cx, this.settleY(cx, cz), cz)
        church.rotation.y = Math.atan2(churchS.tangent.x, churchS.tangent.z)
        this.decorRoot.add(church)
      }
    }

    // Zámek (kompaktní)
    {
      const castleS = this.sample(0.92)
      const castleLat = this.safeLateral(castleS, -1, 12) + 8
      const cx = castleS.position.x - castleS.normal.x * castleLat
      const cz = castleS.position.z - castleS.normal.z * castleLat
      if (this.minRoadDist(cx, cz, castleS.position.y) >= asphaltClear + 10) {
        const castle = new THREE.Group()
        const keep = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 8), plaster[2])
        keep.position.y = 3.5
        castle.add(keep)
        const wing = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 9), plaster[1])
        wing.position.set(8, 2.5, 1)
        castle.add(wing)
        const cRoof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.35, 9), roof)
        cRoof.position.y = 7.2
        castle.add(cRoof)
        castle.position.set(cx, this.settleY(cx, cz), cz)
        castle.rotation.y = Math.atan2(castleS.tangent.x, castleS.tangent.z)
        this.decorRoot.add(castle)
      }
    }

    // NUDZ — jeden blok u Topolové
    {
      const nudzS = this.sample(0.42)
      const nudzLat = this.safeLateral(nudzS, 1, 8) + 8
      const nx = nudzS.position.x + nudzS.normal.x * nudzLat
      const nz = nudzS.position.z + nudzS.normal.z * nudzLat
      const yaw = Math.atan2(nudzS.tangent.x, nudzS.tangent.z)
      if (
        this.minRoadDist(nx, nz, nudzS.position.y) >= asphaltClear + 8 &&
        this.boxClearOfRoad(nx, nz, yaw, 6, 10, asphaltClear, nudzS.position.y)
      ) {
        const base = this.settleY(nx, nz)
        const nudz = new THREE.Mesh(new THREE.BoxGeometry(11, 8, 20), plaster[0])
        nudz.position.set(nx, base + 4, nz)
        nudz.rotation.y = yaw
        this.decorRoot.add(nudz)
        const roofM = new THREE.Mesh(new THREE.BoxGeometry(11.4, 0.28, 20.4), matLambert(0x6a6a62))
        roofM.position.set(nx, base + 8.15, nz)
        roofM.rotation.y = yaw
        this.decorRoot.add(roofM)
      }
    }

    // Sídliště — hustší paneláky, dál od asfaltu
    for (let i = 0; i < 5; i++) {
      const s = this.sample(0.5 + i * 0.06)
      const h = 10 + i * 1.8
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const lat = this.safeLateral(s, side, 8) + 14
      const bx = s.position.x + s.normal.x * lat * side
      const bz = s.position.z + s.normal.z * lat * side
      if (!this.boxClearOfRoad(bx, bz, yaw, 4.5, 6, asphaltClear + 1.5, s.position.y)) continue
      if (this.minRoadDist(bx, bz, s.position.y) < asphaltClear + 12) continue
      const block = new THREE.Mesh(new THREE.BoxGeometry(9, h, 12), panel)
      block.position.set(bx, this.settleY(bx, bz) + h / 2, bz)
      block.rotation.y = yaw
      this.decorRoot.add(block)
    }

    // Rodinné domy — hustší vesnice, přísný clearance mimo asfalt
    for (let i = 0; i < 18; i++) {
      const s = this.sample((i + 0.35) / 18)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const house = createVariedHouse(i * 11 + 5, 'town')
      const need = Math.max(house.halfW, house.halfD)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      for (const extra of [10, 16, 24]) {
        const lat = this.safeLateral(s, side, need) + extra
        const hx = s.position.x + s.normal.x * lat * side
        const hz = s.position.z + s.normal.z * lat * side
        if (
          !this.boxClearOfRoad(hx, hz, yaw, house.halfW, house.halfD, this.halfWidth + 4.5, s.position.y)
        ) {
          continue
        }
        if (this.minRoadDist(hx, hz, s.position.y) < this.halfWidth + 10) continue
        house.group.position.set(hx, this.settleY(hx, hz), hz)
        house.group.rotation.y = yaw
        this.decorRoot.add(house.group)
        break
      }
    }

    // Louky — pár fleků
    const fieldMats = [matLambert(0x3a4a28), matLambert(0x4a5840), matLambert(0x5a4a32)]
    for (let i = 0; i < 6; i++) {
      const s = this.sample((i + 0.3) / 6)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const radius = 7 + (i % 2) * 2
      const lat = this.safeLateral(s, side, radius + 8) + 14
      const px = s.position.x + s.normal.x * lat * side
      const pz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(px, pz) < this.halfWidth + radius + 8) continue
      const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 7), fieldMats[i % fieldMats.length]!)
      patch.rotation.x = -Math.PI / 2
      patch.position.set(px, this.terrainYAt(px, pz) - 0.06, pz)
      patch.userData.noCastShadow = true
      this.decorRoot.add(patch)
    }

    // Stromy — víc stromů, dál od asfaltu
    {
      const nTrees = 18
      const boles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.28, 2.8, 5), trunk, nTrees)
      const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(1.7, 5, 5), leaf, nTrees)
      const dummy = new THREE.Object3D()
      let placed = 0
      for (let i = 0; i < nTrees * 3 && placed < nTrees; i++) {
        const s = this.sample((i + 0.2) / (nTrees * 3))
        const side: 1 | -1 = i % 2 === 0 ? 1 : -1
        const lat = this.safeLateral(s, side, 3.2) + 8 + (i % 3) * 3
        const tx = s.position.x + s.normal.x * lat * side
        const tz = s.position.z + s.normal.z * lat * side
        if (this.minRoadDist(tx, tz, s.position.y) < this.halfWidth + 12) continue
        const gy = this.settleY(tx, tz)
        dummy.position.set(tx, gy + 1.4, tz)
        dummy.scale.setScalar(0.9 + (i % 3) * 0.12)
        dummy.rotation.set(0, i * 0.7, 0)
        dummy.updateMatrix()
        boles.setMatrixAt(placed, dummy.matrix)
        dummy.position.set(tx, gy + 3.6, tz)
        dummy.updateMatrix()
        canopies.setMatrixAt(placed, dummy.matrix)
        placed++
      }
      boles.count = placed
      canopies.count = placed
      boles.instanceMatrix.needsUpdate = true
      canopies.instanceMatrix.needsUpdate = true
      this.decorRoot.add(boles, canopies)
    }

    // Lampy — dál od asfaltu (žádný převis / zásah do vozovky)
    for (let i = 0; i < 10; i++) {
      const s = this.sample(i / 10)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 1.4) + 7
      const x = s.position.x + s.normal.x * lat * side
      const z = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(x, z) < this.halfWidth + 9) continue
      const py = this.settleY(x, z)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.8, 5), stone)
      pole.position.set(x, py + 1.9, z)
      this.decorRoot.add(pole)
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 5, 5),
        matLambert(0xffc070, { emissive: 0xff8a40, emissiveIntensity: 0.85 }),
      )
      lamp.position.set(x, py + 3.9, z)
      this.decorRoot.add(lamp)
    }
  }

  /**
   * Hrubý — benzínka (červený pruh), sklady, pole. Žádné objekty na asfaltu, 60+ fps.
   */
  private buildHruby(): void {
    const theme = this.def.theme
    const concrete = matLambert(0x9a9a94)
    const roofGrey = matLambert(0x5a5a58)
    const red = matLambert(0xc62828, { emissive: 0xc62828, emissiveIntensity: 0.2 })
    const fieldMats = [0x6a7a40, 0x8a8a48, 0x5a6a34, 0x7a6a38, 0x4a5028].map((c) => matLambert(c))
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const dummy = new THREE.Object3D()
    const asphaltClear = this.halfWidth + 3.5

    // Benzínka u kruháče Hrubý (~t 0.42)
    {
      const s = this.sample(0.42)
      const side: 1 | -1 = 1
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const lat = this.safeLateral(s, side, 14) + 10
      const gx = s.position.x + s.normal.x * lat * side
      const gz = s.position.z + s.normal.z * lat * side
      if (
        this.minRoadDist(gx, gz, s.position.y) >= asphaltClear + 8 &&
        this.boxClearOfRoad(gx, gz, yaw, 9, 6, asphaltClear, s.position.y)
      ) {
        const station = new THREE.Group()
        const body = new THREE.Mesh(new THREE.BoxGeometry(16, 3.2, 10), concrete)
        body.position.y = 1.6
        station.add(body)
        const canopy = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 12), roofGrey)
        canopy.position.y = 3.4
        station.add(canopy)
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(18.2, 0.55, 12.2), red)
        stripe.position.y = 3.75
        station.add(stripe)
        for (const ox of [-4, 0, 4]) {
          const pump = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 0.5), matLambert(0x3a3a3a))
          pump.position.set(ox, 0.7, 4.2)
          station.add(pump)
        }
        station.position.set(gx, this.settleY(gx, gz), gz)
        station.rotation.y = yaw
        this.decorRoot.add(station)
      }
    }

    // Sklady — víc budov kolem okruhu, přísný clearance (60+ fps)
    for (let i = 0; i < 14; i++) {
      const s = this.sample(0.06 + i * 0.065)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const len = 12 + (i % 4) * 2
      const depth = 7 + (i % 2) * 2
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const lat = this.safeLateral(s, side, Math.max(len, depth) * 0.55 + 12) + 5 + (i % 3) * 2
      const bx = s.position.x + s.normal.x * lat * side
      const bz = s.position.z + s.normal.z * lat * side
      if (!this.boxClearOfRoad(bx, bz, yaw, len * 0.5, depth * 0.5, asphaltClear, s.position.y)) {
        continue
      }
      if (this.minRoadDist(bx, bz, s.position.y) < asphaltClear + 8) continue
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 4.2 + (i % 3) * 0.6, depth), concrete)
      body.position.y = (4.2 + (i % 3) * 0.6) / 2
      g.add(body)
      const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.4, 0.3, depth + 0.4), roofGrey)
      top.position.y = 4.35 + (i % 3) * 0.6
      g.add(top)
      g.position.set(bx, this.settleY(bx, bz), bz)
      g.rotation.y = yaw
      this.decorRoot.add(g)
    }

    // Pole — fleky barvy ornice, daleko od asfaltu
    for (let i = 0; i < 10; i++) {
      const s = this.sample((i + 0.4) / 10)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const radius = 8 + (i % 3) * 2
      const lat = this.safeLateral(s, side, radius + 10) + 16 + (i % 2) * 6
      const px = s.position.x + s.normal.x * lat * side
      const pz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(px, pz) < this.halfWidth + radius + 8) continue
      if (!this.boxClearOfRoad(px, pz, 0, radius * 0.65, radius * 0.65, this.halfWidth + 5, undefined)) {
        continue
      }
      const patch = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 8),
        fieldMats[i % fieldMats.length]!,
      )
      patch.rotation.x = -Math.PI / 2
      patch.position.set(px, Math.min(this.terrainYAt(px, pz), -0.05) - 0.04, pz)
      this.decorRoot.add(patch)
    }

    // Stromy — InstancedMesh, daleko od vozovky
    const boleGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.8, 5)
    const canopyGeo = new THREE.SphereGeometry(1.7, 5, 5)
    const nTrees = 12
    const boles = new THREE.InstancedMesh(boleGeo, trunk, nTrees)
    const canopies = new THREE.InstancedMesh(canopyGeo, leaf, nTrees)
    let placed = 0
    for (let i = 0; i < nTrees * 3 && placed < nTrees; i++) {
      const s = this.sample((i * 0.31) % 1)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 4) + 14 + (i % 3) * 3
      const tx = s.position.x + s.normal.x * lat * side
      const tz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(tx, tz, s.position.y) < this.halfWidth + 9.5) continue
      const gy = this.settleY(tx, tz)
      dummy.position.set(tx, gy + 1.4, tz)
      dummy.rotation.set(0, i, 0)
      dummy.scale.setScalar(1)
      dummy.updateMatrix()
      boles.setMatrixAt(placed, dummy.matrix)
      dummy.position.y = gy + 3.5
      dummy.updateMatrix()
      canopies.setMatrixAt(placed, dummy.matrix)
      placed++
    }
    boles.count = placed
    canopies.count = placed
    boles.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    this.decorRoot.add(boles, canopies)
  }

  /**
   * Letiště Vodochody — vlastní charakter: runway infield, hangáry, věž (lehké, 60+ fps).
   * Ne Klecánek — vojenské letiště.
   */
  private buildVodochody(): void {
    const theme = this.def.theme
    const olive = matLambert(0x4a5240)
    const oliveDark = matLambert(0x3a4234)
    const concrete = matLambert(0x7a7e78)
    const accent = matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.2 })
    const asphaltClear = this.halfWidth + 4
    const inRx = 112
    const inRz = 70
    const deckY = this.roadLift - 0.08

    const deckMat = matGround(0x7a8478)
    const grassMat = matGround(0x5a7048)
    const runMat = matGround(0x6a6e72)
    const markMat = matGround(0xe8e8ec)
    const sandMat = matGround(0xc2b89a)

    const flat = (mesh: THREE.Mesh, y: number) => {
      mesh.rotation.x = -Math.PI / 2
      mesh.position.y = y
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }

    // Infield: tráva + beton + runway (letiště, ne vesnice)
    {
      const grass = new THREE.Mesh(new THREE.CircleGeometry(1, 28), grassMat)
      grass.scale.set(inRx, 1, inRz)
      flat(grass, deckY)

      const deck = new THREE.Mesh(new THREE.CircleGeometry(1, 24), deckMat)
      deck.scale.set(inRx * 0.72, 1, inRz * 0.68)
      flat(deck, deckY + 0.012)

      const runway = new THREE.Mesh(new THREE.PlaneGeometry(180, 20), runMat)
      flat(runway, deckY + 0.022)
      const taxi = new THREE.Mesh(new THREE.PlaneGeometry(16, 70), runMat)
      taxi.position.x = 32
      flat(taxi, deckY + 0.02)

      const apron = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 36), sandMat)
      apron.scale.set(inRx + 4, 1, inRz + 3)
      flat(apron, deckY - 0.008)

      for (let i = -4; i <= 4; i++) {
        if (i === 0) continue
        const dash = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.04, 0.5), markMat)
        dash.position.set(i * 16, deckY + 0.04, 0)
        dash.userData.noCastShadow = true
        this.group.add(dash)
      }
    }

    // Vnější tráva (1 ring)
    {
      const outGrass = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.65, 32), grassMat)
      outGrass.scale.set(240, 1, 130)
      flat(outGrass, -0.02)
    }

    // Hangáry — lehčí hustota (60+ fps)
    for (let i = 0; i < 5; i++) {
      const s = this.sample((i + 0.35) / 5)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const side: 1 | -1 = -1
      const lat = this.safeLateral(s, side, 16) + 20
      const hx = s.position.x + s.normal.x * lat * side
      const hz = s.position.z + s.normal.z * lat * side
      if (!this.boxClearOfRoad(hx, hz, yaw, 11, 7, asphaltClear, s.position.y)) continue
      if (this.minRoadDist(hx, hz, s.position.y) < asphaltClear + 12) continue
      const hangar = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(20, 5.5, 12), olive)
      body.position.y = 2.75
      hangar.add(body)
      const roof = new THREE.Mesh(new THREE.BoxGeometry(21, 0.35, 13), oliveDark)
      roof.position.y = 5.7
      hangar.add(roof)
      const door = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.2), concrete)
      door.position.set(0, 2, 6.1)
      hangar.add(door)
      hangar.position.set(hx, this.settleY(hx, hz), hz)
      hangar.rotation.y = yaw
      this.decorRoot.add(hangar)
    }

    // Kasárenské bloky (ne rodinné domy z Klecánek)
    for (let i = 0; i < 5; i++) {
      const s = this.sample((i + 0.2) / 5)
      const side: 1 | -1 = -1
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const lat = this.safeLateral(s, side, 10) + 28
      const hx = s.position.x + s.normal.x * lat * side
      const hz = s.position.z + s.normal.z * lat * side
      if (!this.boxClearOfRoad(hx, hz, yaw, 7, 5, asphaltClear, s.position.y)) continue
      if (this.minRoadDist(hx, hz, s.position.y) < this.halfWidth + 14) continue
      const block = new THREE.Mesh(new THREE.BoxGeometry(14, 4.2, 9), oliveDark)
      block.position.set(hx, this.settleY(hx, hz) + 2.1, hz)
      block.rotation.y = yaw
      this.decorRoot.add(block)
      const top = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.25, 9.3), concrete)
      top.position.set(hx, this.settleY(hx, hz) + 4.35, hz)
      top.rotation.y = yaw
      this.decorRoot.add(top)
    }

    // Řídící věž + 1 letadlo
    {
      const tower = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.BoxGeometry(3.6, 12, 3.6), oliveDark)
      shaft.position.y = 6
      tower.add(shaft)
      const cab = new THREE.Mesh(new THREE.BoxGeometry(6.2, 2.2, 6.2), concrete)
      cab.position.y = 13
      tower.add(cab)
      const top = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.25, 6.5), accent)
      top.position.y = 14.2
      tower.add(top)
      tower.position.set(44, deckY + 0.02, 18)
      if (this.minRoadDist(44, 18) >= this.halfWidth + 22) this.decorRoot.add(tower)
    }
    {
      const s = this.sample(0.25)
      const side: 1 | -1 = -1
      const lat = this.safeLateral(s, side, 10) + 16
      const ax = s.position.x + s.normal.x * lat * side
      const az = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(ax, az, s.position.y) >= asphaltClear + 10) {
        const plane = new THREE.Group()
        const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 11), oliveDark)
        fuselage.position.y = 0.75
        plane.add(fuselage)
        const wing = new THREE.Mesh(new THREE.BoxGeometry(13, 0.22, 2.2), olive)
        wing.position.y = 0.95
        plane.add(wing)
        plane.position.set(ax, this.settleY(ax, az), az)
        plane.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
        this.decorRoot.add(plane)
      }
    }
  }

  /** Do Klecánek / Zlatý / Serpentýny — climb stavba. */
  private buildClimb(): void {
    const theme = this.def.theme
    const id = this.def.id
    const serp = id === 'serpentiny'
    const zlaty = id === 'zlaty'
    // Klecánek: hnědá zem (ne zelené „domy“ z bank); ploty tlumené
    const hedge = matLambert(id === 'klecanek' ? 0x3a4034 : 0x24301c)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const rock = matLambert(0x6a6a62)
    const plasterChapel = matLambert(0xd4c4b0)
    const bankEarth = matLambert(id === 'klecanek' ? 0x6a5a40 : 0x4a5a34)

    const start = this.sample(0)
    // Řeka jen u Do Klecánek — daleko, pod terénem (dno údolí)
    if (id === 'klecanek') {
      const river = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 200),
        matLambert(0x2a4050, { emissive: 0x121c28, emissiveIntensity: 0.06 }),
      )
      river.rotation.x = -Math.PI / 2
      river.position.set(start.position.x - 160, start.position.y - 1.4, start.position.z - 40)
      this.group.add(river)
      this.addValleyBanks(bankEarth, rock, {
        segs: 12,
        innerLat: this.halfWidth + 22,
        outerLat: this.halfWidth + 36,
      })
    }
    if (serp) {
      this.addSerpentinyForest(trunk, leaf)
    }

    if (!serp) {
      this.addBusShelter(0, 1)
      this.addBusShelter(1, -1)
    }

    // Blízko startu — Klecánek: domy na údolní terase (terrainYAt), ne na špejlích
    const nearCount = serp ? 0 : zlaty ? 16 : id === 'klecanek' ? 10 : 12
    const houseStyle = id === 'klecanek' ? 'town' : 'climb'
    for (let i = 0; i < nearCount; i++) {
      const s = this.sample(0.04 + i * 0.014)
      const side = i % 2 === 0 ? 1 : -1
      const house = createVariedHouse(i * 13 + 2, houseStyle)
      const need = Math.max(house.halfW, house.halfD)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      for (const extra of [zlaty ? 10 : 8, 14, 20]) {
        const lat = this.safeLateral(s, side, need) + extra
        const hx = s.position.x + s.normal.x * lat * side
        const hz = s.position.z + s.normal.z * lat * side
        if (
          !this.boxClearOfRoad(hx, hz, yaw, house.halfW, house.halfD, this.halfWidth + 4, s.position.y)
        ) {
          continue
        }
        // Klecánek + Zlatý: sedí na terase údolí (terrainYAt), ne na špejlích
        const y = id === 'klecanek' || zlaty ? this.settleY(hx, hz) : this.settleY(hx, hz)
        house.group.position.set(hx, y, hz)
        house.group.rotation.y = yaw
        this.decorRoot.add(house.group)
        break
      }
    }

    if (id === 'klecanek') {
      const bmwColors = [0x1a1a1a, 0xc8c8c8, 0x1565c0, 0xf2f2f0, 0x2a2a32]
      for (let i = 0; i < bmwColors.length; i++) {
        const t = 0.16 + i * 0.035
        const s = this.sample(t)
        const car = this.parkedSedan(bmwColors[i]!)
        const dist = this.safeLateral(s, 1, 2.4) + 2
        const cx = s.position.x + s.normal.x * dist
        const cz = s.position.z + s.normal.z * dist
        if (this.minRoadDist(cx, cz, s.position.y) < this.halfWidth + 3.5) continue
        const cy = this.settleY(cx, cz)
        const yaw = Math.atan2(s.tangent.x, s.tangent.z)
        car.position.set(cx, cy, cz)
        car.rotation.y = yaw
        this.decorRoot.add(car)
      }
    }

    // Skalní lavice — ne na serpentinách (vypadaly jako skokánek na trati)
    if (!serp) {
      const bankN = id === 'klecanek' ? 4 : 6
      for (let i = 0; i < bankN; i++) {
        const s = this.sample(0.3 + i * 0.05)
        const lat = this.safeLateral(s, 1, 4.5) + 4
        const bx = s.position.x + s.normal.x * lat
        const bz = s.position.z + s.normal.z * lat
        if (this.minRoadDist(bx, bz, s.position.y) < this.halfWidth + 5) continue
        const bank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0 + (i % 3) * 0.35, 5), rock)
        const by =
          id === 'klecanek' ? this.settleY(bx, bz) + 0.35 : this.terrainYAt(bx, bz) + 0.35
        bank.position.set(bx, by, bz)
        bank.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
        this.decorRoot.add(bank)
      }
    }

    // Druhá + horní řada — Serpentýny = les; Zlatý hustší; Klecánek omítka až k cíli
    const midCount = serp ? 0 : zlaty ? 16 : id === 'klecanek' ? 14 : 8
    for (let i = 0; i < midCount; i++) {
      const s = this.sample(
        id === 'klecanek'
          ? 0.28 + i * (0.68 / Math.max(1, midCount))
          : 0.35 + i * (0.55 / Math.max(1, midCount)),
      )
      const side = i % 2 === 0 ? 1 : -1
      const house = createVariedHouse(i * 17 + 9, houseStyle)
      const far = zlaty ? 12 + (i % 4) * 5 : id === 'klecanek' ? 7 + (i % 3) * 2.5 : 8 + (i % 3) * 3
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      for (const extra of id === 'klecanek' ? [0, 4, 9] : [0]) {
        const lat = this.safeLateral(s, side, Math.max(house.halfW, house.halfD)) + far + extra
        const hx = s.position.x + s.normal.x * lat * side
        const hz = s.position.z + s.normal.z * lat * side
        if (
          !this.boxClearOfRoad(
            hx,
            hz,
            yaw,
            house.halfW,
            house.halfD,
            this.halfWidth + 4,
            s.position.y,
          )
        ) {
          continue
        }
        const y = this.settleY(hx, hz)
        house.group.position.set(hx, y, hz)
        house.group.rotation.y = yaw
        this.decorRoot.add(house.group)
        break
      }
    }

    if (!serp) {
      const square = this.sample(0.72)
      const plazaLat = this.safeLateral(square, 1, 14) + 6
      const px = square.position.x + square.normal.x * plazaLat
      const pz = square.position.z + square.normal.z * plazaLat
      if (this.minRoadDist(px, pz, square.position.y) >= this.halfWidth + 16) {
        const plaza = new THREE.Mesh(
          new THREE.CylinderGeometry(10, 10, 0.12, 12),
          matLambert(0x9a8a78),
        )
        plaza.position.set(px, this.terrainYAt(px, pz) + 0.02, pz)
        this.group.add(plaza)
      }
    }

    // Serpentýny = les — konec
    if (serp) return

    const fin = this.sample(1)

    // Zlatý kopec — vinice + vyhlídka (ne hřbitov z Klecánek)
    if (zlaty) {
      const vine = matLambert(0x3a5a28)
      const gold = matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.15 })
      const plaster = matLambert(0xc4a878)
      for (let row = 0; row < 5; row++) {
        for (let i = 0; i < 8; i++) {
          const s = this.sample(0.55 + i * 0.05)
          const side: 1 | -1 = row % 2 === 0 ? 1 : -1
          const lat = this.safeLateral(s, side, 3) + 8 + row * 3.2
          const vx = s.position.x + s.normal.x * lat * side
          const vz = s.position.z + s.normal.z * lat * side
          if (this.minRoadDist(vx, vz, s.position.y) < this.halfWidth + 6) continue
          const stake = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), matLambert(0x5a3a22))
          stake.position.set(vx, this.settleY(vx, vz) + 0.55, vz)
          this.decorRoot.add(stake)
          const leafM = new THREE.Mesh(new THREE.SphereGeometry(0.55, 5, 4), vine)
          leafM.position.set(vx, this.settleY(vx, vz) + 1.05, vz)
          leafM.scale.set(1.2, 0.7, 0.9)
          this.decorRoot.add(leafM)
        }
      }
      // Vyhlídková věž u cíle
      {
        const lookout = new THREE.Group()
        const base = new THREE.Mesh(new THREE.BoxGeometry(5, 2.2, 5), plaster)
        base.position.y = 1.1
        lookout.add(base)
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 8, 6), plaster)
        shaft.position.y = 6.2
        lookout.add(shaft)
        const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 6), gold)
        cap.position.y = 11.4
        lookout.add(cap)
        const lx = fin.position.x + fin.normal.x * (this.halfWidth + 18)
        const lz = fin.position.z + fin.normal.z * (this.halfWidth + 18)
        lookout.position.set(lx, this.settleY(lx, lz), lz)
        lookout.rotation.y = Math.atan2(fin.tangent.x, fin.tangent.z)
        this.decorRoot.add(lookout)
      }
      // Řady stromů — méně než Klecánek
      for (let i = 0; i < 12; i++) {
        const s = this.sample(i / 12)
        const side = i % 2 === 0 ? 1 : -1
        const tx = s.position.x + s.normal.x * (this.halfWidth + 12 + (i % 2) * 4) * side
        const tz = s.position.z + s.normal.z * (this.halfWidth + 12 + (i % 2) * 4) * side
        if (this.minRoadDist(tx, tz, s.position.y) < this.halfWidth + 9.5) continue
        const tree = new THREE.Group()
        const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 2.4, 5), trunk)
        bole.position.y = 1.2
        tree.add(bole)
        const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 5, 5), leaf)
        canopy.position.y = 3.1
        tree.add(canopy)
        tree.position.set(tx, this.settleY(tx, tz), tz)
        this.decorRoot.add(tree)
      }
      return
    }

    // Do Klecánek — hřbitov u cíle (jen tahle trať)
    if (id === 'klecanek') {
      const yard = new THREE.Group()
      const wall = matLambert(0x6a6860)
      const ring = new THREE.Mesh(new THREE.BoxGeometry(28, 1.6, 0.45), wall)
      ring.position.y = 0.8
      yard.add(ring)
      const ringB = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 22), wall)
      ringB.position.set(-13.5, 0.8, -4)
      yard.add(ringB)
      const ringC = ringB.clone()
      ringC.position.x = 13.5
      yard.add(ringC)
      const chapel = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), plasterChapel)
      chapel.position.set(0, 2.5, -8)
      yard.add(chapel)
      const capRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 4), matLambert(0x4a3a32))
      capRoof.rotation.y = Math.PI / 4
      capRoof.position.set(0, 6.6, -8)
      yard.add(capRoof)
      for (let i = 0; i < 14; i++) {
        const stoneM = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.18), matLambert(0x8a8680))
        stoneM.position.set(-10 + (i % 7) * 3.2, 0.45, -2 - Math.floor(i / 7) * 5)
        yard.add(stoneM)
      }
      const cypress = matLambert(0x1e3a24)
      for (const x of [-12, 12]) {
        const tree = new THREE.Mesh(new THREE.ConeGeometry(1.4, 6, 5), cypress)
        tree.position.set(x, 3.2, -6)
        yard.add(tree)
      }
      {
        const yx = fin.position.x + fin.normal.x * (this.halfWidth + 20)
        const yz = fin.position.z + fin.normal.z * (this.halfWidth + 20)
        yard.position.set(yx, this.settleY(yx, yz), yz)
      }
      yard.rotation.y = Math.atan2(fin.tangent.x, fin.tangent.z)
      this.group.add(yard)
    }

    const treeCount = id === 'klecanek' ? 16 : 18
    for (let i = 0; i < treeCount; i++) {
      const s = this.sample(i / treeCount)
      const side = i % 2 === 0 ? 1 : -1
      const tree = new THREE.Group()
      const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.8, 5), trunk)
      bole.position.y = 1.4
      tree.add(bole)
      const canopy = new THREE.Mesh(
        new THREE.SphereGeometry(1.8, id === 'klecanek' ? 5 : 6, id === 'klecanek' ? 5 : 6),
        leaf,
      )
      canopy.position.y = 3.6
      tree.add(canopy)
      const tx = s.position.x + s.normal.x * (this.halfWidth + 10 + (i % 3) * 4) * side
      const tz = s.position.z + s.normal.z * (this.halfWidth + 10 + (i % 3) * 4) * side
      tree.position.set(tx, this.settleY(tx, tz), tz)
      this.decorRoot.add(tree)
    }

    // Živé ploty — Klecánek
    if (id === 'klecanek') {
      for (let i = 0; i < 10; i++) {
        const s = this.sample(i / 10)
        for (const side of [-1, 1] as const) {
          const lat = this.safeLateral(s, side, 2.8) + 2
          if (lat > this.halfWidth + 32) continue
          const hx = s.position.x + s.normal.x * lat * side
          const hz = s.position.z + s.normal.z * lat * side
          if (this.minRoadDist(hx, hz, s.position.y) < this.halfWidth + 4.5) continue
          const hdg = new THREE.Mesh(new THREE.BoxGeometry(1, 0.65, 3.8), hedge)
          hdg.position.set(hx, this.terrainYAt(hx, hz) + 0.3, hz)
          hdg.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
          this.decorRoot.add(hdg)
        }
      }
    }
  }

  /**
   * Mexiko — stejná stavba jako climb: boxy / InstancedMesh.
   * +N = Brooklyn + vyšší paneláky · −N = vesnice, pláž, moře.
   */
  private buildMexiku(): void {
    const theme = this.def.theme
    // Teplá omítka / cihla — reálnější Mexiko (ne šedo-zelený sci-fi)
    const plaster = [0xc8b498, 0xd4c4a8, 0xb8a888, 0xc0a890].map((c) => matLambert(c))
    const panel = [0xb0a898, 0xa09888, 0xc4b8a4].map((c) => matLambert(c))
    const roof = matLambert(0x8a4030)
    const hedge = matLambert(0x3a5a28)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const field = matLambert(0x5a7a3a)
    const accent = matLambert(0xa87848, { emissive: 0x6a4a28, emissiveIntensity: 0.08 })
    const bankEarth = matLambert(0x5a6a40)
    const rock = matLambert(0x7a7a70)
    const dummy = new THREE.Object3D()

    this.addValleyBanks(bankEarth, rock, {
      segs: 8,
      innerLat: this.halfWidth + 14,
      outerLat: this.halfWidth + 28,
    })

    // Cedule Brooklyn — klidnější barvy
    const start = this.sample(0)
    const sign = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 5), matLambert(0x5a4a3a))
    pole.position.y = 1.7
    sign.add(pole)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#2a2418'
      ctx.fillRect(0, 0, 256, 64)
      ctx.strokeStyle = '#c4a878'
      ctx.lineWidth = 4
      ctx.strokeRect(4, 4, 248, 56)
      ctx.fillStyle = '#f0e8d8'
      ctx.font = 'bold 36px Impact, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('BROOKLYN', 128, 34)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.generateMipmaps = false
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 0.8),
        new THREE.MeshBasicMaterial({ map: tex }),
      )
      label.position.set(0, 3.2, 0.08)
      sign.add(label)
    }
    const sx = start.position.x + start.normal.x * (this.halfWidth + 8)
    const sz = start.position.z + start.normal.z * (this.halfWidth + 8)
    sign.position.set(sx, this.settleY(sx, sz), sz)
    this.group.add(sign)

    this.addBusShelter(0.05, 1)
    this.addBusShelter(0.95, -1)

    // City strana: méně bloků = méně hitch (60+ fps)
    for (let i = 0; i < 8; i++) {
      const s = this.sample(0.05 + i * 0.1)
      const w = 7 + (i % 3)
      const h = 6 + (i % 4) * 1.5
      const house = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 9), panel[i % panel.length]!)
      body.position.y = h / 2
      house.add(body)
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.35, 9.2), accent)
      top.position.y = h + 0.1
      house.add(top)
      const dist = this.halfWidth + 14 + (i % 2) * 4
      const hx = s.position.x + s.normal.x * dist
      const hz = s.position.z + s.normal.z * dist
      house.position.set(hx, this.settleY(hx, hz), hz)
      house.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.decorRoot.add(house)
    }

    // Vesnice: méně domků (vyvážení FPS)
    for (let i = 0; i < 7; i++) {
      const s = this.sample(0.08 + i * 0.11)
      const w = 5.5 + (i % 2)
      const house = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, 7), plaster[i % plaster.length]!)
      body.position.y = 1.8
      house.add(body)
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.68, 2.1, 4), roof)
      r.rotation.y = Math.PI / 4
      r.position.y = 4.5
      house.add(r)
      const dist = this.halfWidth + 13 + (i % 2) * 3
      const hx = s.position.x - s.normal.x * dist
      const hz = s.position.z - s.normal.z * dist
      house.position.set(hx, this.settleY(hx, hz), hz)
      house.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.decorRoot.add(house)
    }

    const mid = this.sample(0.55)
    const fieldX = mid.position.x - mid.normal.x * 70
    const fieldZ = mid.position.z - mid.normal.z * 70
    const meadow = new THREE.Mesh(new THREE.PlaneGeometry(140, 90), field)
    meadow.rotation.x = -Math.PI / 2
    meadow.position.set(fieldX, this.terrainYAt(fieldX, fieldZ) - 0.2, fieldZ)
    this.group.add(meadow)
    const apronX = mid.position.x - mid.normal.x * 36
    const apronZ = mid.position.z - mid.normal.z * 36
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(70, 22), matLambert(0x8a8070))
    apron.rotation.x = -Math.PI / 2
    apron.position.set(apronX, this.terrainYAt(apronX, apronZ) - 0.08, apronZ)
    this.group.add(apron)

    // Stromy — InstancedMesh (méně instancí = méně hitch)
    const boleGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.6, 5)
    const canopyGeo = new THREE.SphereGeometry(1.6, 5, 5)
    const nTrees = 12
    const boles = new THREE.InstancedMesh(boleGeo, trunk, nTrees)
    const canopies = new THREE.InstancedMesh(canopyGeo, leaf, nTrees)
    for (let i = 0; i < nTrees; i++) {
      const s = this.sample(i / nTrees)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const dist = this.halfWidth + 9 + (i % 3) * 3
      const tx = s.position.x + s.normal.x * dist * side
      const tz = s.position.z + s.normal.z * dist * side
      const gy = this.settleY(tx, tz)
      dummy.position.set(tx, gy + 1.3, tz)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      boles.setMatrixAt(i, dummy.matrix)
      dummy.position.y = gy + 3.3
      dummy.updateMatrix()
      canopies.setMatrixAt(i, dummy.matrix)
    }
    boles.instanceMatrix.needsUpdate = true
    canopies.instanceMatrix.needsUpdate = true
    this.decorRoot.add(boles, canopies)

    // Živé ploty — InstancedMesh
    const hdgGeo = new THREE.BoxGeometry(1, 0.6, 3.4)
    const nHedge = 7
    const hedges = new THREE.InstancedMesh(hdgGeo, hedge, nHedge * 2)
    let hi = 0
    for (let i = 0; i < nHedge; i++) {
      const s = this.sample(i / nHedge)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      for (const side of [-1, 1] as const) {
        const hx = s.position.x + s.normal.x * (this.halfWidth + 5.5) * side
        const hz = s.position.z + s.normal.z * (this.halfWidth + 5.5) * side
        dummy.position.set(hx, this.settleY(hx, hz) + 0.28, hz)
        dummy.rotation.set(0, yaw, 0)
        dummy.updateMatrix()
        hedges.setMatrixAt(hi++, dummy.matrix)
      }
    }
    hedges.instanceMatrix.needsUpdate = true
    this.decorRoot.add(hedges)
  }

  private addBusShelter(t: number, side: 1 | -1): void {
    const s = this.sample(t)
    const glass = matLambert(0x88a0b0)
    const metal = matLambert(0x3a3a3a)
    const g = new THREE.Group()
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.6), metal)
    roof.position.y = 2.4
    g.add(roof)
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.08), glass)
    back.position.set(0, 1.2, -0.7)
    g.add(back)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), metal)
    pole.position.set(2.4, 1.6, 0.2)
    g.add(pole)
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.08), matLambert(0xd4a017))
    sign.position.set(2.4, 3.1, 0.2)
    g.add(sign)
    const dist = this.halfWidth + 5.5
    const gx = s.position.x + s.normal.x * dist * side
    const gz = s.position.z + s.normal.z * dist * side
    g.position.set(gx, this.settleY(gx, gz), gz)
    g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
    this.group.add(g)
  }

  private parkedSedan(color: number): THREE.Group {
    const g = new THREE.Group()
    const body = matLambert(color)
    const dark = matLambert(0x1a1a1a)
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.5, 4.4), body)
    chassis.position.y = 0.55
    g.add(chassis)
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 1.8), matLambert(0x5a7388))
    cabin.position.set(0, 1.05, -0.1)
    g.add(cabin)
    const kidneyL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.1), dark)
    kidneyL.position.set(-0.2, 0.55, 2.22)
    g.add(kidneyL)
    const kidneyR = kidneyL.clone()
    kidneyR.position.x = 0.2
    g.add(kidneyR)
    const tire = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 8)
    tire.rotateZ(Math.PI / 2)
    for (const [x, z] of [
      [-0.95, 1.3],
      [0.95, 1.3],
      [-0.95, -1.35],
      [0.95, -1.35],
    ]) {
      const w = new THREE.Mesh(tire, dark)
      w.position.set(x, 0.38, z)
      g.add(w)
    }
    return g
  }

  /** Monsterstruck — bahnitá aréna, pneumatiky, rampy, reflektory. */
  private buildRally(): void {
    const theme = this.def.theme
    const dirt = matLambert(theme.ground)
    const mud = matLambert(0x4a3a28)
    const hillA = matLambert(0x7a6848)
    const hillB = matLambert(0x6a5840)
    const metal = matLambert(0x3a3a42)
    const tireMat = matLambert(0x121212)
    const lampMat = matLambert(0xd8c8a0, { emissive: 0xc4a060, emissiveIntensity: 0.35 })
    const plaster = [0x6a6460, 0x5a5450, 0x484440].map((c) => matLambert(c))
    const roof = matLambert(0x3a3028)

    // Kopce daleko od vozovky (dřív kužely 40–68 m zasahovaly do tratě)
    for (let i = 0; i < 12; i++) {
      const s = this.sample((i + 0.5) / 12)
      const side = i % 2 === 0 ? 1 : -1
      const r = 22 + (i % 3) * 8
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.48),
        i % 2 === 0 ? hillA : hillB,
      )
      const dist = 160 + (i % 4) * 45
      const dx = s.position.x + s.normal.x * dist * side
      const dz = s.position.z + s.normal.z * dist * side
      if (this.minRoadDist(dx, dz, s.position.y) < this.halfWidth + 40) continue
      hill.position.set(dx, this.terrainYAt(dx, dz) - r * 0.15, dz)
      hill.scale.set(1.4, 0.55, 1.15)
      hill.castShadow = false
      hill.receiveShadow = false
      hill.userData.noCastShadow = true
      this.group.add(hill)
    }

    // Staveniště / novostavby — hustší obydlená zóna mimo trať
    for (let i = 0; i < 16; i++) {
      const s = this.sample(0.04 + i * 0.058)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 14)
      if (lat > this.halfWidth + 40) continue
      const w = 8 + (i % 3) * 2
      const h = 4 + (i % 4) * 1.4
      const block = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 7), plaster[i % plaster.length])
      body.position.y = h / 2
      block.add(body)
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, 0.35, 7.2), roof)
      top.position.y = h + 0.1
      block.add(top)
      const bx = s.position.x + s.normal.x * lat * side
      const bz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(bx, bz, s.position.y) < this.halfWidth + 6) continue
      block.position.set(bx, this.settleY(bx, bz), bz)
      block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      block.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.castShadow = false
          o.receiveShadow = false
          o.userData.noCastShadow = true
        }
      })
      this.group.add(block)
    }

    for (let i = 0; i < 22; i++) {
      const s = this.sample(i / 22)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const stack = new THREE.Group()
      const layers = 2 + (i % 3)
      for (let y = 0; y < layers; y++) {
        for (let n = 0; n < 3; n++) {
          const tire = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.22, 6, 10), tireMat)
          tire.rotation.x = Math.PI / 2
          tire.position.set((n - 1) * 1.15, 0.35 + y * 0.7, 0)
          stack.add(tire)
        }
      }
      const dist = this.safeLateral(s, side, 3.5)
      const sx = s.position.x + s.normal.x * dist * side
      const sz = s.position.z + s.normal.z * dist * side
      stack.position.set(sx, this.settleY(sx, sz), sz)
      stack.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(stack)
    }

    for (let i = 0; i < 8; i++) {
      const s = this.sample(0.08 + i * 0.11)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 10), metal)
      ramp.rotation.x = -0.22
      const rLat = this.safeLateral(s, side, 5)
      const rx = s.position.x + s.normal.x * rLat * side
      const rz = s.position.z + s.normal.z * rLat * side
      ramp.position.set(rx, this.terrainYAt(rx, rz) + 1.2, rz)
      ramp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(ramp)
    }

    for (let i = 0; i < 20; i++) {
      const s = this.sample(i / 20)
      for (const side of [-1, 1] as const) {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 4.2), dirt)
        const bx = s.position.x + s.normal.x * (this.halfWidth + 4.2) * side
        const bz = s.position.z + s.normal.z * (this.halfWidth + 4.2) * side
        if (this.minRoadDist(bx, bz, s.position.y) < this.halfWidth + 2.5) continue
        bank.position.set(bx, this.terrainYAt(bx, bz) + 0.08, bz)
        bank.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
        this.group.add(bank)
      }
    }

    for (let i = 0; i < 10; i++) {
      const s = this.sample(0.05 + i / 11)
      const side = i % 2 === 0 ? 1 : -1
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(2.4 + (i % 3) * 0.6, 10), mud)
      puddle.rotation.x = -Math.PI / 2
      const px = s.position.x + s.normal.x * (this.halfWidth + 10 + (i % 2) * 5) * side
      const pz = s.position.z + s.normal.z * (this.halfWidth + 10 + (i % 2) * 5) * side
      puddle.position.set(px, this.terrainYAt(px, pz) + 0.02, pz)
      this.group.add(puddle)
    }

    for (let i = 0; i < 8; i++) {
      const s = this.sample(0.08 + i / 9)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const dist = this.safeLateral(s, side, 3)
      const px = s.position.x + s.normal.x * dist * side
      const pz = s.position.z + s.normal.z * dist * side
      if (this.minRoadDist(px, pz, s.position.y) < this.halfWidth + 3) continue
      const py = this.terrainYAt(px, pz)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 11, 6), metal)
      pole.position.set(px, py + 5.5, pz)
      this.group.add(pole)
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 0.45), lampMat)
      lamp.position.set(px, py + 11.2, pz)
      this.group.add(lamp)
    }

    const stake = matLambert(0xb07040)
    for (let i = 0; i < 24; i++) {
      const s = this.sample(i / 24)
      for (const side of [-1, 1] as const) {
        const px = s.position.x + s.normal.x * (this.halfWidth + 3.2) * side
        const pz = s.position.z + s.normal.z * (this.halfWidth + 3.2) * side
        if (this.minRoadDist(px, pz, s.position.y) < this.halfWidth + 2) continue
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 5), stake)
        pole.position.set(px, this.terrainYAt(px, pz) + 0.55, pz)
        this.group.add(pole)
      }
    }
  }

  private addBarrierRibbon(positions: number[], color: number): void {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    const indices: number[] = []
    const pairs = positions.length / 6
    for (let i = 0; i < pairs - 1; i++) {
      // Vynech úseky s nulovou výškou — jinak zůstane „čára“ nad asfaltem
      const y0 = positions[i * 6 + 1]!
      const y1 = positions[i * 6 + 4]!
      const y2 = positions[(i + 1) * 6 + 1]!
      const y3 = positions[(i + 1) * 6 + 4]!
      if (y1 - y0 < 0.05 && y3 - y2 < 0.05) continue
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    if (indices.length === 0) return
    geo.setIndex(indices)
    geo.computeVertexNormals()
    const mat =
      this.def.world === 'city'
        ? matLambert(color, { emissive: color, emissiveIntensity: 0.55 })
        : matLambert(color)
    this.group.add(new THREE.Mesh(geo, mat))
  }

  private buildCheckpoints(): void {
    // Sandbox (Plácek) — žádné checkpointy
    if (this.def.sandbox) return
    // 3× méně než dřív (okruh 7→2, etapa 13→4), vždy ≥ 2
    const n = this.def.loop ? 2 : Math.max(2, Math.round(13 / 3))
    for (let i = 0; i < n; i++) {
      const t = this.def.loop ? i / n : i / (n - 1)
      const s = this.sample(t)
      // Y = povrch vozovky (bank + roadLift), ne curve Y
      this.checkpoints.push(
        new THREE.Vector3(s.position.x, this.surfaceYAt(s.position.x, s.position.z, t), s.position.z),
      )
    }
    this.addCheckpointVisuals()
  }

  /**
   * Checkpointy / start-cíl — jen sloupy + vlajky vedle asfaltu.
   * Žádný trám / oblouk nad vozovkou (Námko i ostatní mapy).
   */
  private addCheckpointVisuals(): void {
    const theme = this.def.theme
    const n = this.checkpoints.length
    const postMat = matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.25 })
    const flagMat = matLambert(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.2 })
    const placeSideMarkers = (t: number, finish = false) => {
      const s = this.sample(t)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      const roll = this.bankRollAt(s.position.x, s.position.z, t)
      const y = this.surfaceYAt(s.position.x, s.position.z, t)
      const gate = new THREE.Group()
      gate.userData.decorTier = 'standard'
      gate.position.set(s.position.x, y, s.position.z)
      gate.rotation.order = 'YXZ'
      gate.rotation.y = yaw
      gate.rotation.z = roll
      for (const side of [-1, 1] as const) {
        // Námko / cíl: dál od hrany — dřív lat≈1.15 lezlo do asfaltu (2 sloupky u cíle)
        const lat = this.halfWidth + (this.def.world === 'town' ? 4.2 : 2.8)
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 6), postMat)
        post.position.set(lat * side, 1.1, 0)
        gate.add(post)
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.35, 0.06),
          finish ? postMat : flagMat,
        )
        flag.position.set(lat * side, 2.15, 0)
        gate.add(flag)
      }
      this.group.add(gate)
    }
    for (let i = 1; i < n; i++) {
      if (!this.def.loop && i === n - 1) continue
      const t = this.def.loop ? i / n : i / (n - 1)
      placeSideMarkers(t)
    }
    if (this.def.loop) placeSideMarkers(0, true)
  }

  sample(t: number): TrackSample {
    let tt = t
    if (this.def.loop) tt = ((t % 1) + 1) % 1
    else tt = Math.max(0, Math.min(1, t))
    const position = this.curve.getPointAt(tt, this.tmpPos).clone()
    const tangent = this.curve.getTangentAt(tt, this.tmpTan).clone().normalize()
    return { position, tangent, normal: this.sideNormal(tangent), t: tt }
  }

  /** Výška povrchu vozovky v (x,z) včetně banku — stejná matematika jako buildMeshes. */
  surfaceYAt(x: number, z: number, hint?: number): number {
    const t = this.progressAt(x, z, hint)
    const s = this.sample(t)
    const bankRad = ((this.def.bankAngleDeg ?? 0) * Math.PI) / 180
    const raise = bankRad > 0.001 ? this.halfWidth * Math.tan(bankRad) : 0
    const base = s.position.y + this.roadLift + raise
    if (bankRad < 0.001) return base
    const lat = (x - s.position.x) * s.normal.x + (z - s.position.z) * s.normal.z
    const olen = Math.hypot(s.position.x, s.position.z) || 1
    const nOut = (s.normal.x * s.position.x + s.normal.z * s.position.z) / olen
    return base + nOut * lat * Math.tan(bankRad)
  }

  /** Roll vozidla podle banku (kladný = náklon ke středu oválu / dovnitř). */
  bankRollAt(x: number, z: number, hint?: number): number {
    const bankRad = ((this.def.bankAngleDeg ?? 0) * Math.PI) / 180
    if (bankRad < 0.001) return 0
    const t = this.progressAt(x, z, hint)
    const s = this.sample(t)
    const olen = Math.hypot(s.position.x, s.position.z) || 1
    const nOut = (s.normal.x * s.position.x + s.normal.z * s.position.z) / olen
    // nOut > 0 = normal ven → záporný roll = vozidlo sedí se spádem tratě (ne proti banku)
    return -nOut * bankRad
  }

  progressAt(x: number, z: number, hint?: number): number {
    const n = this.lutN
    let bestI = 0
    let bestD = Infinity

    if (hint !== undefined) {
      const start = Math.floor(
        this.def.loop
          ? (((hint % 1) + 1) % 1) * n
          : Math.max(0, Math.min(1, hint)) * (n - 1),
      )
      for (let k = -12; k <= 12; k++) {
        const i = this.def.loop ? (start + k + n) % n : Math.max(0, Math.min(n - 1, start + k))
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

    const i0 = bestI
    const i1 = this.def.loop ? (bestI + 1) % n : Math.min(n - 1, bestI + 1)
    const a = this.lut[i0]
    const b = this.lut[i1]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const len2 = abx * abx + abz * abz || 1
    const u = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / len2))
    if (this.def.loop) return (i0 + u) / n
    return (i0 + u) / Math.max(1, n - 1)
  }

  findJumpPad(x: number, z: number): JumpPad | null {
    for (const p of this.jumpPads) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) return p
    }
    return null
  }

  constrain(
    x: number,
    z: number,
    hint?: number,
  ): { x: number; z: number; hit: boolean; t: number; nx: number; nz: number } {
    if (this.def.sandbox) {
      const b = this.def.sandboxBounds ?? { halfX: 170, halfZ: 110 }
      let cx = x
      let cz = z
      let nx = 0
      let nz = 0
      let hit = false
      if (x > b.halfX) {
        cx = b.halfX
        nx = -1
        hit = true
      } else if (x < -b.halfX) {
        cx = -b.halfX
        nx = 1
        hit = true
      }
      if (z > b.halfZ) {
        cz = b.halfZ
        nz = -1
        hit = true
      } else if (z < -b.halfZ) {
        cz = -b.halfZ
        nz = 1
        hit = true
      }
      const t = this.progressAt(cx, cz, hint)
      return { x: cx, z: cz, hit, t, nx, nz }
    }

    const t = this.progressAt(x, z, hint)
    const idx = this.def.loop
      ? Math.floor(t * this.lutN) % this.lutN
      : Math.max(0, Math.min(this.lutN - 1, Math.floor(t * (this.lutN - 1))))
    const p = this.lut[idx]
    const lateral = (x - p.x) * p.nx + (z - p.z) * p.nz
    const limit = this.halfWidth + 0.55
    if (Math.abs(lateral) <= limit) return { x, z, hit: false, t, nx: 0, nz: 0 }
    const side = Math.sign(lateral) || 1
    const clamped = side * limit
    // Normála stěny směrem dovnitř tratě (odražení zpět na vozovku)
    return {
      x: p.x + p.nx * clamped,
      z: p.z + p.nz * clamped,
      hit: true,
      t,
      nx: -p.nx * side,
      nz: -p.nz * side,
    }
  }

  getStartPose(gridIndex: number): { x: number; z: number; y: number; heading: number } {
    if (this.def.sandbox) {
      const row = Math.floor(gridIndex / 2)
      const side = gridIndex % 2 === 0 ? -1 : 1
      return {
        x: side * 4.5,
        z: -18 - row * 7,
        y: 0,
        heading: 0, // směr k vodě (+Z)
      }
    }
    // 2×2 grid: řada 0 (0|1) vpředu, řada 1 (2|3) za nimi — stejná „lajna“
    const baseT = this.def.loop ? 0.018 : 0.012
    const row = Math.floor(gridIndex / 2)
    const side = gridIndex % 2 === 0 ? -1 : 1
    const s = this.sample(baseT)
    const lateral = side * Math.min(3.4, this.halfWidth * 0.32)
    const gap = Math.max(5.5, this.halfWidth * 0.85)
    const along = -row * gap
    const x = s.position.x + s.normal.x * lateral + s.tangent.x * along
    const z = s.position.z + s.normal.z * lateral + s.tangent.z * along
    // Bankovaný ovál: Y = skutečný povrch v lane (ne středová osa) + drobný lift
    const y = this.surfaceYAt(x, z, baseT) + 0.06
    return {
      x,
      z,
      y,
      heading: Math.atan2(s.tangent.x, s.tangent.z),
    }
  }
}
