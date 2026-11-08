import * as THREE from 'three'
import { matAccent, matLambert, matPaint } from '../render/Materials'
import type { VehicleKind } from '../track/TrackDefs'

/** Vytvoří mesh podle typu tratě. color/neon < 0 = bez barvy / bez neonu. */
export function createVehicleMesh(kind: VehicleKind, color: number, neon = 0xff2bd6): THREE.Group {
  const paint = color < 0 ? 0x888888 : color
  let g: THREE.Group
  switch (kind) {
    case 'moto':
      g = createMotorcycle(paint, neon)
      break
    case 'formula':
      g = createFormula(paint, neon)
      break
    case 'monster':
      g = createMonsterTruck(paint, neon)
      break
    case 'truck':
      g = createTruck(paint, neon)
      break
    case 'tank':
      g = createTank(paint, neon)
      break
    case 'limo':
      g = createLimo(paint, neon)
      break
    case 'skate':
      g = createSkateboard(paint, neon)
      break
    case 'bike':
      g = createBicycle(paint, neon)
      break
    case 'scooter':
      g = createScooter(paint, neon)
      break
    default:
      g = createStreetCar(paint, neon)
  }
  if (color < 0) {
    g.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.userData.bodyPaint) obj.visible = false
    })
  }
  return g
}

function paint(mesh: THREE.Mesh): void {
  mesh.userData.bodyPaint = true
}

/** Kšiltovka — brimForward = kšilt dopředu (+Z), jinak dozadu. */
function addCap(
  parent: THREE.Object3D,
  headY: number,
  headZ: number,
  brimForward: boolean,
  color = 0x1a1a1a,
): void {
  const fabric = matLambert(color)
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    fabric,
  )
  crown.position.set(0, headY + 0.05, headZ)
  parent.add(crown)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.022, 0.17), fabric.clone())
  brim.position.set(0, headY + 0.015, headZ + (brimForward ? 0.145 : -0.145))
  parent.add(brim)
}

/** Nápis na dresu (canvas textura). */
function addJerseyText(
  parent: THREE.Object3D,
  text: string,
  x: number,
  y: number,
  z: number,
  rotX = 0,
): void {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 48
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, 128, 48)
  ctx.fillStyle = '#f4f4f4'
  ctx.font = 'bold 26px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 24)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.11), mat)
  plate.position.set(x, y, z)
  plate.rotation.x = rotX
  parent.add(plate)
}

/** Lebka na zádech motorkáře. */
function addBackSkull(rider: THREE.Object3D): void {
  const bone = matLambert(0xe8e0d0)
  const dark = matLambert(0x1a1010)
  const skull = new THREE.Group()
  skull.position.set(0, 1.3, -0.28)
  skull.rotation.x = 0.15
  skull.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), bone))
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.045, 0.055), bone)
  jaw.position.set(0, -0.075, 0.01)
  skull.add(jaw)
  for (const sx of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), dark)
    eye.position.set(0.032 * sx, 0.012, 0.072)
    skull.add(eye)
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.02), dark)
  nose.position.set(0, -0.02, 0.08)
  skull.add(nose)
  rider.add(skull)
}

/** Neon jako deska pod peklostrojem. color < 0 = skrytý (bez neonu). */
function addNeon(g: THREE.Group, color: number, w: number, d: number, y = 0.12): void {
  const c = color < 0 ? 0xff2bd6 : color
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), matAccent(c, 0.75))
  glow.position.y = y
  glow.userData.neonGlow = true
  glow.visible = color >= 0
  g.add(glow)
}

/** Městská motorka — Downtown (+ jezdec) */
function createMotorcycle(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xc8c8c8)
  const seat = matLambert(0x222228)
  const suit = matLambert(0x1c2430)
  const leather = matLambert(0x2a1810)
  const skin = matLambert(0xc4a882)
  const visor = matLambert(0x223344, { emissive: 0x112233, emissiveIntensity: 0.35 })

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.85), body)
  tank.position.set(0, 0.72, 0.15)
  paint(tank)
  g.add(tank)

  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.55), body.clone())
  fairing.position.set(0, 0.78, 0.75)
  paint(fairing)
  g.add(fairing)

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.55), body.clone())
  tail.position.set(0, 0.68, -0.55)
  paint(tail)
  g.add(tail)

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.55), seat)
  saddle.position.set(0, 0.88, -0.15)
  g.add(saddle)

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 5), chrome)
  fork.rotation.z = 0.18
  fork.position.set(0, 0.55, 0.95)
  g.add(fork)

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), dark)
  bars.position.set(0, 0.95, 0.72)
  g.add(bars)

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.14, 10)
  wheelGeo.rotateZ(Math.PI / 2)
  const front = new THREE.Mesh(wheelGeo, dark)
  front.position.set(0, 0.38, 1.05)
  g.add(front)
  const rear = new THREE.Mesh(wheelGeo, dark)
  rear.position.set(0, 0.38, -0.85)
  g.add(rear)

  addNeon(g, neon, 0.2, 1.6, 0.18)

  const rider = new THREE.Group()
  rider.userData.motoRider = true
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.38), suit)
  torso.position.set(0, 1.28, -0.05)
  torso.rotation.x = 0.35
  rider.add(torso)
  addBackSkull(rider)
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), body.clone())
  paint(helm)
  helm.position.set(0, 1.68, 0.12)
  rider.add(helm)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.08), visor)
  glass.position.set(0, 1.66, 0.28)
  rider.add(glass)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.28), leather)
  hip.position.set(0, 1.02, -0.12)
  rider.add(hip)
  for (const sx of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.45), leather)
    thigh.position.set(0.22 * sx, 0.92, 0.15)
    thigh.rotation.x = -0.55
    rider.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), dark)
    shin.position.set(0.24 * sx, 0.62, 0.42)
    shin.rotation.x = 0.35
    rider.add(shin)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), suit)
    arm.position.set(0.28 * sx, 1.35, 0.32)
    arm.rotation.x = -0.85
    rider.add(arm)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.1), skin)
    hand.position.set(0.32 * sx, 1.18, 0.62)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/** Open-wheel formule — Klecany */
function createFormula(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x151515)
  const wing = matLambert(0xe8e8ec)
  const chrome = matLambert(0xb0b0b8)

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 1.6), body)
  nose.position.set(0, 0.32, 1.35)
  paint(nose)
  g.add(nose)

  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 1.7), body.clone())
  tub.position.set(0, 0.38, 0.05)
  paint(tub)
  g.add(tub)

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.7), dark)
  cockpit.position.set(0, 0.62, -0.05)
  g.add(cockpit)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.9), dark)
  engine.position.set(0, 0.45, -1.05)
  g.add(engine)

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.06, 0.35), wing)
  frontWing.position.set(0, 0.18, 2.05)
  g.add(frontWing)

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.4), wing)
  rearWing.position.set(0, 0.85, -1.55)
  g.add(rearWing)
  const endL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), wing)
  endL.position.set(-0.75, 0.7, -1.55)
  g.add(endL)
  const endR = endL.clone()
  endR.position.x = 0.75
  g.add(endR)

  const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 1.4), body.clone())
  sideL.position.set(-0.75, 0.28, 0.1)
  paint(sideL)
  g.add(sideL)
  const sideR = sideL.clone()
  sideR.position.x = 0.75
  g.add(sideR)

  addNeon(g, neon, 1.2, 2.8, 0.1)
  addWheels(g, dark, chrome, 0.95, 1.35, -1.25, 0.32, 0.28)
  return g
}

/** Monster truck — Monsterstruck */
function createMonsterTruck(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matLambert(0x6a7a88)
  const chrome = matLambert(0xc8c8c8)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 3.4), body)
  chassis.position.set(0, 1.55, 0.1)
  paint(chassis)
  g.add(chassis)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.95, 1.5), glass)
  cabin.position.set(0, 2.35, 0.35)
  g.add(cabin)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 1.2), body.clone())
  hood.position.set(0, 1.95, 1.55)
  paint(hood)
  g.add(hood)

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 0.4), chrome)
  bumper.position.set(0, 1.15, 2.15)
  g.add(bumper)

  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.55, 1.4), dark)
  bed.position.set(0, 1.7, -1.35)
  g.add(bed)

  const arch = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.05, 6, 10), chrome)
  arch.rotation.x = Math.PI / 2
  arch.position.set(0, 2.55, -0.9)
  g.add(arch)

  for (const sx of [-1, 1] as const) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.95 * sx, 1.4, -2.1)
    g.add(pipe)
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.1, 7),
      matLambert(0xff6a18, { emissive: 0xff3a00, emissiveIntensity: 0.25 }),
    )
    outer.rotation.x = Math.PI
    outer.position.set(0.95 * sx, 1.4, -2.75)
    outer.scale.setScalar(0.05)
    outer.userData.turboFlame = true
    g.add(outer)
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.75, 6),
      matLambert(0xffee88, { emissive: 0xffcc33, emissiveIntensity: 0.4 }),
    )
    core.rotation.x = Math.PI
    core.position.set(0.95 * sx, 1.4, -2.55)
    core.scale.setScalar(0.05)
    core.userData.turboFlame = true
    g.add(core)
  }

  addNeon(g, neon, 2.0, 3.0, 0.35)
  addWheels(g, dark, chrome, 1.25, 1.35, -1.45, 0.85, 0.55)
  return g
}

/** Kamion — delší bedna, stejné ovládání jako monster. */
function createTruck(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matLambert(0x6a7a88)
  const chrome = matLambert(0xc8c8c8)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.6), body)
  cabin.position.set(0, 1.6, 1.6)
  paint(cabin)
  g.add(cabin)
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 0.12), glass)
  wind.position.set(0, 2.05, 2.35)
  g.add(wind)
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.1, 3.4), dark)
  bed.position.set(0, 1.35, -1.1)
  g.add(bed)
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.35), chrome)
  bumper.position.set(0, 0.85, 2.45)
  g.add(bumper)

  for (const sx of [-1, 1] as const) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.55, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.9 * sx, 1.2, -2.7)
    g.add(pipe)
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.9, 7),
      matLambert(0xff6a18, { emissive: 0xff3a00, emissiveIntensity: 0.25 }),
    )
    flame.rotation.x = Math.PI
    flame.position.set(0.9 * sx, 1.2, -3.2)
    flame.scale.setScalar(0.05)
    flame.userData.turboFlame = true
    g.add(flame)
  }

  addNeon(g, neon, 1.8, 3.2, 0.28)
  addWheels(g, dark, chrome, 1.15, 1.55, -1.55, 0.7, 0.45)
  return g
}

/** Tank — pásy + věžička. */
function createTank(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xa8a8b0)

  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 3.6), body)
  hull.position.set(0, 0.95, 0)
  paint(hull)
  g.add(hull)
  const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.55, 10), body.clone())
  turret.position.set(0, 1.55, -0.15)
  paint(turret)
  g.add(turret)
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 2.2, 8), dark)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 1.6, 1.4)
  g.add(barrel)
  for (const sx of [-1, 1] as const) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.55, 3.5), dark)
    track.position.set(1.15 * sx, 0.45, 0)
    g.add(track)
  }
  addNeon(g, neon, 1.8, 2.8, 0.2)
  addWheels(g, dark, chrome, 1.15, 1.2, -1.3, 0.42, 0.35)
  return g
}

/** Limuzína — prodloužené auto. */
function createLimo(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matLambert(0x6a8aa8)
  const chrome = matLambert(0xc0c0c0)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.45, 6.2), body)
  chassis.position.y = 0.45
  paint(chassis)
  g.add(chassis)
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.55, 3.4), glass)
  cabin.position.set(0, 0.95, -0.2)
  g.add(cabin)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.1), body.clone())
  hood.position.set(0, 0.72, 2.35)
  paint(hood)
  g.add(hood)
  addNeon(g, neon, 1.4, 4.0, 0.12)
  addWheels(g, dark, chrome, 0.95, 2.15, -2.15, 0.38, 0.32)
  return g
}

/** Koloběžka — chyták, vizuálně nepoužitelná. */
function createScooter(color: number, _neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x222228)
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.06, 1.1), body)
  deck.position.set(0, 0.22, 0)
  paint(deck)
  g.add(deck)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.95, 6), dark)
  stem.position.set(0, 0.7, 0.45)
  stem.rotation.x = -0.15
  g.add(stem)
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.04), dark)
  bars.position.set(0, 1.15, 0.52)
  g.add(bars)
  const wr = 0.16
  const wGeo = new THREE.TorusGeometry(wr, 0.04, 6, 12)
  const front = new THREE.Mesh(wGeo, dark)
  front.rotation.y = Math.PI / 2
  front.position.set(0, wr, 0.48)
  g.add(front)
  const rear = front.clone()
  rear.position.z = -0.48
  g.add(rear)
  // Žádný neon — a žádný jezdec
  return g
}

/**
 * Skateboard — board v pivotu (kickflip / impossible),
 * jezdec −30 % (scale 2.1), nohy na decku.
 */
function createSkateboard(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const deckMat = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const suit = matLambert(0x1c2430)
  const skin = matLambert(0xc4a882)

  const boardPivot = new THREE.Group()
  boardPivot.userData.skateBoard = true

  const board = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 1.85), deckMat)
  board.position.y = 0.42
  paint(board)
  boardPivot.add(board)
  const truckF = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.12), dark)
  truckF.position.set(0, 0.32, 0.55)
  boardPivot.add(truckF)
  const truckR = truckF.clone()
  truckR.position.z = -0.55
  boardPivot.add(truckR)
  const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [-0.22, 0.55],
    [0.22, 0.55],
    [-0.22, -0.55],
    [0.22, -0.55],
  ]) {
    const w = new THREE.Mesh(wheelGeo, dark)
    w.position.set(wx, 0.26, wz)
    boardPivot.add(w)
  }
  g.add(boardPivot)
  addNeon(g, neon, 0.45, 1.6, 0.2)

  const rider = new THREE.Group()
  rider.userData.skateRider = true
  // −30 % oproti dřívějšímu 3× → 2.1; nohy na desce
  rider.scale.setScalar(2.1)
  rider.position.set(0, 0.4, 0)

  const backLeg = new THREE.Group()
  backLeg.userData.ollieBackLeg = true
  backLeg.position.set(-0.05, 0.55, -0.08)
  const backThigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), suit)
  backThigh.position.set(0, -0.1, 0)
  backLeg.add(backThigh)
  const backShin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), suit)
  backShin.position.set(0, -0.36, 0.02)
  backShin.userData.ollieBackShin = true
  backLeg.add(backShin)
  rider.add(backLeg)

  const pushLeg = new THREE.Group()
  pushLeg.userData.pushLeg = true
  pushLeg.userData.ollieFrontLeg = true
  pushLeg.position.set(0.06, 0.55, 0.08)
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.12), suit)
  thigh.position.set(0, -0.1, 0)
  pushLeg.add(thigh)
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), suit)
  shin.position.set(0, -0.36, 0.02)
  shin.userData.pushShin = true
  pushLeg.add(shin)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.22), dark)
  foot.position.set(0, -0.52, 0.08)
  foot.userData.pushFoot = true
  pushLeg.add(foot)
  rider.add(pushLeg)

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.24), suit)
  torso.position.set(0, 0.95, 0)
  torso.userData.ollieTorso = true
  rider.add(torso)
  addJerseyText(rider, 'KATE', 0, 0.98, 0.13)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), skin)
  head.position.set(0, 1.28, 0.02)
  rider.add(head)
  addCap(rider, 1.28, 0.02, true, 0x2a2a32)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.08), suit)
  armL.position.set(-0.26, 0.92, 0.04)
  armL.userData.ollieArm = true
  rider.add(armL)
  const armR = armL.clone()
  armR.position.x = 0.26
  rider.add(armR)
  g.add(rider)

  return g
}

/** Kolo v měřítku k jezdci (~28" kola, rozvor ~1,1 m). */
function createBicycle(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const frame = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const suit = matLambert(0x1c2430)
  const skin = matLambert(0xc4a882)
  const chrome = matLambert(0xb8b8c0)

  const boardPivot = new THREE.Group()
  boardPivot.userData.skateBoard = true

  const wr = 0.58
  const wheelGeo = new THREE.TorusGeometry(wr, 0.055, 8, 18)
  const wheelCol = neon < 0 ? 0x1a1a1a : neon
  const wheelMat = matLambert(wheelCol, {
    emissive: neon < 0 ? 0x000000 : neon,
    emissiveIntensity: neon < 0 ? 0 : 0.55,
  })
  const front = new THREE.Mesh(wheelGeo, wheelMat)
  front.rotation.y = Math.PI / 2
  front.position.set(0, wr, 0.72)
  front.userData.wheelPaint = true
  boardPivot.add(front)
  const rear = new THREE.Mesh(wheelGeo.clone(), wheelMat.clone())
  rear.rotation.y = Math.PI / 2
  rear.position.set(0, wr, -0.72)
  rear.userData.wheelPaint = true
  boardPivot.add(rear)

  const topTube = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 6), frame)
  topTube.rotation.z = Math.PI / 2
  topTube.rotation.y = 0.12
  topTube.position.set(0, 1.05, -0.05)
  paint(topTube)
  boardPivot.add(topTube)
  const downTube = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 1.0, 6), frame.clone())
  downTube.rotation.z = Math.PI / 2
  downTube.rotation.y = -0.35
  downTube.position.set(0, 0.72, 0.05)
  paint(downTube)
  boardPivot.add(downTube)
  const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.72, 6), frame.clone())
  seatTube.position.set(0, 0.95, -0.38)
  paint(seatTube)
  boardPivot.add(seatTube)
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 6), chrome)
  fork.position.set(0, 0.9, 0.62)
  boardPivot.add(fork)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 0.34), dark)
  seat.position.set(0, 1.35, -0.42)
  boardPivot.add(seat)
  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.05), dark)
  bars.position.set(0, 1.28, 0.58)
  boardPivot.add(bars)
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), chrome)
  stem.position.set(0, 1.18, 0.58)
  boardPivot.add(stem)
  g.add(boardPivot)
  // Kolo: žádný neon — barva kol = „neon“ volba

  // Jezdec v sedě — měřítko k rámu (ne 2.1 jako u skate)
  const rider = new THREE.Group()
  rider.userData.skateRider = true
  rider.scale.setScalar(1.15)
  rider.position.set(0, 0.72, -0.22)

  const backLeg = new THREE.Group()
  backLeg.userData.ollieBackLeg = true
  backLeg.position.set(-0.06, 0.35, -0.08)
  backLeg.rotation.x = 0.55
  backLeg.add(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.11), suit))
  rider.add(backLeg)
  const pushLeg = new THREE.Group()
  pushLeg.userData.pushLeg = true
  pushLeg.userData.ollieFrontLeg = true
  pushLeg.position.set(0.06, 0.35, 0.12)
  pushLeg.rotation.x = 0.35
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.32, 0.11), suit)
  pushLeg.add(thigh)
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), suit)
  shin.position.set(0, -0.32, 0.04)
  shin.rotation.x = 0.4
  shin.userData.pushShin = true
  pushLeg.add(shin)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.2), dark)
  foot.position.set(0, -0.48, 0.08)
  foot.userData.pushFoot = true
  pushLeg.add(foot)
  rider.add(pushLeg)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.24), suit)
  torso.position.set(0, 0.78, 0.08)
  torso.rotation.x = 0.35
  torso.userData.ollieTorso = true
  rider.add(torso)
  addJerseyText(rider, 'KOLO', 0, 0.82, 0.22, -0.35)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), skin)
  head.position.set(0, 1.12, 0.18)
  rider.add(head)
  addCap(rider, 1.12, 0.18, false, 0x1e3a28)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.34, 0.08), suit)
  armL.position.set(-0.24, 0.72, 0.28)
  armL.rotation.x = -1.0
  armL.userData.ollieArm = true
  rider.add(armL)
  const armR = armL.clone()
  armR.position.x = 0.24
  rider.add(armR)
  g.add(rider)

  return g
}

/** Vytuněné městské auto — Do Klecánek */
function createStreetCar(color: number, neon = 0xff2bd6): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matLambert(0x6a8aa8)
  const chrome = matLambert(0xc0c0c0)
  const lightMat = matLambert(0xffe8c0, { emissive: 0xffcc88, emissiveIntensity: 0.55 })
  const tailMat = matLambert(0xff3030, { emissive: 0xff1010, emissiveIntensity: 0.7 })

  // Víc panelů = víc trojúhelníků, čitelnější silueta (ne flat box)
  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.38, 4.25), body)
  lower.position.y = 0.42
  paint(lower)
  g.add(lower)

  const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.14, 3.6), dark)
  rocker.position.set(0, 0.2, 0.05)
  g.add(rocker)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.1, 1.15), body.clone())
  hood.position.set(0, 0.74, 1.38)
  paint(hood)
  g.add(hood)

  const fenderL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 1.0), body.clone())
  fenderL.position.set(-0.95, 0.52, 1.35)
  paint(fenderL)
  g.add(fenderL)
  const fenderR = fenderL.clone()
  fenderR.position.x = 0.95
  g.add(fenderR)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.52, 1.75), glass)
  cabin.position.set(0, 0.98, -0.12)
  g.add(cabin)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 1.55), body.clone())
  roof.position.set(0, 1.28, -0.15)
  paint(roof)
  g.add(roof)

  const aPillarL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.12), dark)
  aPillarL.position.set(-0.78, 1.05, 0.72)
  aPillarL.rotation.x = -0.35
  g.add(aPillarL)
  const aPillarR = aPillarL.clone()
  aPillarR.position.x = 0.78
  g.add(aPillarR)

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.16, 0.85), body.clone())
  trunk.position.set(0, 0.78, -1.55)
  paint(trunk)
  g.add(trunk)

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.06, 0.32), dark)
  spoiler.position.set(0, 1.02, -1.95)
  g.add(spoiler)
  const spoilerStemL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), dark)
  spoilerStemL.position.set(-0.55, 0.92, -1.85)
  g.add(spoilerStemL)
  const spoilerStemR = spoilerStemL.clone()
  spoilerStemR.position.x = 0.55
  g.add(spoilerStemR)

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.22, 0.28), dark)
  bumperF.position.set(0, 0.32, 2.2)
  g.add(bumperF)
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.2, 0.22), dark)
  bumperR.position.set(0, 0.32, -2.15)
  g.add(bumperR)

  for (const sx of [-1, 1] as const) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.08), lightMat)
    hl.position.set(0.55 * sx, 0.52, 2.12)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.06), tailMat)
    tl.position.set(0.58 * sx, 0.55, -2.18)
    g.add(tl)
  }

  const kidneyL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.08), dark)
  kidneyL.position.set(-0.2, 0.48, 2.14)
  g.add(kidneyL)
  const kidneyR = kidneyL.clone()
  kidneyR.position.x = 0.2
  g.add(kidneyR)

  const mirrorL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.1), dark)
  mirrorL.position.set(-0.95, 0.95, 0.55)
  g.add(mirrorL)
  const mirrorR = mirrorL.clone()
  mirrorR.position.x = 0.95
  g.add(mirrorR)

  addNeon(g, neon, 1.6, 3.6, 0.12)
  addWheels(g, dark, chrome, 0.95, 1.25, -1.35, 0.38, 0.32)
  return g
}

function addWheels(
  g: THREE.Group,
  tire: THREE.Material,
  hub: THREE.Material,
  x: number,
  zFront: number,
  zRear: number,
  radius: number,
  width: number,
): void {
  // 16 segmentů = hladší kola (víc tris, pořád levné)
  const geo = new THREE.CylinderGeometry(radius, radius, width, 16)
  geo.rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(radius * 0.45, radius * 0.45, width * 1.05, 12)
  hubGeo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [-x, zFront],
    [x, zFront],
    [-x, zRear],
    [x, zRear],
  ]) {
    const w = new THREE.Mesh(geo, tire)
    w.position.set(wx, radius, wz)
    g.add(w)
    const cap = new THREE.Mesh(hubGeo, hub)
    cap.position.set(wx, radius, wz)
    g.add(cap)
  }
}
