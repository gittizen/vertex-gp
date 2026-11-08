import * as THREE from 'three'
import {
  groundMap,
  matAsphalt,
  matAsphaltShoulder,
  matGround,
  matLambert,
  normalizeAsphaltColor,
  plasterMap,
  shadeRoad,
} from '../render/Materials'
import { createSkyBackdrop } from '../render/SkyBackdrop'
import type { DecorLevel } from '../render/AtmosphereSettings'
import type { TrackDef } from './TrackDefs'

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
  /** Override tempa AI (např. po změně vozidla). */
  aiSpeedMult: number

  constructor(scene: THREE.Scene, def: TrackDef) {
    this.scene = scene
    this.def = def
    this.aiSpeedMult = def.aiSpeedMult
    this.halfWidth = def.halfWidth
    this.lutN = def.loop ? 192 : 384
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
    // Námko / kasárny = hustý okruh → jen kameny dál od hrany, žádné keře do zatáček
    const tight = this.def.id === 'klecany' || this.def.id === 'kasarny'
    const grass = matLambert(this.def.id === 'hruby' ? 0x3a6a28 : 0x3a5230)
    const dry = matLambert(0x6a5a38)
    const bush = matLambert(0x2a4024)
    const rock = matLambert(0x6a6860)
    const n = tight ? 28 : this.def.loop ? 48 : 72
    const clear = this.halfWidth + (tight ? 5.5 : 4.2)
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

  private terrainYAt(x: number, z: number, roadLift = 0.14, groundY = -0.02): number {
    const p = this.nearestLut(x, z)
    const dist = Math.hypot(x - p.x, z - p.z)
    const crest = p.y + roadLift
    const roadClear = this.halfWidth + 0.25
    const bermOuter = this.halfWidth + 5.2
    const midBank = this.halfWidth + 18
    const fade = this.halfWidth + 160
    const noise = this.groundNoise(x, z)
    // Pod asfaltem mírně níž — bez díry, bez z-fightu; noise až dál od hrany
    if (dist <= roadClear) return crest - 0.08
    if (dist <= bermOuter) {
      const u = (dist - roadClear) / Math.max(0.01, bermOuter - roadClear)
      const s = u * u * (3 - 2 * u)
      const edge = crest - 0.05
      const outer = crest * 0.55 + groundY * 0.45 + noise * 0.08 * s
      return edge * (1 - s) + outer * s
    }
    if (dist <= midBank) {
      const u = (dist - bermOuter) / Math.max(0.01, midBank - bermOuter)
      const s = u * u * (3 - 2 * u)
      const inner = crest * 0.55 + groundY * 0.45 + noise * 0.35
      const outer = crest * 0.18 + groundY * 0.82 + noise * 0.55
      return inner * (1 - s) + outer * s
    }
    if (dist >= fade) return groundY + noise * 0.45
    const t = (dist - midBank) / (fade - midBank)
    const s = t * t * (3 - 2 * t)
    const bermEdge = crest * 0.18 + groundY * 0.82 + noise * 0.55
    return bermEdge * (1 - s) + (groundY + noise * 0.45) * s
  }

  /** Usadí objekt na terén (spodek na zemi, ne levitace). */
  private settleY(x: number, z: number, sink = 0.04): number {
    return this.terrainYAt(x, z) - sink
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
    const segs = this.def.loop ? 240 : this.def.heights ? 360 : 300
    // První ring = vnější berm — navazuje na apron (žádná mezera)
    const rings = [
      this.halfWidth + 2.6,
      this.halfWidth + 4.4,
      this.halfWidth + 6.8,
      this.halfWidth + 9.5,
      this.halfWidth + 13,
      this.halfWidth + 18,
      this.halfWidth + 25,
      this.halfWidth + 34,
      this.halfWidth + 46,
      this.halfWidth + 62,
      this.halfWidth + 84,
      this.halfWidth + 112,
      this.halfWidth + 150,
    ]
    const cols = rings.length

    for (const side of [-1, 1] as const) {
      const pos: number[] = []
      const idx: number[] = []
      for (let i = 0; i <= segs; i++) {
        const t = i / segs
        const s = this.sample(Math.min(1, t))
        for (let r = 0; r < cols; r++) {
          const lat = rings[r]!
          const x = s.position.x + s.normal.x * lat * side
          const z = s.position.z + s.normal.z * lat * side
          pos.push(x, this.terrainYAt(x, z, roadLift, groundY), z)
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
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
      geo.setIndex(idx)
      geo.computeVertexNormals()
      const mesh = new THREE.Mesh(geo, mat)
      mesh.receiveShadow = true
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
    // Hustší triangulace — hladší zatáčky + méně děr v okolí
    const segments = this.def.loop ? 400 : this.def.heights ? 720 : 560
    const theme = this.def.theme
    const roadPositions: number[] = []
    const roadIndices: number[] = []
    const barrierL: number[] = []
    const barrierR: number[] = []
    const world = this.def.world
    const wallH = world === 'city' ? 0.45 : 0.4
    const bermW = 5.2
    const groundY = -0.02
    const roadLift = 0.14
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

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const p = this.curve.getPointAt(Math.min(1, t))
      const tangent = this.curve.getTangentAt(Math.min(1, t)).normalize()
      const n = this.sideNormal(tangent)
      const y = p.y + roadLift
      const left = p.clone().addScaledVector(n, this.halfWidth)
      const right = p.clone().addScaledVector(n, -this.halfWidth)
      roadPositions.push(left.x, y, left.z, right.x, y, right.z)
      if (prevPt) along += p.distanceTo(prevPt)
      prevPt = p.clone()
      const v = along * 0.085
      roadUvs.push(0, v, 1, v)

      // Fill pod vozovkou sleduje crest (ne flat groundY) — žádná černá díra
      const under = y - 0.22
      fillPos.push(left.x, under, left.z, right.x, under, right.z)

      const shW = 1.05
      const lShIn = p.clone().addScaledVector(n, this.halfWidth - 0.02)
      const lShOut = p.clone().addScaledVector(n, this.halfWidth + shW)
      const rShIn = p.clone().addScaledVector(n, -(this.halfWidth - 0.02))
      const rShOut = p.clone().addScaledVector(n, -(this.halfWidth + shW))
      shoulderLpos.push(lShOut.x, y - 0.01, lShOut.z, lShIn.x, y - 0.01, lShIn.z)
      shoulderRpos.push(rShIn.x, y - 0.01, rShIn.z, rShOut.x, y - 0.01, rShOut.z)

      const lIn = p.clone().addScaledVector(n, this.halfWidth + shW)
      const lOut = p.clone().addScaledVector(n, this.halfWidth + bermW)
      const rIn = p.clone().addScaledVector(n, -(this.halfWidth + shW))
      const rOut = p.clone().addScaledVector(n, -(this.halfWidth + bermW))
      const lOutY = this.terrainYAt(lOut.x, lOut.z, roadLift, groundY)
      const rOutY = this.terrainYAt(rOut.x, rOut.z, roadLift, groundY)
      bermLpos.push(lOut.x, lOutY, lOut.z, lIn.x, y - 0.06, lIn.z)
      bermRpos.push(rIn.x, y - 0.06, rIn.z, rOut.x, rOutY, rOut.z)

      // Skirt jen krátký (k under), ne až na flat ground — méně „prosklené stěny“
      skirtLpos.push(left.x, y, left.z, left.x, under, left.z)
      skirtRpos.push(right.x, under, right.z, right.x, y, right.z)

      const apronW = bermW + 7
      const apron2W = bermW + 16
      const lApron = p.clone().addScaledVector(n, this.halfWidth + apronW)
      const rApron = p.clone().addScaledVector(n, -(this.halfWidth + apronW))
      const lApron2 = p.clone().addScaledVector(n, this.halfWidth + apron2W)
      const rApron2 = p.clone().addScaledVector(n, -(this.halfWidth + apron2W))
      const lApronY = this.terrainYAt(lApron.x, lApron.z, roadLift, groundY)
      const rApronY = this.terrainYAt(rApron.x, rApron.z, roadLift, groundY)
      const lApron2Y = this.terrainYAt(lApron2.x, lApron2.z, roadLift, groundY)
      const rApron2Y = this.terrainYAt(rApron2.x, rApron2.z, roadLift, groundY)
      apronLpos.push(lApron.x, lApronY, lApron.z, lOut.x, lOutY, lOut.z)
      apronRpos.push(rOut.x, rOutY, rOut.z, rApron.x, rApronY, rApron.z)
      apron2Lpos.push(lApron2.x, lApron2Y, lApron2.z, lApron.x, lApronY, lApron.z)
      apron2Rpos.push(rApron.x, rApronY, rApron.z, rApron2.x, rApron2Y, rApron2.z)

      barrierL.push(left.x + n.x * 0.2, y, left.z + n.z * 0.2, left.x + n.x * 0.2, y + wallH, left.z + n.z * 0.2)
      barrierR.push(right.x - n.x * 0.2, y, right.z - n.z * 0.2, right.x - n.x * 0.2, y + wallH, right.z - n.z * 0.2)

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
    const roadMat = matAsphalt(theme.road)
    if (world === 'city') {
      roadMat.emissiveIntensity = 0.14
      roadMat.color.setHex(0x6e727a)
    }
    roadMat.polygonOffset = true
    roadMat.polygonOffsetFactor = -1
    roadMat.polygonOffsetUnits = -1
    const roadMesh = new THREE.Mesh(roadGeo, roadMat)
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
        ? 0x2a2a32
        : world === 'plaza'
          ? 0x5a6068
          : world === 'rally'
            ? 0x5a4a32
            : this.def.id === 'klecany'
              ? 0x5a5848
              : this.def.id === 'kasarny'
                ? 0x4a4e48
                : 0x4a4a42
    const bermMat = matGround(bermHex, { map: gMap })
    bermMat.polygonOffset = true
    bermMat.polygonOffsetFactor = 2
    bermMat.polygonOffsetUnits = 2
    const bermDark = matGround(0x3a3a42)
    bermDark.polygonOffset = true
    bermDark.polygonOffsetFactor = 1
    bermDark.polygonOffsetUnits = 1
    const shoulderMat = matAsphaltShoulder(theme.road)
    // Fill pod tratí — skoro barva silnice, ne černá / zelená
    const fillMat = matAsphalt(shadeRoad(normalizeAsphaltColor(theme.road), 0.88))
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
    const ground = new THREE.Mesh(new THREE.CircleGeometry(groundSize, 64), farMat)
    ground.rotation.x = -Math.PI / 2
    // Níže než berm — žádný „jezero“ pod tratí / z-fight se zelenou
    ground.position.y = groundY - 0.35
    ground.receiveShadow = true
    if ((world === 'rally' || world === 'climb') && !this.def.loop) {
      const mid = this.sample(0.5).position
      ground.position.set(mid.x, groundY - 0.35, mid.z)
    }
    this.group.add(ground)
    this.addTerrainBlanket(farMat, groundY, roadLift)

    this.addRoadMarkings()

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
        start.position.y + 0.1,
        start.position.z + start.normal.z * i * (this.halfWidth / 3.5),
      )
      stripe.rotation.y = Math.atan2(start.tangent.x, start.tangent.z)
      this.group.add(stripe)
    }

    if (!this.def.loop) {
      const fin = this.sample(1)
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth * 2.2, 0.4, 0.4),
        matLambert(theme.accent),
      )
      arch.position.set(fin.position.x, fin.position.y + 4, fin.position.z)
      this.group.add(arch)
    }
  }

  /** Volná plocha (Plácek) — velký asfaltový pad, bez závodní pásky. */
  private buildSandboxMeshes(): void {
    const theme = this.def.theme
    const b = this.def.sandboxBounds ?? { halfX: 170, halfZ: 110 }
    const padW = b.halfX * 2
    const padD = b.halfZ * 2

    const padY = 0.1
    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(padW, padD),
      matAsphalt(theme.road),
    )
    pad.rotation.x = -Math.PI / 2
    pad.position.y = padY
    this.group.add(pad)
    // Základ pod pad — ať se nevznáší nad trávou
    const padBase = new THREE.Mesh(
      new THREE.BoxGeometry(padW + 0.4, padY + 0.04, padD + 0.4),
      matLambert(0x2a2a30),
    )
    padBase.position.y = padY * 0.5 - 0.02
    this.group.add(padBase)

    // Světlé čáry — mřížka na freestyle
    const lineMat = new THREE.LineBasicMaterial({ color: 0xe8e8ec, transparent: false })
    const lineY = padY + 0.04
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue
      const x = (i / 3) * b.halfX * 0.85
      const z = (i / 3) * b.halfZ * 0.85
      const hx = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-b.halfX * 0.92, lineY, z),
        new THREE.Vector3(b.halfX * 0.92, lineY, z),
      ])
      const hz = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, lineY, -b.halfZ * 0.92),
        new THREE.Vector3(x, lineY, b.halfZ * 0.92),
      ])
      this.group.add(new THREE.Line(hx, lineMat))
      this.group.add(new THREE.Line(hz, lineMat.clone()))
    }
    // Středový kruh
    const ringPts: THREE.Vector3[] = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2
      ringPts.push(new THREE.Vector3(Math.cos(a) * 18, lineY + 0.01, Math.sin(a) * 18))
    }
    this.group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: false }),
      ),
    )

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(520, 40),
      matGround(theme.ground, { map: groundMap('plaza', 'placek') }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.02
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

  /** Markování — pevné ribbon pásy (ne tenké Line), čitelnější jako reálný asfalt. */
  private addRoadMarkings(): void {
    const world = this.def.world
    const hw = this.halfWidth
    const markY = 0.165
    const samples = world === 'climb' || world === 'rally' ? 280 : this.def.loop ? 240 : 180
    const edgeW = 0.14
    const dashW = 0.11

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
      const mat = new THREE.MeshBasicMaterial({
        color,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.renderOrder = order
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.userData.noCastShadow = true
      this.group.add(mesh)
    }

    const solidL: THREE.Vector3[] = []
    const solidR: THREE.Vector3[] = []
    for (let i = 0; i <= samples; i++) {
      const s = this.sample(i / samples)
      const y = s.position.y + markY
      solidL.push(s.position.clone().addScaledVector(s.normal, hw - 0.32).setY(y))
      solidR.push(s.position.clone().addScaledVector(s.normal, -(hw - 0.32)).setY(y))
    }
    addRibbon(solidL, edgeW, 0xeef0f4)
    addRibbon(solidR, edgeW, 0xeef0f4)

    const dashCol = world === 'rally' ? 0xe8d090 : 0xf2f2f6
    for (let i = 0; i < samples; i += 2) {
      const a = this.sample(i / samples)
      const b = this.sample(Math.min(1, (i + 0.55) / samples))
      const y = a.position.y + markY
      addRibbon(
        [a.position.clone().setY(y), b.position.clone().setY(b.position.y + markY)],
        dashW,
        dashCol,
        3,
      )
    }
  }

  private addSkyBody(): void {
    if (this.def.world === 'town') {
      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(24, 12, 12),
        matLambert(0xff6a28, { emissive: 0xff4a10, emissiveIntensity: 1.15 }),
      )
      sun.position.set(-90, 22, 140)
      this.group.add(sun)
      return
    }
    if (this.def.world === 'rally') {
      // Zapadající slunce daleko za obzorem (ne „míč“ u tratě)
      const blaze = new THREE.Mesh(
        new THREE.SphereGeometry(36, 16, 16),
        matLambert(0xffa060, { emissive: 0xff7030, emissiveIntensity: 0.85 }),
      )
      blaze.position.set(420, 55, -380)
      this.group.add(blaze)
      return
    }
    const moon = this.def.skyBody === 'moon'
    const col = moon ? 0xe8e8f0 : 0xffe08a
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(moon ? 14 : 18, 12, 12),
      matLambert(col, { emissive: col, emissiveIntensity: moon ? 0.55 : 0.85 }),
    )
    body.position.set(moon ? -120 : 160, moon ? 90 : 110, moon ? -80 : -40)
    this.group.add(body)
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
      else if (this.def.world === 'town') this.buildTown()
      else if (this.def.world === 'climb') {
        if (this.def.id === 'mexiku') this.buildMexiku()
        else this.buildClimb()
      } else if (this.def.world === 'plaza') this.buildPlaza()
      else this.buildRally()
    } finally {
      this.group.add = savedAdd
    }
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
    const graffiti = [theme.accent, theme.barrierL, theme.barrierR, theme.detail].map((c) =>
      matLambert(c, { emissive: c, emissiveIntensity: 0.35 }),
    )

    // Dlouhé kasárenské bloky podél tratě (jako řadové budovy areálu)
    for (let i = 0; i < 12; i++) {
      const t = (i + 0.35) / 12
      const s = this.sample(t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 16 + (i % 3) * 3)
      const g = new THREE.Group()
      const len = 22 + (i % 3) * 6
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 5.2, 9), concrete)
      body.position.y = 2.6
      g.add(body)
      const top = new THREE.Mesh(new THREE.BoxGeometry(len + 0.6, 0.35, 9.6), roof)
      top.position.y = 5.35
      g.add(top)
      // Graffiti panel
      const tag = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 0.12), graffiti[i % graffiti.length]!)
      tag.position.set(0, 2.2, 4.6)
      g.add(tag)
      const gx = s.position.x + s.normal.x * lat * side
      const gz = s.position.z + s.normal.z * lat * side
      g.position.set(gx, this.settleY(gx, gz), gz)
      g.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(g)
    }

    // Parade / skate plaza — Dolní (začátek okruhu)
    const dolni = this.sample(0.12)
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(55, 38), concreteDark)
    plaza.rotation.x = -Math.PI / 2
    const px = dolni.position.x + dolni.normal.x * this.safeLateral(dolni, 1, 28)
    const pz = dolni.position.z + dolni.normal.z * this.safeLateral(dolni, 1, 28)
    plaza.position.set(px, this.terrainYAt(px, pz) + 0.04, pz)
    this.group.add(plaza)

    // Quarter-pipe + funbox + rail na plaza
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 12, 10, 1, false, 0, Math.PI * 0.55), rampMat)
    pipe.rotation.z = Math.PI / 2
    pipe.position.set(px - 8, this.terrainYAt(px, pz) + 2.2, pz + 4)
    this.group.add(pipe)
    const box = new THREE.Mesh(new THREE.BoxGeometry(8, 1.1, 3.2), concrete)
    box.position.set(px + 6, this.terrainYAt(px, pz) + 0.55, pz - 2)
    this.group.add(box)
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 10, 6), railMat)
    rail.rotation.z = Math.PI / 2
    rail.position.set(px + 2, this.terrainYAt(px, pz) + 0.85, pz + 8)
    this.group.add(rail)

    // Menší plaza Horní
    const horni = this.sample(0.55)
    const plaza2 = new THREE.Mesh(new THREE.PlaneGeometry(36, 28), concreteDark)
    plaza2.rotation.x = -Math.PI / 2
    const hx = horni.position.x + horni.normal.x * this.safeLateral(horni, -1, 22)
    const hz = horni.position.z + horni.normal.z * this.safeLateral(horni, -1, 22)
    plaza2.position.set(hx, this.terrainYAt(hx, hz) + 0.04, hz)
    this.group.add(plaza2)
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, 1.2), concrete)
    ledge.position.set(hx, this.terrainYAt(hx, hz) + 0.28, hz)
    this.group.add(ledge)

    // Rampy u krajnice (skate feeling při jízdě)
    for (let i = 0; i < 8; i++) {
      const s = this.sample(0.08 + i * 0.11)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 4.5)
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 5.5), rampMat)
      ramp.rotation.x = -0.28
      const rx = s.position.x + s.normal.x * lat * side
      const rz = s.position.z + s.normal.z * lat * side
      ramp.position.set(rx, this.terrainYAt(rx, rz) + 0.55, rz)
      ramp.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(ramp)
    }

    // Stromořadí / zeleň mezi Dolní a Horní (liniový park z ÚP)
    const leaf = matLambert(theme.detail)
    const trunk = matLambert(0x5a3a22)
    for (let i = 0; i < 16; i++) {
      const s = this.sample(0.28 + i * 0.012)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 11)
      const tree = new THREE.Group()
      const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 2.6, 5), trunk)
      bole.position.y = 1.3
      tree.add(bole)
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 6), leaf)
      canopy.position.y = 3.2
      tree.add(canopy)
      const tx = s.position.x + s.normal.x * lat * side
      const tz = s.position.z + s.normal.z * lat * side
      tree.position.set(tx, this.settleY(tx, tz), tz)
      this.group.add(tree)
    }
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

    // Trávník kolem plochy
    const lawnMat = matLambert(theme.detail)
    for (const [lx, lz, lw, ld] of [
      [0, -b.halfZ - 28, b.halfX * 2.2, 40],
      [-b.halfX - 32, 0, 48, b.halfZ * 2.1],
      [b.halfX + 32, 0, 48, b.halfZ * 2.1],
      [0, b.halfZ + 6, b.halfX * 2.05, 10],
    ] as const) {
      const lawn = new THREE.Mesh(new THREE.PlaneGeometry(lw, ld), lawnMat)
      lawn.rotation.x = -Math.PI / 2
      lawn.position.set(lx, -0.15, lz)
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

    // Lampy
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
    }
  }

  private buildCity(): void {
    const theme = this.def.theme
    const facades = [0x2a2838, 0x242230, 0x323040, 0x1e1c28]
    const neons = [0xff2bd6, 0x2de2e6, 0xff6a3d, 0x7b61ff]
    const wallMats = facades.map((c) => matLambert(c))
    const neonMats = neons.map((c) => matLambert(c, { emissive: c, emissiveIntensity: 0.28 }))

    this.addCitySideStreets()

    // Moře z jedné strany
    const sea = new THREE.Mesh(
      new THREE.CircleGeometry(220, 28),
      matLambert(0x1a3a5a, { emissive: 0x0a2040, emissiveIntensity: 0.2 }),
    )
    sea.rotation.x = -Math.PI / 2
    sea.position.set(180, -0.3, 20)
    this.group.add(sea)
    const shore = new THREE.Mesh(new THREE.RingGeometry(200, 220, 28), matLambert(0x3a3a42))
    shore.rotation.x = -Math.PI / 2
    shore.position.set(180, -0.25, 20)
    this.group.add(shore)

    for (let i = 0; i < 16; i++) {
      const s = this.sample(i / 16)
      // Budovy hlavně od moře pryč (záporný normal / inland) — mimo vozovku
      const side: 1 | -1 = -1
      const footprint = 4 + (i % 3) * 0.5
      const dist = this.safeLateral(s, side, footprint + 8)
      const floors = 3 + (i % 5)
      const h = floors * 3.2
      const w = 6 + (i % 3)
      const d = 5.5
      const block = new THREE.Group()
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMats[i % wallMats.length])
      wall.position.y = h / 2
      block.add(wall)
      // Mřížka oken = víc quads (čitelnější fasáda než jedna deska)
      const neon = neonMats[i % neonMats.length]!
      for (let fy = 0; fy < floors; fy++) {
        for (let fx = 0; fx < 3; fx++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(w * 0.18, 0.55, 0.08), neon)
          win.position.set(-w * 0.28 + fx * w * 0.28, 1.1 + fy * 3.0, d / 2 + 0.06)
          block.add(win)
        }
      }
      const bx = s.position.x + s.normal.x * dist * side
      const bz = s.position.z + s.normal.z * dist * side
      block.position.set(bx, this.settleY(bx, bz), bz)
      block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI
      this.group.add(block)
    }

    // Tribuny — podélné i příčné, více typů
    this.addGrandstand(0.08, 1, 'long')
    this.addGrandstand(0.22, 1, 'tier')
    this.addGrandstand(0.38, -1, 'long')
    this.addGrandstand(0.55, 1, 'cross')
    this.addGrandstand(0.72, -1, 'tier')
    this.addGrandstand(0.88, 1, 'cross')

    const poleM = matLambert(0x2a2a30)
    for (let i = 0; i < 12; i++) {
      const s = this.sample(i / 12)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const neon = i % 2 === 0 ? theme.accent : theme.detail
      const lat = this.safeLateral(s, side, 1.2)
      const px = s.position.x + s.normal.x * lat * side
      const pz = s.position.z + s.normal.z * lat * side
      const py = this.terrainYAt(px, pz)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.5, 5), poleM)
      pole.position.set(px, py + 2.75, pz)
      this.group.add(pole)
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 6, 6),
        matLambert(neon, { emissive: neon, emissiveIntensity: 1 }),
      )
      lamp.position.set(px, py + 5.4, pz)
      this.group.add(lamp)
    }
  }

  /** Dekorativní odbočky a postranní ulice (nejsou sjízdné) — odsazené od vozovky. */
  private addCitySideStreets(): void {
    const asphalt = matLambert(0x5a5a62)
    const curbMat = matLambert(0x8a8a92)
    const clearance = 5.5

    for (let i = 0; i < 14; i++) {
      const t = (i + 0.4) / 14
      const s = this.sample(t)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const branchLen = 22 + (i % 4) * 9
      const branchW = this.halfWidth * 0.72
      const start = this.safeLateral(s, side, branchW * 0.5)

      // Odbočka kolmo z hlavní tratě
      const branch = new THREE.Mesh(new THREE.BoxGeometry(branchW, 0.07, branchLen), asphalt)
      const bx = s.position.x + s.normal.x * (start + branchLen / 2) * side
      const bz = s.position.z + s.normal.z * (start + branchLen / 2) * side
      const by = this.terrainYAt(bx, bz) + 0.035
      branch.position.set(bx, by, bz)
      branch.rotation.y = Math.atan2(s.normal.x, s.normal.z)
      this.group.add(branch)

      // Obrubník na konci odbočky
      const curb = new THREE.Mesh(new THREE.BoxGeometry(branchW + 0.4, 0.12, 0.35), curbMat)
      const cx = s.position.x + s.normal.x * (start + branchLen + 0.4) * side
      const cz = s.position.z + s.normal.z * (start + branchLen + 0.4) * side
      curb.position.set(cx, this.terrainYAt(cx, cz) + 0.08, cz)
      curb.rotation.y = branch.rotation.y
      this.group.add(curb)

      // Postranní ulice rovnoběžná s tratí
      if (i % 2 === 0) {
        const sideLen = 36 + (i % 3) * 8
        const parallel = new THREE.Mesh(
          new THREE.BoxGeometry(branchW * 0.9, 0.07, sideLen),
          asphalt.clone(),
        )
        const dist = Math.max(start, this.halfWidth + clearance) + branchLen + 6
        const px = s.position.x + s.normal.x * dist * side + s.tangent.x * 4
        const pz = s.position.z + s.normal.z * dist * side + s.tangent.z * 4
        parallel.position.set(px, this.terrainYAt(px, pz) + 0.035, pz)
        parallel.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
        this.group.add(parallel)

        // Krátká spojka k další „křižovatce“
        const stub = new THREE.Mesh(
          new THREE.BoxGeometry(branchW * 0.65, 0.07, 14),
          asphalt.clone(),
        )
        const sx = parallel.position.x + s.normal.x * 10 * side
        const sz = parallel.position.z + s.normal.z * 10 * side
        stub.position.set(sx, this.terrainYAt(sx, sz) + 0.035, sz)
        stub.rotation.y = Math.atan2(s.normal.x, s.normal.z)
        this.group.add(stub)
      }
    }
  }

  private addGrandstand(t: number, side: 1 | -1, kind: 'long' | 'tier' | 'cross'): void {
    const s = this.sample(t)
    const stand = new THREE.Group()
    const baseM = matLambert(0x3a3a44)
    const seatM = matLambert(kind === 'tier' ? 0xc62828 : kind === 'cross' ? 0x1565c0 : 0x555560)
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
   * Laterál od středu tratě tak, aby střed objektu (+ footprint) nezasahoval do asfaltu
   * ani do jiné části okruhu (mosty = jiná výška OK).
   */
  private safeLateral(s: TrackSample, side: 1 | -1, footprint: number): number {
    const need = this.halfWidth + footprint + 4
    const refY = s.position.y
    let lat = need
    for (let i = 0; i < 16; i++) {
      const x = s.position.x + s.normal.x * lat * side
      const z = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(x, z, refY) >= need) return lat
      lat += 5
    }
    return lat
  }

  private buildTown(): void {
    const theme = this.def.theme
    const plasterColors = [0xc8b8a4, 0xd4c4b0, 0xb8a890, 0xccc0b0] as const
    const plasterHex = ['#c8b8a4', '#d4c4b0', '#b8a890', '#ccc0b0'] as const
    const plaster = plasterColors.map((c, i) =>
      matLambert(c, { map: plasterMap(`town-s-${i}`, plasterHex[i]!) }),
    )
    const roof = matLambert(0xa04532)
    const roofDark = matLambert(0x6a2a22)
    const stone = matLambert(0x8a8074)
    const panel = [0xb8b0a4, 0xa8a094, 0xc0b8ac].map((c) => matLambert(c))
    const field = matLambert(0x3a4a28)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)

    {
      const river = new THREE.Mesh(
        new THREE.PlaneGeometry(90, 420),
        matLambert(0x3a5a72, { emissive: 0x1a3048, emissiveIntensity: 0.15 }),
      )
      river.rotation.x = -Math.PI / 2
      river.position.set(-220, -0.35, 20)
      this.group.add(river)
    }

    const square = this.sample(0.12)
    const plazaLat = this.safeLateral(square, 1, 12)
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.12, 12), matLambert(0x9a8a78))
    const plazaX = square.position.x + square.normal.x * plazaLat
    const plazaZ = square.position.z + square.normal.z * plazaLat
    const plazaY = this.terrainYAt(plazaX, plazaZ)
    plaza.position.set(plazaX, plazaY + 0.02, plazaZ)
    this.group.add(plaza)
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 1.2, 8), stone)
    fountain.position.set(plaza.position.x, plazaY + 0.7, plaza.position.z)
    this.group.add(fountain)

    const churchS = this.sample(0.88)
    const churchLat = this.safeLateral(churchS, 1, 10)
    const church = new THREE.Group()
    const nave = new THREE.Mesh(new THREE.BoxGeometry(8, 7, 14), plaster[0])
    nave.position.y = 3.5
    church.add(nave)
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 14, 4), plaster[1])
    tower.position.set(0, 7, 6)
    church.add(tower)
    const spire = new THREE.Mesh(new THREE.ConeGeometry(2.4, 5, 4), roofDark)
    spire.position.set(0, 16.5, 6)
    church.add(spire)
    const naveRoof = new THREE.Mesh(new THREE.ConeGeometry(6, 3.5, 4), roof)
    naveRoof.rotation.y = Math.PI / 4
    naveRoof.position.set(0, 8.5, -1)
    church.add(naveRoof)
    {
      const cx = churchS.position.x + churchS.normal.x * churchLat
      const cz = churchS.position.z + churchS.normal.z * churchLat
      church.position.set(cx, this.settleY(cx, cz), cz)
    }
    church.rotation.y = Math.atan2(churchS.tangent.x, churchS.tangent.z)
    this.group.add(church)

    const castleS = this.sample(0.92)
    const castleLat = this.safeLateral(castleS, -1, 14)
    const castle = new THREE.Group()
    const keep = new THREE.Mesh(new THREE.BoxGeometry(16, 8, 10), plaster[2])
    keep.position.y = 4
    castle.add(keep)
    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 12), plaster[3])
    wing.position.set(10, 3, 2)
    castle.add(wing)
    const cRoof = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 11), roof)
    cRoof.position.y = 8.2
    castle.add(cRoof)
    {
      const cx = castleS.position.x + castleS.normal.x * castleLat * -1
      const cz = castleS.position.z + castleS.normal.z * castleLat * -1
      castle.position.set(cx, this.settleY(cx, cz), cz)
    }
    castle.rotation.y = Math.atan2(castleS.tangent.x, castleS.tangent.z)
    this.group.add(castle)

    const nudzS = this.sample(0.42)
    const nudzLat = this.safeLateral(nudzS, 1, 8)
    // Úzká hloubka kolmo k trati, délka podél — neprotíná asfalt
    const nudz = new THREE.Mesh(new THREE.BoxGeometry(12, 9, 28), plaster[0])
    const nudzX = nudzS.position.x + nudzS.normal.x * nudzLat
    const nudzZ = nudzS.position.z + nudzS.normal.z * nudzLat
    const nudzBase = this.terrainYAt(nudzX, nudzZ)
    nudz.position.set(nudzX, nudzBase + 4.5, nudzZ)
    nudz.rotation.y = Math.atan2(nudzS.tangent.x, nudzS.tangent.z)
    this.group.add(nudz)
    const nudzRoof = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 29), matLambert(0x6a6a62))
    nudzRoof.position.copy(nudz.position)
    nudzRoof.position.y = nudzBase + 9.2
    nudzRoof.rotation.y = nudz.rotation.y
    this.group.add(nudzRoof)

    for (let i = 0; i < 5; i++) {
      const s = this.sample(0.52 + i * 0.025)
      const h = 12 + (i % 3) * 3
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 7)
      const block = new THREE.Mesh(new THREE.BoxGeometry(10, h, 14), panel[i % panel.length])
      const bx = s.position.x + s.normal.x * lat * side
      const bz = s.position.z + s.normal.z * lat * side
      block.position.set(bx, this.terrainYAt(bx, bz) + h / 2, bz)
      block.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(block)
    }

    for (let i = 0; i < 18; i++) {
      const s = this.sample(i / 18)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const w = 6 + (i % 3)
      const d = 8 + (i % 2) * 2
      const lat = this.safeLateral(s, side, Math.max(w, d) * 0.55)
      const house = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), plaster[i % plaster.length])
      body.position.y = 2.1
      house.add(body)
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.72, 2.6, 4), i % 3 === 0 ? roofDark : roof)
      r.rotation.y = Math.PI / 4
      r.position.y = 5.4
      house.add(r)
      const hx = s.position.x + s.normal.x * lat * side
      const hz = s.position.z + s.normal.z * lat * side
      house.position.set(hx, this.settleY(hx, hz), hz)
      house.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      if (this.minRoadDist(house.position.x, house.position.z) < this.halfWidth + 5) continue
      this.group.add(house)
    }

    for (let i = 0; i < 10; i++) {
      const s = this.sample((i + 0.3) / 10)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const radius = 10 + (i % 3) * 3
      const lat = this.safeLateral(s, side, radius + 4)
      if (lat < this.halfWidth + radius + 3) continue
      const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 8), field)
      patch.rotation.x = -Math.PI / 2
      const px = s.position.x + s.normal.x * lat * side
      const pz = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(px, pz, s.position.y) < this.halfWidth + radius * 0.65) continue
      patch.position.set(px, this.terrainYAt(px, pz) - 0.02, pz)
      this.group.add(patch)
    }

    for (let i = 0; i < 14; i++) {
      const s = this.sample(0.05 + i / 16)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 3.5)
      const tree = new THREE.Group()
      const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.35, 3.2, 8), trunk)
      bole.position.y = 1.6
      tree.add(bole)
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.0, 10, 8), leaf)
      canopy.position.y = 4.2
      tree.add(canopy)
      const canopy2 = new THREE.Mesh(new THREE.SphereGeometry(1.35, 8, 6), leaf)
      canopy2.position.set(0.6, 3.6, 0.2)
      tree.add(canopy2)
      const tx = s.position.x + s.normal.x * lat * side
      const tz = s.position.z + s.normal.z * lat * side
      tree.position.set(tx, this.settleY(tx, tz), tz)
      if (this.minRoadDist(tree.position.x, tree.position.z) < this.halfWidth + 4) continue
      this.group.add(tree)
    }

    // Lampy až za bermou, s kontrolou proti jiné části okruhu
    for (let i = 0; i < 14; i++) {
      const s = this.sample(i / 14)
      const side: 1 | -1 = i % 2 === 0 ? 1 : -1
      const lat = this.safeLateral(s, side, 1.2)
      const x = s.position.x + s.normal.x * lat * side
      const z = s.position.z + s.normal.z * lat * side
      if (this.minRoadDist(x, z) < this.halfWidth + 3.5) continue
      const py = this.terrainYAt(x, z)
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.2, 5), stone)
      pole.position.set(x, py + 2.1, z)
      this.group.add(pole)
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 6, 6),
        matLambert(0xffc070, { emissive: 0xff8a40, emissiveIntensity: 0.9 }),
      )
      lamp.position.set(x, py + 4.3, z)
      this.group.add(lamp)
    }
  }

  /** Do Klecánek — etapa Klecánky → U Hřbitova, BMW v první čtvrtině vpravo. */
  private buildClimb(): void {
    const theme = this.def.theme
    const plaster = [0xc8b8a4, 0xd4c4b0, 0xb8a890, 0xccc0b0].map((c) => matLambert(c))
    const roof = matLambert(0xa04532)
    const hedge = matLambert(0x24301c)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const rock = matLambert(0x6a6a62)

    const start = this.sample(0)
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 280),
      matLambert(0x3a5a72, { emissive: 0x1a3048, emissiveIntensity: 0.12 }),
    )
    river.rotation.x = -Math.PI / 2
    river.position.set(start.position.x - 90, start.position.y - 0.4, start.position.z - 20)
    this.group.add(river)

    this.addBusShelter(0, 1)
    this.addBusShelter(1, -1)

    for (let i = 0; i < 10; i++) {
      const s = this.sample(0.02 + i * 0.012)
      const side = i % 2 === 0 ? 1 : -1
      const house = new THREE.Group()
      const w = 6 + (i % 3)
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 8), plaster[i % plaster.length])
      body.position.y = 2
      house.add(body)
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.7, 2.4, 4), roof)
      r.rotation.y = Math.PI / 4
      r.position.y = 5.1
      house.add(r)
      const lat = this.safeLateral(s, side, Math.max(w, 8) * 0.55)
      const hx = s.position.x + s.normal.x * lat * side
      const hz = s.position.z + s.normal.z * lat * side
      house.position.set(hx, this.settleY(hx, hz), hz)
      house.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(house)
    }

    const bmwColors = [0x1a1a1a, 0xc8c8c8, 0x1565c0, 0xf2f2f0, 0x2a2a32, 0xb0b8c0, 0x0d47a1, 0x424242, 0xd8d8d8]
    for (let i = 0; i < bmwColors.length; i++) {
      const t = 0.16 + i * 0.014
      const s = this.sample(t)
      const car = this.parkedSedan(bmwColors[i]!)
      // Pravá strana ve směru jízdy (+normal) — mimo asfalt
      const dist = this.safeLateral(s, 1, 2.4)
      const cx = s.position.x + s.normal.x * dist
      const cz = s.position.z + s.normal.z * dist
      car.position.set(cx, this.settleY(cx, cz), cz)
      car.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(car)
    }

    for (let i = 0; i < 16; i++) {
      const s = this.sample(0.28 + i * 0.028)
      const bank = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2 + (i % 4) * 0.4, 6), rock)
      const lat = this.safeLateral(s, 1, 3.5)
      const bx = s.position.x + s.normal.x * lat
      const bz = s.position.z + s.normal.z * lat
      bank.position.set(bx, this.terrainYAt(bx, bz) + 0.4, bz)
      bank.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(bank)
    }

    for (let i = 0; i < 12; i++) {
      const s = this.sample(0.55 + i * 0.018)
      const side = i % 2 === 0 ? 1 : -1
      const house = new THREE.Group()
      const w = 7 + (i % 2)
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.4, 9), plaster[(i + 2) % plaster.length])
      body.position.y = 2.2
      house.add(body)
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.68, 2.5, 4), roof)
      r.rotation.y = Math.PI / 4
      r.position.y = 5.4
      house.add(r)
      const lat = this.safeLateral(s, side, Math.max(w, 9) * 0.55)
      const hx = s.position.x + s.normal.x * lat * side
      const hz = s.position.z + s.normal.z * lat * side
      house.position.set(hx, this.settleY(hx, hz), hz)
      house.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      this.group.add(house)
    }

    const square = this.sample(0.72)
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.12, 12), matLambert(0x9a8a78))
    const px = square.position.x + square.normal.x * 16
    const pz = square.position.z + square.normal.z * 16
    plaza.position.set(px, this.terrainYAt(px, pz) + 0.02, pz)
    this.group.add(plaza)

    const fin = this.sample(1)
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
    const chapel = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 8), plaster[1])
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

    for (let i = 0; i < 36; i++) {
      const s = this.sample(i / 36)
      const side = i % 2 === 0 ? 1 : -1
      const tree = new THREE.Group()
      const bole = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 2.8, 5), trunk)
      bole.position.y = 1.4
      tree.add(bole)
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.8, 6, 6), leaf)
      canopy.position.y = 3.6
      tree.add(canopy)
      const tx = s.position.x + s.normal.x * (this.halfWidth + 10 + (i % 3) * 4) * side
      const tz = s.position.z + s.normal.z * (this.halfWidth + 10 + (i % 3) * 4) * side
      tree.position.set(tx, this.settleY(tx, tz), tz)
      this.group.add(tree)
    }

    // Živé ploty — safeLateral + mosty (serpentiny se kříží ve výšce)
    const hedgeCount = this.def.id === 'serpentiny' ? 14 : 24
    for (let i = 0; i < hedgeCount; i++) {
      const s = this.sample(i / hedgeCount)
      for (const side of [-1, 1] as const) {
        const lat = this.safeLateral(s, side, 2.2)
        if (lat > this.halfWidth + 28) continue
        const hdg = new THREE.Mesh(new THREE.BoxGeometry(1, 0.65, 3.8), hedge)
        const hx = s.position.x + s.normal.x * lat * side
        const hz = s.position.z + s.normal.z * lat * side
        if (this.minRoadDist(hx, hz, s.position.y) < this.halfWidth + 2.8) continue
        hdg.position.set(hx, this.terrainYAt(hx, hz) + 0.3, hz)
        hdg.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
        this.group.add(hdg)
      }
    }
  }

  /**
   * Mexiko — stejná stavba jako climb: boxy / InstancedMesh.
   * +N = Brooklyn + vyšší paneláky · −N = vesnice, pláž, moře.
   */
  private buildMexiku(): void {
    const theme = this.def.theme
    const plaster = [0xc8b8a4, 0xd4c4b0, 0xb8a890, 0xccc0b0].map((c) => matLambert(c))
    const panel = [0x9aa0a8, 0xb0b4bc, 0x8a9098].map((c) => matLambert(c))
    const roof = matLambert(0xa04532)
    const hedge = matLambert(0x24301c)
    const trunk = matLambert(0x5a3a22)
    const leaf = matLambert(theme.detail)
    const sand = matLambert(0xc2b090)
    const water = matLambert(0x3a6a82, { emissive: 0x1a3048, emissiveIntensity: 0.12 })
    const accent = matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.35 })
    const dummy = new THREE.Object3D()

    // Brooklyn cedule (start, city strana)
    const start = this.sample(0)
    const sign = new THREE.Group()
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 5), matLambert(0x5a5858))
    pole.position.y = 1.7
    sign.add(pole)
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 64
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#1a1018'
      ctx.fillRect(0, 0, 256, 64)
      ctx.strokeStyle = '#ff6a9a'
      ctx.lineWidth = 4
      ctx.strokeRect(4, 4, 248, 56)
      ctx.fillStyle = '#f7f1ea'
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
    sign.position.set(
      start.position.x + start.normal.x * (this.halfWidth + 6),
      start.position.y,
      start.position.z + start.normal.z * (this.halfWidth + 6),
    )
    this.group.add(sign)

    this.addBusShelter(0.05, 1)
    this.addBusShelter(0.95, -1)

    // City strana (+normal): vyšší bloky
    for (let i = 0; i < 10; i++) {
      const s = this.sample(0.05 + i * 0.085)
      const w = 7 + (i % 3)
      const h = 7 + (i % 4) * 1.6
      const house = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, 9), panel[i % panel.length])
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
      this.group.add(house)
    }

    // Vesnice (−normal): nižší domky
    for (let i = 0; i < 9; i++) {
      const s = this.sample(0.08 + i * 0.09)
      const w = 5.5 + (i % 2)
      const house = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.6, 7), plaster[i % plaster.length])
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
      this.group.add(house)
    }

    // Moře + pláž (−normal)
    const mid = this.sample(0.55)
    const seaX = mid.position.x - mid.normal.x * 95
    const seaZ = mid.position.z - mid.normal.z * 95
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), water)
    sea.rotation.x = -Math.PI / 2
    sea.position.set(seaX, this.terrainYAt(seaX, seaZ) - 0.35, seaZ)
    this.group.add(sea)
    const beachX = mid.position.x - mid.normal.x * 42
    const beachZ = mid.position.z - mid.normal.z * 42
    const beach = new THREE.Mesh(new THREE.PlaneGeometry(90, 28), sand)
    beach.rotation.x = -Math.PI / 2
    beach.position.set(beachX, this.terrainYAt(beachX, beachZ) - 0.12, beachZ)
    this.group.add(beach)

    // Stromy — InstancedMesh (1 draw call)
    const boleGeo = new THREE.CylinderGeometry(0.22, 0.28, 2.6, 5)
    const canopyGeo = new THREE.SphereGeometry(1.6, 6, 6)
    const nTrees = 18
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
    this.group.add(boles, canopies)

    // Živé ploty — InstancedMesh
    const hdgGeo = new THREE.BoxGeometry(1, 0.6, 3.4)
    const nHedge = 12
    const hedges = new THREE.InstancedMesh(hdgGeo, hedge, nHedge * 2)
    let hi = 0
    for (let i = 0; i < nHedge; i++) {
      const s = this.sample(i / nHedge)
      const yaw = Math.atan2(s.tangent.x, s.tangent.z)
      for (const side of [-1, 1] as const) {
        const hx = s.position.x + s.normal.x * (this.halfWidth + 3.3) * side
        const hz = s.position.z + s.normal.z * (this.halfWidth + 3.3) * side
        dummy.position.set(hx, this.settleY(hx, hz) + 0.28, hz)
        dummy.rotation.set(0, yaw, 0)
        dummy.updateMatrix()
        hedges.setMatrixAt(hi++, dummy.matrix)
      }
    }
    hedges.instanceMatrix.needsUpdate = true
    this.group.add(hedges)
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
    const mud = matLambert(0x2a1a0c)
    const hillA = matLambert(0x4a3220)
    const hillB = matLambert(0x3a2818)
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
      this.group.add(hill)
    }

    // Staveniště / novostavby — nízké bloky mimo trať
    for (let i = 0; i < 10; i++) {
      const s = this.sample(0.06 + i * 0.09)
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
      const a = i * 2
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    geo.setIndex(indices)
    geo.computeVertexNormals()
    this.group.add(new THREE.Mesh(geo, matLambert(color)))
  }

  private buildCheckpoints(): void {
    // ~⅓ dřívější hustoty (okruh 20→7, etapa 40→13)
    const n = this.def.loop ? 7 : 13
    for (let i = 0; i < n; i++) {
      const t = this.def.loop ? i / n : i / (n - 1)
      this.checkpoints.push(this.curve.getPointAt(Math.min(1, t)))
    }
    this.addCheckpointVisuals()
  }

  /** Viditelné brány na tratích (mimo start/cíl). */
  private addCheckpointVisuals(): void {
    const theme = this.def.theme
    const n = this.checkpoints.length
    for (let i = 1; i < n; i++) {
      if (!this.def.loop && i === n - 1) continue
      const t = this.def.loop ? i / n : i / (n - 1)
      const s = this.sample(t)
      const gate = new THREE.Group()
      gate.userData.decorTier = 'standard'
      const postMat = matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.25 })
      const beamMat = matLambert(theme.detail, { emissive: theme.detail, emissiveIntensity: 0.15 })
      for (const side of [-1, 1] as const) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.4, 6), postMat)
        post.position.set(
          s.position.x + s.normal.x * (this.halfWidth + 0.35) * side,
          s.position.y + 1.2,
          s.position.z + s.normal.z * (this.halfWidth + 0.35) * side,
        )
        gate.add(post)
      }
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth * 2 + 1.2, 0.12, 0.12),
        beamMat,
      )
      beam.position.set(s.position.x, s.position.y + 2.35, s.position.z)
      beam.rotation.y = Math.atan2(s.tangent.x, s.tangent.z)
      gate.add(beam)
      // Číslo checkpointu — tenký „vlajkový“ bloček
      const flag = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.35, 0.06),
        matLambert(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.2 }),
      )
      flag.position.set(
        s.position.x + s.normal.x * (this.halfWidth + 0.55),
        s.position.y + 2.0,
        s.position.z + s.normal.z * (this.halfWidth + 0.55),
      )
      gate.add(flag)
      this.group.add(gate)
    }

    // Cíl i na okruhu (u startu)
    if (this.def.loop) {
      const fin = this.sample(0)
      const arch = new THREE.Mesh(
        new THREE.BoxGeometry(this.halfWidth * 2.2, 0.35, 0.35),
        matLambert(theme.accent, { emissive: theme.accent, emissiveIntensity: 0.35 }),
      )
      arch.position.set(fin.position.x, fin.position.y + 3.6, fin.position.z)
      arch.rotation.y = Math.atan2(fin.tangent.x, fin.tangent.z)
      this.group.add(arch)
    }
  }

  sample(t: number): TrackSample {
    let tt = t
    if (this.def.loop) tt = ((t % 1) + 1) % 1
    else tt = Math.max(0, Math.min(1, t))
    const position = this.curve.getPointAt(tt, this.tmpPos).clone()
    const tangent = this.curve.getTangentAt(tt, this.tmpTan).clone().normalize()
    return { position, tangent, normal: this.sideNormal(tangent), t: tt }
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
    return {
      x: s.position.x + s.normal.x * lateral + s.tangent.x * along,
      z: s.position.z + s.normal.z * lateral + s.tangent.z * along,
      y: s.position.y,
      heading: Math.atan2(s.tangent.x, s.tangent.z),
    }
  }
}
