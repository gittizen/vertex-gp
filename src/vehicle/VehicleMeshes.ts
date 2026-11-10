import * as THREE from 'three'
import { matAccent, matGlass, matLambert, matPaint } from '../render/Materials'
import type { VehicleKind } from '../track/TrackDefs'

/** Vytvoří mesh podle typu tratě. color/neon < 0 = bez barvy / bez neonu. */
export function createVehicleMesh(kind: VehicleKind, color: number, neon = 0x7a8fa8): THREE.Group {
  const paint = color < 0 ? 0x888888 : color
  let g: THREE.Group
  switch (kind) {
    case 'moto':
      g = createMotorcycle(paint, neon)
      break
    case 'harley':
      g = createHarley(paint, neon)
      break
    case 'kroska':
      g = createKroska(paint, neon)
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

function paintWheel(mesh: THREE.Mesh): void {
  mesh.userData.wheelPaint = true
}

function paintRider(mesh: THREE.Mesh): void {
  mesh.userData.riderPaint = true
}

function paintHelm(mesh: THREE.Mesh): void {
  mesh.userData.helmPaint = true
}

/** Kšiltovka — brimForward = kšilt dopředu (+Z), jinak dozadu. (moto-velikost hlavy) */
function addCap(
  parent: THREE.Object3D,
  headY: number,
  headZ: number,
  brimForward: boolean,
  color = 0x1a1a1a,
): void {
  const fabric = matLambert(color)
  const crown = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.58),
    fabric,
  )
  crown.position.set(0, headY + 0.05, headZ)
  paintHelm(crown)
  parent.add(crown)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.04, 10), fabric.clone())
  band.position.set(0, headY + 0.01, headZ)
  paintHelm(band)
  parent.add(band)
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.22), fabric.clone())
  brim.position.set(0, headY - 0.01, headZ + (brimForward ? 0.18 : -0.18))
  paintHelm(brim)
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

/** Neon underglow — původní tenký plinth, 50 % průhlednost. */
function addNeon(g: THREE.Group, color: number, w: number, d: number, y = 0.08): void {
  const c = color < 0 ? 0x7a8fa8 : color
  const glow = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.03, d * 0.9), matAccent(c, 0.18, 0.5))
  glow.position.y = y
  glow.userData.neonGlow = true
  glow.visible = color >= 0
  g.add(glow)
}

/** Městská motorka — Downtown (+ jezdec) */
function createMotorcycle(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xc8c8c8)
  const seat = matLambert(0x222228)
  const suit = matLambert(0x1c2430)
  const leather = matLambert(0x2a1810)
  const skin = matLambert(0xc4a882)
  const visor = matLambert(0x223344, { emissive: 0x112233, emissiveIntensity: 0.35 })

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.8), body)
  tank.position.set(0, 0.78, 0.12)
  tank.rotation.x = -0.12
  paint(tank)
  g.add(tank)

  const fairing = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.5), body.clone())
  fairing.position.set(0, 0.82, 0.78)
  fairing.rotation.x = 0.15
  paint(fairing)
  g.add(fairing)
  const windscreen = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.04), visor)
  windscreen.position.set(0, 1.05, 0.95)
  windscreen.rotation.x = -0.35
  g.add(windscreen)

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.6), body.clone())
  tail.position.set(0, 0.72, -0.6)
  tail.rotation.x = 0.2
  paint(tail)
  g.add(tail)

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.55), seat)
  saddle.position.set(0, 0.92, -0.12)
  g.add(saddle)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.45), chrome)
  engine.position.set(0, 0.48, 0.05)
  g.add(engine)

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.75, 5), chrome)
  fork.rotation.x = 0.28
  fork.position.set(0, 0.58, 0.95)
  g.add(fork)

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.045, 0.045), dark)
  bars.position.set(0, 1.0, 0.7)
  g.add(bars)

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.14, 12)
  wheelGeo.rotateZ(Math.PI / 2)
  const front = new THREE.Mesh(wheelGeo, dark)
  front.position.set(0, 0.38, 1.08)
  front.userData.spinWheel = true
  front.userData.spinAxis = 'x'
  front.userData.spinRadius = 0.38
  paintWheel(front)
  g.add(front)
  const rear = new THREE.Mesh(wheelGeo, dark)
  rear.position.set(0, 0.38, -0.88)
  rear.userData.spinWheel = true
  rear.userData.spinAxis = 'x'
  rear.userData.spinRadius = 0.38
  paintWheel(rear)
  g.add(rear)

  addNeon(g, neon, 0.2, 1.6, 0.18)

  const rider = new THREE.Group()
  rider.userData.motoRider = true

  // Ramena + trup v předklonu
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.42, 0.02)
  shoulders.rotation.x = 0.4
  rider.add(shoulders)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.32), suit)
  paintRider(torso)
  torso.position.set(0, 1.22, -0.08)
  torso.rotation.x = 0.42
  rider.add(torso)
  addBackSkull(rider)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), leather)
  paintRider(hip)
  hip.position.set(0, 0.98, -0.14)
  rider.add(hip)

  // Helma s kšiltem
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), matPaint(color))
  paintHelm(helm)
  helm.position.set(0, 1.66, 0.14)
  helm.scale.set(1, 1.05, 1.12)
  rider.add(helm)
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), matPaint(color))
  paintHelm(chin)
  chin.position.set(0, 1.52, 0.22)
  rider.add(chin)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.06), visor)
  glass.position.set(0, 1.64, 0.32)
  rider.add(glass)

  for (const sx of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.48), leather)
    paintRider(thigh)
    thigh.position.set(0.2 * sx, 0.9, 0.12)
    thigh.rotation.x = -0.62
    rider.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.38), dark)
    shin.position.set(0.22 * sx, 0.58, 0.4)
    shin.rotation.x = 0.28
    rider.add(shin)
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), dark)
    boot.position.set(0.22 * sx, 0.42, 0.62)
    rider.add(boot)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.28), suit)
    paintRider(upperArm)
    upperArm.position.set(0.3 * sx, 1.38, 0.18)
    upperArm.rotation.x = -0.55
    rider.add(upperArm)
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), suit)
    paintRider(fore)
    fore.position.set(0.32 * sx, 1.22, 0.42)
    fore.rotation.x = -1.05
    rider.add(fore)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.34 * sx, 1.12, 0.62)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/** Harley — fat-rear cruiser (široké zadní, nízká sedlačka, krátká řídítka). */
function createHarley(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xc8c8c8)
  const seatMat = matLambert(0x2a1810)
  const suit = matLambert(0x1c2430)
  const leather = matLambert(0x3a2218)
  const skin = matLambert(0xc4a882)
  const visor = matLambert(0x223344, { emissive: 0x112233, emissiveIntensity: 0.35 })

  // Nízký teardrop tank
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.85), body)
  tank.position.set(0, 0.72, 0.12)
  tank.rotation.x = -0.12
  paint(tank)
  g.add(tank)
  const tankBulge = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.4), body.clone())
  paint(tankBulge)
  tankBulge.position.set(0, 0.82, 0.05)
  g.add(tankBulge)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.5), chrome)
  engine.position.set(0, 0.48, 0.02)
  g.add(engine)
  for (const sx of [-1, 1] as const) {
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 8), chrome)
    cyl.position.set(0.17 * sx, 0.58, 0.08)
    g.add(cyl)
  }

  const fenderF = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.4), body.clone())
  paint(fenderF)
  fenderF.position.set(0, 0.68, 1.12)
  g.add(fenderF)
  // Široký zadní blatník nad fat rear
  const fenderR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.65), body.clone())
  paint(fenderR)
  fenderR.position.set(0, 0.78, -0.92)
  g.add(fenderR)

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.55), seatMat)
  saddle.position.set(0, 0.88, -0.22)
  g.add(saddle)
  const pillion = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.28), seatMat)
  pillion.position.set(0, 0.94, -0.52)
  g.add(pillion)

  for (const sx of [-1, 1] as const) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.0, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.3 * sx, 0.36, -0.28)
    g.add(pipe)
  }

  // Mírný rake + nízká řídítka (cruiser, ne ape)
  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.85, 5), chrome)
  fork.rotation.x = 0.32
  fork.position.set(0, 0.62, 1.0)
  g.add(fork)
  const bars = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 6), dark)
  bars.rotation.z = Math.PI / 2
  bars.position.set(0, 1.05, 0.78)
  g.add(bars)
  for (const sx of [-1, 1] as const) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), leather)
    grip.rotation.z = Math.PI / 2
    grip.position.set(0.34 * sx, 1.05, 0.78)
    g.add(grip)
  }

  // Tenčí přední, výrazně fatter zadní
  const frontGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.11, 12)
  frontGeo.rotateZ(Math.PI / 2)
  const front = new THREE.Mesh(frontGeo, dark)
  front.position.set(0, 0.36, 1.18)
  front.userData.spinWheel = true
  front.userData.spinAxis = 'x'
  front.userData.spinRadius = 0.36
  paintWheel(front)
  g.add(front)
  const rearGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.38, 12)
  rearGeo.rotateZ(Math.PI / 2)
  const rear = new THREE.Mesh(rearGeo, dark)
  rear.position.set(0, 0.42, -0.92)
  rear.userData.spinWheel = true
  rear.userData.spinAxis = 'x'
  rear.userData.spinRadius = 0.42
  paintWheel(rear)
  g.add(rear)

  addNeon(g, neon, 0.28, 1.7, 0.16)

  const rider = new THREE.Group()
  rider.userData.motoRider = true
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.28, -0.02)
  rider.add(shoulders)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.32), suit)
  paintRider(torso)
  torso.position.set(0, 1.08, -0.1)
  torso.rotation.x = 0.18
  rider.add(torso)
  addBackSkull(rider)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.28), leather)
  paintRider(hip)
  hip.position.set(0, 0.9, -0.18)
  rider.add(hip)

  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), matPaint(color))
  paintHelm(helm)
  helm.position.set(0, 1.52, 0.04)
  rider.add(helm)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.06), visor)
  glass.position.set(0, 1.5, 0.2)
  rider.add(glass)

  for (const sx of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.42), leather)
    paintRider(thigh)
    thigh.position.set(0.22 * sx, 0.85, 0.08)
    thigh.rotation.x = -0.4
    rider.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), dark)
    shin.position.set(0.24 * sx, 0.55, 0.32)
    shin.rotation.x = 0.15
    rider.add(shin)
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), dark)
    boot.position.set(0.24 * sx, 0.4, 0.5)
    rider.add(boot)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.3), suit)
    paintRider(upperArm)
    upperArm.position.set(0.28 * sx, 1.28, 0.18)
    upperArm.rotation.x = -0.55
    rider.add(upperArm)
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), suit)
    paintRider(fore)
    fore.position.set(0.32 * sx, 1.15, 0.48)
    fore.rotation.x = -0.85
    rider.add(fore)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.34 * sx, 1.05, 0.75)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/** Kroska — crossová motorka (vysoké blatníky, dlouhý zdvih, knobby). */
function createKroska(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xb8b8b8)
  const seat = matLambert(0x222228)
  const suit = matLambert(0x1c2430)
  const leather = matLambert(0x2a1810)
  const skin = matLambert(0xc4a882)
  const visor = matLambert(0x223344, { emissive: 0x112233, emissiveIntensity: 0.35 })
  const plate = matLambert(0xf0f0f0)

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.62), body)
  tank.position.set(0, 0.95, 0.08)
  tank.rotation.x = -0.08
  paint(tank)
  g.add(tank)

  // Vysoký přední blatník
  const fFender = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.55), body.clone())
  fFender.position.set(0, 0.92, 1.05)
  fFender.rotation.x = 0.45
  paint(fFender)
  g.add(fFender)

  const numberPlate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.04), plate)
  numberPlate.position.set(0, 1.05, 0.72)
  g.add(numberPlate)

  const rearFender = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.5), body.clone())
  rearFender.position.set(0, 0.88, -0.72)
  rearFender.rotation.x = -0.35
  paint(rearFender)
  g.add(rearFender)

  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.7), seat)
  saddle.position.set(0, 1.05, -0.22)
  g.add(saddle)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.32, 0.4), chrome)
  engine.position.set(0, 0.58, 0.02)
  g.add(engine)

  // Dlouhé tlumiče / zdvih
  for (const sx of [-1, 1] as const) {
    const shock = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 5), chrome)
    shock.position.set(0.12 * sx, 0.72, -0.55)
    shock.rotation.x = 0.35
    g.add(shock)
  }

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.95, 5), chrome)
  fork.rotation.x = 0.22
  fork.position.set(0, 0.72, 0.95)
  g.add(fork)

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.045, 0.045), dark)
  bars.position.set(0, 1.28, 0.62)
  g.add(bars)
  for (const sx of [-1, 1] as const) {
    const rise = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.28, 5), dark)
    rise.position.set(0.28 * sx, 1.14, 0.62)
    g.add(rise)
  }

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.16, 12)
  wheelGeo.rotateZ(Math.PI / 2)
  const front = new THREE.Mesh(wheelGeo, dark)
  front.position.set(0, 0.42, 1.12)
  front.userData.spinWheel = true
  front.userData.spinAxis = 'x'
  front.userData.spinRadius = 0.42
  paintWheel(front)
  g.add(front)
  const rear = new THREE.Mesh(wheelGeo, dark)
  rear.position.set(0, 0.42, -0.92)
  rear.userData.spinWheel = true
  rear.userData.spinAxis = 'x'
  rear.userData.spinRadius = 0.42
  paintWheel(rear)
  g.add(rear)

  addNeon(g, neon, 0.22, 1.5, 0.2)

  const rider = new THREE.Group()
  rider.userData.motoRider = true
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.55, -0.02)
  shoulders.rotation.x = 0.2
  rider.add(shoulders)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.32), suit)
  paintRider(torso)
  torso.position.set(0, 1.32, -0.1)
  torso.rotation.x = 0.22
  rider.add(torso)
  addBackSkull(rider)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), leather)
  paintRider(hip)
  hip.position.set(0, 1.08, -0.16)
  rider.add(hip)

  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), matPaint(color))
  paintHelm(helm)
  helm.position.set(0, 1.78, 0.06)
  rider.add(helm)
  const chin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), matPaint(color))
  paintHelm(chin)
  chin.position.set(0, 1.64, 0.16)
  rider.add(chin)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.11, 0.06), visor)
  glass.position.set(0, 1.76, 0.26)
  rider.add(glass)

  for (const sx of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.48), leather)
    paintRider(thigh)
    thigh.position.set(0.2 * sx, 0.98, 0.08)
    thigh.rotation.x = -0.5
    rider.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.4), dark)
    shin.position.set(0.22 * sx, 0.62, 0.38)
    shin.rotation.x = 0.2
    rider.add(shin)
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.3), dark)
    boot.position.set(0.22 * sx, 0.45, 0.58)
    rider.add(boot)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.28), suit)
    paintRider(upperArm)
    upperArm.position.set(0.3 * sx, 1.48, 0.12)
    upperArm.rotation.x = -0.4
    rider.add(upperArm)
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.32), suit)
    paintRider(fore)
    fore.position.set(0.34 * sx, 1.36, 0.42)
    fore.rotation.x = -0.9
    rider.add(fore)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.36 * sx, 1.28, 0.68)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/** Open-wheel formule — Klecany */
function createFormula(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x151515)
  const wing = matLambert(0xe8e8ec)
  const chrome = matLambert(0xb0b0b8)

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 1.7), body)
  nose.position.set(0, 0.3, 1.4)
  paint(nose)
  g.add(nose)
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.45), body.clone())
  tip.position.set(0, 0.28, 2.25)
  paint(tip)
  g.add(tip)

  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.32, 1.65), body.clone())
  tub.position.set(0, 0.36, 0.05)
  paint(tub)
  g.add(tub)

  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.26, 0.65), dark)
  cockpit.position.set(0, 0.58, -0.02)
  g.add(cockpit)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.03, 6, 12, Math.PI * 1.2), chrome)
  halo.rotation.x = Math.PI / 2
  halo.position.set(0, 0.72, -0.02)
  g.add(halo)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.38, 0.95), dark)
  engine.position.set(0, 0.42, -1.05)
  g.add(engine)
  const airbox = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.4), body.clone())
  airbox.position.set(0, 0.72, -0.85)
  paint(airbox)
  g.add(airbox)

  const frontWing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.32), wing)
  frontWing.position.set(0, 0.16, 2.15)
  g.add(frontWing)
  for (const sx of [-1, 1] as const) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.32), wing)
    end.position.set(0.95 * sx, 0.26, 2.15)
    g.add(end)
  }

  const rearWing = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.06, 0.35), wing)
  rearWing.position.set(0, 0.95, -1.55)
  g.add(rearWing)
  for (const sx of [-1, 1] as const) {
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), wing)
    end.position.set(0.72 * sx, 0.72, -1.55)
    g.add(end)
  }

  for (const sx of [-1, 1] as const) {
    const pontoon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.24, 1.5), body.clone())
    pontoon.position.set(0.72 * sx, 0.26, 0.05)
    paint(pontoon)
    g.add(pontoon)
  }

  addNeon(g, neon, 1.2, 2.8, 0.1)
  addWheels(g, dark, chrome, 0.95, 1.4, -1.3, 0.32, 0.28)
  return g
}

/** Monster truck — vysoký podvozek, klec, šikmá kapota, obří kola. */
function createMonsterTruck(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matGlass(0x1a2838)
  const chrome = matLambert(0xc8c8c8)
  const iron = matLambert(0x2a2e32)

  // Rám / žebřina
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.22, 3.5), iron)
  frame.position.set(0, 1.05, 0)
  g.add(frame)

  // Spodní korba + šikmá kapota
  const tub = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.7, 2.4), body)
  tub.position.set(0, 1.7, -0.15)
  paint(tub)
  g.add(tub)
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.22, 1.45), body.clone())
  hood.position.set(0, 1.95, 1.45)
  hood.rotation.x = 0.22
  paint(hood)
  g.add(hood)
  const snout = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.45, 0.7), body.clone())
  snout.position.set(0, 1.55, 2.05)
  paint(snout)
  g.add(snout)

  // Kabina
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 1.15), glass)
  cabin.position.set(0, 2.45, 0.15)
  g.add(cabin)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.1, 1.0), body.clone())
  roof.position.set(0, 2.95, 0.1)
  paint(roof)
  g.add(roof)

  // Roll cage
  for (const sx of [-1, 1] as const) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 6), chrome)
    bar.position.set(0.78 * sx, 2.55, -0.55)
    g.add(bar)
  }
  const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 12, Math.PI), chrome)
  hoop.rotation.x = Math.PI / 2
  hoop.rotation.z = Math.PI / 2
  hoop.position.set(0, 2.85, -0.55)
  g.add(hoop)
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.55, 6), chrome)
  cross.rotation.z = Math.PI / 2
  cross.position.set(0, 2.95, -0.55)
  g.add(cross)

  // Blatníky nad koly
  for (const [sx, sz] of [
    [-1, 1.35],
    [1, 1.35],
    [-1, -1.45],
    [1, -1.45],
  ] as const) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 1.1), body.clone())
    fender.position.set(1.35 * sx, 1.85, sz)
    paint(fender)
    g.add(fender)
  }

  // Nárazník + světla
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.35, 0.45), chrome)
  bumper.position.set(0, 1.15, 2.45)
  g.add(bumper)
  const lightMat = matLambert(0xffe8c0, { emissive: 0xffcc88, emissiveIntensity: 0.45 })
  for (const sx of [-1, 1] as const) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), lightMat)
    hl.position.set(0.7 * sx, 1.55, 2.4)
    g.add(hl)
  }

  // Korba vzadu
  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 1.2), dark)
  bed.position.set(0, 1.85, -1.55)
  g.add(bed)

  // Stojanové výfuky + turbo kužely
  for (const sx of [-1, 1] as const) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6), chrome)
    stack.position.set(0.95 * sx, 2.2, -0.95)
    g.add(stack)
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.95 * sx, 1.35, -2.15)
    g.add(pipe)
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.32, 1.1, 7),
      matLambert(0xff6a18, { emissive: 0xff3a00, emissiveIntensity: 0.25 }),
    )
    outer.rotation.x = Math.PI
    outer.position.set(0.95 * sx, 1.35, -2.8)
    outer.scale.setScalar(0.05)
    outer.userData.turboFlame = true
    outer.visible = false
    g.add(outer)
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.75, 6),
      matLambert(0xffee88, { emissive: 0xffcc33, emissiveIntensity: 0.4 }),
    )
    core.rotation.x = Math.PI
    core.position.set(0.95 * sx, 1.35, -2.6)
    core.scale.setScalar(0.05)
    core.userData.turboFlame = true
    core.visible = false
    g.add(core)
  }

  addNeon(g, neon, 2.0, 3.0, 0.35)
  addWheels(g, dark, chrome, 1.35, 1.35, -1.45, 0.92, 0.62)
  return g
}

/**
 * Tahač + přívěs na točnici (`userData.truckTrailer`).
 * Kabina jede s rootem; přívěs se v Vehicle.syncTrailerJoint natáčí.
 */
function createTruck(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matGlass(0x1a2838)
  const chrome = matLambert(0xc8c8c8)
  const iron = matLambert(0x2a2e32)
  const lightMat = matLambert(0xffe8c0, { emissive: 0xffcc88, emissiveIntensity: 0.4 })
  const tailMat = matLambert(0xc02028, { emissive: 0x901018, emissiveIntensity: 0.45 })

  // —— Tahač (dlouhá kapota) ——
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.28, 3.4), iron)
  chassis.position.set(0, 0.72, 0.85)
  g.add(chassis)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.55, 1.7), body)
  hood.position.set(0, 1.15, 1.95)
  paint(hood)
  g.add(hood)
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 0.08), chrome)
  grille.position.set(0, 1.15, 2.82)
  g.add(grille)
  for (const sx of [-1, 1] as const) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.06), lightMat)
    hl.position.set(0.55 * sx, 1.05, 2.85)
    g.add(hl)
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.25, 1.35), body.clone())
  cabin.position.set(0, 1.75, 0.55)
  paint(cabin)
  g.add(cabin)
  const wind = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.1), glass)
  wind.position.set(0, 2.05, 1.2)
  wind.rotation.x = -0.18
  g.add(wind)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.12, 1.15), body.clone())
  roof.position.set(0, 2.45, 0.5)
  paint(roof)
  g.add(roof)
  for (const sx of [-1, 1] as const) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.18), dark)
    mirror.position.set(1.08 * sx, 1.95, 1.05)
    g.add(mirror)
  }

  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.28, 0.35), chrome)
  bumper.position.set(0, 0.7, 2.9)
  g.add(bumper)

  // Točnice (fifth wheel)
  const hitchZ = 0.05
  const fifth = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.14, 10), chrome)
  fifth.position.set(0, 1.05, hitchZ)
  g.add(fifth)
  const king = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.28, 8), iron)
  king.position.set(0, 1.2, hitchZ)
  g.add(king)

  // Výfuky na tahači + turbo
  for (const sx of [-1, 1] as const) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.35, 6), chrome)
    stack.position.set(0.85 * sx, 2.0, -0.15)
    g.add(stack)
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.4, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.85 * sx, 1.15, -0.55)
    g.add(pipe)
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.85, 7),
      matLambert(0xff6a18, { emissive: 0xff3a00, emissiveIntensity: 0.25 }),
    )
    flame.rotation.x = Math.PI
    flame.position.set(0.85 * sx, 1.15, -1.05)
    flame.scale.setScalar(0.05)
    flame.userData.turboFlame = true
    flame.visible = false
    g.add(flame)
  }

  addWheels(g, dark, chrome, 1.05, 2.15, -0.35, 0.55, 0.42)
  // Zadní tandem tahače (pohon)
  addWheelAt(g, dark, chrome, -1.05, 0.55, -0.95, 0.55, 0.42)
  addWheelAt(g, dark, chrome, 1.05, 0.55, -0.95, 0.55, 0.42)

  // —— Přívěs na kloubu ——
  const trailer = new THREE.Group()
  trailer.userData.truckTrailer = true
  trailer.position.set(0, 0, hitchZ)

  const gooseneck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 1.1), iron)
  gooseneck.position.set(0, 1.15, -0.45)
  trailer.add(gooseneck)

  const box = new THREE.Mesh(new THREE.BoxGeometry(2.25, 2.15, 4.6), body.clone())
  box.position.set(0, 2.15, -2.85)
  paint(box)
  trailer.add(box)
  // Žebra / silueta kontejneru
  for (let i = 0; i < 5; i++) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(2.32, 2.05, 0.08), dark)
    rib.position.set(0, 2.15, -1.1 - i * 0.85)
    trailer.add(rib)
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.35, 0.5), dark)
  nose.position.set(0, 3.15, -0.7)
  trailer.add(nose)

  // Stojánky
  for (const sx of [-1, 1] as const) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 6), chrome)
    leg.position.set(0.55 * sx, 0.7, -1.35)
    trailer.add(leg)
  }

  // Nápravy přívěsu
  for (const z of [-3.35, -4.25] as const) {
    addWheelAt(trailer, dark, chrome, -1.1, 0.48, z, 0.48, 0.4)
    addWheelAt(trailer, dark, chrome, 1.1, 0.48, z, 0.48, 0.4)
  }
  for (const sx of [-1, 1] as const) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), tailMat)
    tl.position.set(0.75 * sx, 1.35, -5.15)
    trailer.add(tl)
  }

  g.add(trailer)
  addNeon(g, neon, 1.7, 5.2, 0.22)
  return g
}

/** Tank — silueta blíže Tiger I: šikmý glacis, boxová věž, dlouhá hlaveň, pásy. */
function createTank(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const chrome = matLambert(0xa8a8b0)
  const iron = matLambert(0x2a2e32)

  // Spodní korba
  const lower = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.55, 4.1), body)
  lower.position.set(0, 0.72, -0.05)
  paint(lower)
  g.add(lower)

  // Šikmý přední pancíř (glacis)
  const glacis = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.18, 1.55), body.clone())
  glacis.position.set(0, 1.05, 1.35)
  glacis.rotation.x = -0.42
  paint(glacis)
  g.add(glacis)

  // Horní deska + zadní motorový blok
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.28, 2.2), body.clone())
  deck.position.set(0, 1.18, -0.35)
  paint(deck)
  g.add(deck)
  const engine = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 1.15), dark)
  engine.position.set(0, 1.28, -1.55)
  g.add(engine)

  // Boxová věž (Tiger)
  const turret = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.72, 1.85), body.clone())
  turret.position.set(0, 1.72, -0.2)
  paint(turret)
  g.add(turret)
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.22, 8), dark)
  cupola.position.set(0.35, 2.18, -0.15)
  g.add(cupola)
  const mantlet = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.35), iron)
  mantlet.position.set(0, 1.72, 0.85)
  g.add(mantlet)

  // Dlouhá 88mm hlaveň
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 2.85, 8), dark)
  barrel.rotation.x = Math.PI / 2
  barrel.position.set(0, 1.72, 2.2)
  g.add(barrel)
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.28, 8), chrome)
  muzzle.rotation.x = Math.PI / 2
  muzzle.position.set(0, 1.72, 3.55)
  g.add(muzzle)

  // Pásy + blatníky
  for (const sx of [-1, 1] as const) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 4.0), dark)
    track.position.set(1.28 * sx, 0.42, -0.05)
    g.add(track)
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 3.6), body.clone())
    skirt.position.set(1.55 * sx, 0.85, -0.1)
    paint(skirt)
    g.add(skirt)
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 4.05), iron)
    fender.position.set(1.28 * sx, 0.78, -0.05)
    g.add(fender)
  }

  // Výfuky + turbo kužely (Tab)
  for (const sx of [-1, 1] as const) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.45, 6), chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0.75 * sx, 1.15, -2.2)
    g.add(pipe)
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 0.95, 7),
      matLambert(0xff6a18, { emissive: 0xff3a00, emissiveIntensity: 0.25 }),
    )
    outer.rotation.x = Math.PI
    outer.position.set(0.75 * sx, 1.15, -2.75)
    outer.scale.setScalar(0.05)
    outer.userData.turboFlame = true
    outer.visible = false
    g.add(outer)
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.65, 6),
      matLambert(0xffee88, { emissive: 0xffcc33, emissiveIntensity: 0.4 }),
    )
    core.rotation.x = Math.PI
    core.position.set(0.75 * sx, 1.15, -2.55)
    core.scale.setScalar(0.05)
    core.userData.turboFlame = true
    core.visible = false
    g.add(core)
  }

  addNeon(g, neon, 1.7, 3.0, 0.18)
  addWheels(g, dark, chrome, 1.25, 1.35, -1.45, 0.38, 0.32)
  return g
}

/** Hummer limuzína — boxy SUV silueta, stejná délka jako dřív. */
/** Limuzína — silueta ve stylu Lincoln Town Car stretch (formální maska, dlouhý salon). */
function createLimo(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matGlass(0x1a2838)
  const chrome = matLambert(0xc8c8d0)
  const lightMat = matLambert(0xffe8c0, { emissive: 0xffcc88, emissiveIntensity: 0.45 })
  const tailMat = matLambert(0xc02028, { emissive: 0x901018, emissiveIntensity: 0.45 })

  // Nízký formální sedan body + stretch
  const tub = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.55, 6.6), body)
  tub.position.set(0, 0.72, 0)
  paint(tub)
  g.add(tub)
  const rocker = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.12, 6.2), chrome)
  rocker.position.set(0, 0.4, 0)
  g.add(rocker)
  const belt = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.05, 5.6), chrome)
  belt.position.set(0, 0.98, -0.1)
  g.add(belt)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.14, 1.45), body.clone())
  hood.position.set(0, 1.05, 2.45)
  paint(hood)
  g.add(hood)

  // Lincoln-like chrome grille
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.55, 0.08), chrome)
  grille.position.set(0, 0.85, 3.25)
  g.add(grille)
  for (let i = -3; i <= 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.04), dark)
    slat.position.set(i * 0.14, 0.85, 3.3)
    g.add(slat)
  }
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.2, 0.28), chrome)
  bumper.position.set(0, 0.42, 3.28)
  g.add(bumper)

  // Stretch salon — dlouhá flat roof
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.2), glass)
  cabin.position.set(0, 1.35, -0.2)
  g.add(cabin)
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 4.15), body.clone())
  roof.position.set(0, 1.75, -0.2)
  paint(roof)
  g.add(roof)
  for (let i = 0; i < 5; i++) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.09), dark)
    pillar.position.set(0.96, 1.32, 1.45 - i * 0.85)
    g.add(pillar)
    const pillarR = pillar.clone()
    pillarR.position.x = -0.96
    g.add(pillarR)
  }

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.42, 1.0), body.clone())
  trunk.position.set(0, 1.05, -2.95)
  paint(trunk)
  g.add(trunk)
  const trunkLid = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.08, 0.9), body.clone())
  trunkLid.position.set(0, 1.3, -2.95)
  paint(trunkLid)
  g.add(trunkLid)

  for (const sx of [-1, 1] as const) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), lightMat)
    hl.position.set(0.65 * sx, 0.85, 3.22)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat)
    tl.position.set(0.7 * sx, 0.95, -3.4)
    g.add(tl)
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.2), dark)
    mirror.position.set(1.1 * sx, 1.25, 1.55)
    g.add(mirror)
  }

  addNeon(g, neon, 1.55, 5.4, 0.16)
  addWheels(g, dark, chrome, 0.98, 2.35, -2.45, 0.4, 0.32)
  return g
}

/** Koloběžka — chyták, vizuálně nepoužitelná. */
/** Koloběžka — easter egg; panáček moto-velikost. */
function createScooter(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x222228)
  const chrome = matLambert(0xa8aeb8)
  const suit = matLambert(0x1c2430)
  const leather = matLambert(0x2a1810)
  const skin = matLambert(0xc4a882)

  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 1.35), body)
  deck.position.set(0, 0.28, -0.05)
  paint(deck)
  g.add(deck)
  const deckEdge = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 1.38), dark)
  deckEdge.position.set(0, 0.24, -0.05)
  g.add(deckEdge)

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 1.15, 8), chrome)
  stem.position.set(0, 0.88, 0.52)
  stem.rotation.x = -0.12
  g.add(stem)
  const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), dark)
  clamp.position.set(0, 0.38, 0.48)
  g.add(clamp)

  const bars = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.045, 0.045), dark)
  bars.position.set(0, 1.42, 0.58)
  g.add(bars)
  for (const sx of [-1, 1] as const) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6), leather)
    grip.rotation.z = Math.PI / 2
    grip.position.set(0.32 * sx, 1.42, 0.58)
    g.add(grip)
  }

  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.18), dark)
  brake.position.set(0, 0.34, -0.55)
  g.add(brake)

  const wr = 0.2
  const wGeo = new THREE.CylinderGeometry(wr, wr, 0.1, 14)
  wGeo.rotateZ(Math.PI / 2)
  const front = new THREE.Mesh(wGeo, dark)
  front.position.set(0, wr, 0.55)
  front.userData.spinWheel = true
  front.userData.spinAxis = 'x'
  front.userData.spinRadius = wr
  paintWheel(front)
  g.add(front)
  const rear = new THREE.Mesh(wGeo, dark)
  rear.position.set(0, wr, -0.58)
  rear.userData.spinWheel = true
  rear.userData.spinAxis = 'x'
  rear.userData.spinRadius = wr
  paintWheel(rear)
  g.add(rear)

  addNeon(g, neon, 0.18, 1.1, 0.12)

  // Panáček — stejná měřítka jako moto rider
  const rider = new THREE.Group()
  rider.userData.motoRider = true
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.48, -0.05)
  shoulders.rotation.x = 0.15
  rider.add(shoulders)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.32), suit)
  paintRider(torso)
  torso.position.set(0, 1.26, -0.12)
  torso.rotation.x = 0.18
  rider.add(torso)
  addBackSkull(rider)
  const hip = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), leather)
  paintRider(hip)
  hip.position.set(0, 1.02, -0.16)
  rider.add(hip)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skin)
  head.position.set(0, 1.72, 0.02)
  rider.add(head)
  addCap(rider, 1.72, 0.02, true, 0x1a1a1a)

  for (const sx of [-1, 1] as const) {
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.42), leather)
    paintRider(thigh)
    thigh.position.set(0.16 * sx, 0.88, 0.05)
    thigh.rotation.x = -0.35
    rider.add(thigh)
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), dark)
    shin.position.set(0.16 * sx, 0.55, 0.28)
    shin.rotation.x = 0.15
    rider.add(shin)
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), dark)
    boot.position.set(0.16 * sx, 0.4, 0.48)
    rider.add(boot)
    const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.28), suit)
    paintRider(upperArm)
    upperArm.position.set(0.28 * sx, 1.42, 0.12)
    upperArm.rotation.x = -0.45
    rider.add(upperArm)
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), suit)
    paintRider(fore)
    fore.position.set(0.32 * sx, 1.38, 0.4)
    fore.rotation.x = -0.75
    rider.add(fore)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.34 * sx, 1.4, 0.58)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/**
 * Skateboard — prohlý nose/tail; deska −20 % (panáček moto-velikost beze změny).
 */
function createSkateboard(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const deckMat = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const suit = matLambert(0x1c2430)
  const skin = matLambert(0xc4a882)

  const boardPivot = new THREE.Group()
  boardPivot.userData.skateBoard = true

  // Jen prkno + trucks + kolečka — scale 0.8; jezdec mimo
  const deck = new THREE.Group()
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.06, 1.25), deckMat)
  mid.position.y = 0.42
  paint(mid)
  deck.add(mid)
  for (const sx of [-1, 1] as const) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.055, 1.2), deckMat.clone())
    paint(rail)
    rail.position.set(0.3 * sx, 0.46, 0)
    deck.add(rail)
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.4), deckMat.clone())
  paint(nose)
  nose.position.set(0, 0.52, 0.78)
  nose.rotation.x = -0.55
  deck.add(nose)
  const noseTip = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.045, 0.16), deckMat.clone())
  paint(noseTip)
  noseTip.position.set(0, 0.64, 0.98)
  noseTip.rotation.x = -0.85
  deck.add(noseTip)
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.4), deckMat.clone())
  paint(tail)
  tail.position.set(0, 0.52, -0.78)
  tail.rotation.x = 0.55
  deck.add(tail)
  const tailTip = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.045, 0.16), deckMat.clone())
  paint(tailTip)
  tailTip.position.set(0, 0.64, -0.98)
  tailTip.rotation.x = 0.85
  deck.add(tailTip)

  const truckF = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.14), dark)
  truckF.position.set(0, 0.3, 0.52)
  deck.add(truckF)
  const truckR = truckF.clone()
  truckR.position.z = -0.52
  deck.add(truckR)
  const wheelGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.14, 8)
  wheelGeo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [-0.26, 0.52],
    [0.26, 0.52],
    [-0.26, -0.52],
    [0.26, -0.52],
  ]) {
    const w = new THREE.Mesh(wheelGeo, dark)
    w.position.set(wx, 0.24, wz)
    w.userData.spinWheel = true
    w.userData.spinAxis = 'x'
    w.userData.spinRadius = 0.11
    paintWheel(w)
    deck.add(w)
  }
  deck.scale.setScalar(0.64) // −20 % z předchozího 0.8
  deck.position.y = 0.42 * 0.36 // držet nášlap u ~0.42
  boardPivot.add(deck)
  g.add(boardPivot)
  addNeon(g, neon, 0.45, 1.4, 0.16)

  // Stejné tělo jako moto (world units, bez scale)
  const rider = new THREE.Group()
  rider.userData.skateRider = true
  rider.position.set(0, 0.42, 0)

  const backLeg = new THREE.Group()
  backLeg.userData.ollieBackLeg = true
  backLeg.position.set(-0.1, 0.92, -0.12)
  const backThigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), suit)
  paintRider(backThigh)
  backThigh.position.set(0, -0.14, 0)
  backLeg.add(backThigh)
  const backKnee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), suit)
  paintRider(backKnee)
  backKnee.position.set(0, -0.36, 0.01)
  backLeg.add(backKnee)
  const backShin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), suit)
  paintRider(backShin)
  backShin.position.set(0, -0.56, 0.02)
  backShin.userData.ollieBackShin = true
  backLeg.add(backShin)
  const backFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), dark)
  backFoot.position.set(0, -0.78, 0.06)
  backLeg.add(backFoot)
  rider.add(backLeg)

  const pushLeg = new THREE.Group()
  pushLeg.userData.pushLeg = true
  pushLeg.userData.ollieFrontLeg = true
  pushLeg.position.set(0.12, 0.92, 0.1)
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), suit)
  paintRider(thigh)
  thigh.position.set(0, -0.14, 0)
  pushLeg.add(thigh)
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), suit)
  paintRider(knee)
  knee.position.set(0, -0.36, 0.01)
  pushLeg.add(knee)
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.12), suit)
  paintRider(shin)
  shin.position.set(0, -0.56, 0.02)
  shin.userData.pushShin = true
  pushLeg.add(shin)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.28), dark)
  foot.position.set(0, -0.78, 0.08)
  foot.userData.pushFoot = true
  pushLeg.add(foot)
  rider.add(pushLeg)

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), suit)
  paintRider(hips)
  hips.position.set(0, 0.98, 0)
  rider.add(hips)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.28), suit)
  paintRider(torso)
  torso.position.set(0, 1.28, 0)
  torso.userData.ollieTorso = true
  rider.add(torso)
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.48, 0.02)
  rider.add(shoulders)
  addJerseyText(rider, 'KATE', 0, 1.3, 0.16)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 6), skin)
  neck.position.set(0, 1.58, 0.02)
  rider.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin)
  head.position.set(0, 1.72, 0.02)
  rider.add(head)
  addCap(rider, 1.72, 0.02, true, 0x2a2a32)

  for (const sx of [-1, 1] as const) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), suit)
    paintRider(upper)
    upper.position.set(0.3 * sx, 1.35, 0.04)
    upper.rotation.z = 0.18 * sx
    upper.userData.ollieArm = true
    rider.add(upper)
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.09), suit)
    paintRider(lower)
    lower.position.set(0.34 * sx, 1.08, 0.05)
    lower.rotation.z = 0.12 * sx
    lower.userData.ollieArm = true
    rider.add(lower)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.36 * sx, 0.9, 0.06)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/**
 * BMX — freestyle rám ve směru jízdy (YZ), výplet v rovině kola, vysoká řídítka.
 */
function createBicycle(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const frame = matPaint(color)
  const dark = matLambert(0x1a1a1a)
  const suit = matLambert(0x1c2430)
  const skin = matLambert(0xc4a882)
  const chrome = matLambert(0xb8b8c0)
  const pad = matLambert(0x222228)

  const boardPivot = new THREE.Group()
  boardPivot.userData.skateBoard = true

  const wr = 0.36
  const wheelMat = matLambert(0x1a1a1a)

  // Kolo v rovině YZ (díra ráfku na X); paprsky rotují kolem X — ne napříč jako ježek
  const addBmxWheel = (z: number) => {
    const tire = new THREE.Mesh(new THREE.TorusGeometry(wr, 0.045, 8, 20), wheelMat.clone())
    tire.rotation.y = Math.PI / 2
    tire.position.set(0, wr, z)
    paintWheel(tire)
    tire.userData.spinWheel = true
    tire.userData.spinAxis = 'z'
    tire.userData.spinRadius = wr
    boardPivot.add(tire)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 8), chrome)
    hub.rotation.z = Math.PI / 2
    hub.position.set(0, wr, z)
    paintWheel(hub)
    boardPivot.add(hub)
    for (let i = 0; i < 4; i++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, wr * 1.65, 4), chrome)
      spoke.position.set(0, wr, z)
      spoke.rotation.x = (i / 4) * Math.PI
      boardPivot.add(spoke)
    }
    // Pegy
    for (const sx of [-1, 1] as const) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), chrome)
      peg.rotation.z = Math.PI / 2
      peg.position.set(0.16 * sx, wr, z)
      boardPivot.add(peg)
    }
  }
  addBmxWheel(0.95)
  addBmxWheel(-0.78)

  // Trubka ve směru jízdy: cyl podél Y → Rx(π/2) = podél Z; pitch = náklon v bočním pohledu
  const tubeZ = (len: number, thick: number, y: number, z: number, pitch: number) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(thick, thick, len, 6), frame.clone())
    paint(m)
    m.rotation.x = Math.PI / 2 + pitch
    m.position.set(0, y, z)
    boardPivot.add(m)
  }
  tubeZ(0.78, 0.034, 0.92, 0.08, 0.05) // top
  tubeZ(0.88, 0.036, 0.62, 0.12, -0.48) // down
  const seatTube = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.55, 6), frame.clone())
  paint(seatTube)
  seatTube.position.set(0, 0.78, -0.28)
  boardPivot.add(seatTube)
  tubeZ(0.48, 0.022, 0.72, -0.52, 0.38) // seat stay
  tubeZ(0.5, 0.022, 0.42, -0.5, 0.02) // chain stay

  const fork = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 6), chrome)
  fork.rotation.x = 0.18
  fork.position.set(0, 0.68, 0.82)
  boardPivot.add(fork)
  const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8), chrome)
  bb.rotation.z = Math.PI / 2
  bb.position.set(0, 0.4, -0.02)
  boardPivot.add(bb)
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.28), pad)
  seat.position.set(0, 1.02, -0.3)
  boardPivot.add(seat)

  // Vysoká BMX řídítka
  const steerer = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.35, 6), chrome)
  steerer.position.set(0, 1.05, 0.72)
  boardPivot.add(steerer)
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), dark)
  cross.rotation.z = Math.PI / 2
  cross.position.set(0, 1.22, 0.72)
  boardPivot.add(cross)
  for (const sx of [-1, 1] as const) {
    const rise = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.28, 6), dark)
    rise.position.set(0.32 * sx, 1.35, 0.72)
    boardPivot.add(rise)
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 6), pad)
    grip.rotation.z = Math.PI / 2
    grip.position.set(0.32 * sx, 1.48, 0.72)
    boardPivot.add(grip)
  }

  const crank = new THREE.Group()
  crank.userData.pedalCrank = true
  crank.position.set(0, 0.4, -0.02)
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), chrome)
  armL.position.set(-0.08, 0, 0.12)
  crank.add(armL)
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.28), chrome)
  armR.position.set(0.08, 0, -0.12)
  crank.add(armR)
  const pedL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), dark)
  pedL.position.set(-0.14, 0, 0.24)
  crank.add(pedL)
  const pedR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.06), dark)
  pedR.position.set(0.14, 0, -0.24)
  crank.add(pedR)
  boardPivot.add(crank)

  g.add(boardPivot)
  addNeon(g, neon, 0.35, 1.6, 0.12)

  // BMX jezdec — vzpřímenější, ruce na vysokých řídítkách
  const rider = new THREE.Group()
  rider.userData.skateRider = true
  rider.position.set(0, 0, -0.08)

  const backLeg = new THREE.Group()
  backLeg.userData.ollieBackLeg = true
  backLeg.position.set(-0.1, 0.95, -0.08)
  backLeg.rotation.x = 0.35
  const backThigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.42), suit)
  paintRider(backThigh)
  backThigh.position.set(0, -0.02, 0.08)
  backLeg.add(backThigh)
  const backShin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), suit)
  paintRider(backShin)
  backShin.position.set(0, -0.22, 0.28)
  backShin.rotation.x = 0.25
  backLeg.add(backShin)
  const backFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), dark)
  backFoot.position.set(0, -0.38, 0.42)
  backLeg.add(backFoot)
  rider.add(backLeg)

  const pushLeg = new THREE.Group()
  pushLeg.userData.pushLeg = true
  pushLeg.userData.ollieFrontLeg = true
  pushLeg.position.set(0.1, 0.95, 0.06)
  pushLeg.rotation.x = 0.2
  const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.42), suit)
  paintRider(thigh)
  thigh.position.set(0, -0.02, 0.08)
  pushLeg.add(thigh)
  const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.36), suit)
  paintRider(shin)
  shin.position.set(0, -0.22, 0.28)
  shin.rotation.x = 0.3
  shin.userData.pushShin = true
  pushLeg.add(shin)
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.22), dark)
  foot.position.set(0, -0.38, 0.42)
  foot.userData.pushFoot = true
  pushLeg.add(foot)
  rider.add(pushLeg)

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.26), suit)
  paintRider(hips)
  hips.position.set(0, 1.0, -0.1)
  rider.add(hips)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.3), suit)
  paintRider(torso)
  torso.position.set(0, 1.28, 0.02)
  torso.rotation.x = 0.25
  torso.userData.ollieTorso = true
  rider.add(torso)
  const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.16, 0.28), suit)
  paintRider(shoulders)
  shoulders.position.set(0, 1.5, 0.12)
  shoulders.rotation.x = 0.2
  rider.add(shoulders)
  addJerseyText(rider, 'BMX', 0, 1.28, 0.18, -0.2)
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.1, 6), skin)
  neck.position.set(0, 1.62, 0.16)
  rider.add(neck)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin)
  head.position.set(0, 1.74, 0.18)
  rider.add(head)
  const helm = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
    dark,
  )
  paintHelm(helm)
  helm.position.set(0, 1.78, 0.16)
  rider.add(helm)

  for (const sx of [-1, 1] as const) {
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.32), suit)
    paintRider(upper)
    upper.position.set(0.28 * sx, 1.42, 0.28)
    upper.rotation.x = -0.55
    upper.userData.ollieArm = true
    rider.add(upper)
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.3), suit)
    paintRider(fore)
    fore.position.set(0.3 * sx, 1.4, 0.52)
    fore.rotation.x = -0.35
    fore.userData.ollieArm = true
    rider.add(fore)
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.12), skin)
    hand.position.set(0.32 * sx, 1.48, 0.7)
    rider.add(hand)
  }
  g.add(rider)

  return g
}

/** Městské auto — nižší silueta, sklo, méně „Lego kostek“. */
/** ZávoďáQ — původní street silueta (název ZávoďáQ). */
function createStreetCar(color: number, neon = 0x7a8fa8): THREE.Group {
  const g = new THREE.Group()
  const body = matPaint(color)
  const dark = matLambert(0x141418)
  const glass = matGlass(0x152030)
  const chrome = matLambert(0xa8aeb8)
  const lightMat = matLambert(0xffe8c0, { emissive: 0xffcc88, emissiveIntensity: 0.4 })
  const tailMat = matLambert(0xc02028, { emissive: 0x901018, emissiveIntensity: 0.45 })

  const lower = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.32, 4.35), body)
  lower.position.y = 0.38
  paint(lower)
  g.add(lower)

  const rocker = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 3.7), dark)
  rocker.position.set(0, 0.18, 0.05)
  g.add(rocker)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 1.2), body.clone())
  hood.position.set(0, 0.66, 1.42)
  hood.rotation.x = 0.04
  paint(hood)
  g.add(hood)

  for (const sx of [-1, 1] as const) {
    const fender = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 1.05), body.clone())
    fender.position.set(0.96 * sx, 0.48, 1.38)
    paint(fender)
    g.add(fender)
    const rearF = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.9), body.clone())
    rearF.position.set(0.96 * sx, 0.46, -1.4)
    paint(rearF)
    g.add(rearF)
  }

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.48, 1.7), glass)
  cabin.position.set(0, 0.92, -0.08)
  cabin.scale.set(1, 1, 1)
  g.add(cabin)

  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.06, 1.48), body.clone())
  roof.position.set(0, 1.18, -0.12)
  paint(roof)
  g.add(roof)

  for (const sx of [-1, 1] as const) {
    const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.1), dark)
    aPillar.position.set(0.74 * sx, 0.98, 0.7)
    aPillar.rotation.x = -0.32
    g.add(aPillar)
    const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.38, 0.12), dark)
    cPillar.position.set(0.72 * sx, 0.96, -0.85)
    g.add(cPillar)
  }

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.12, 0.9), body.clone())
  trunk.position.set(0, 0.7, -1.58)
  paint(trunk)
  g.add(trunk)

  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.18, 0.26), dark)
  bumperF.position.set(0, 0.28, 2.22)
  g.add(bumperF)
  const bumperR = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.16, 0.2), dark)
  bumperR.position.set(0, 0.28, -2.18)
  g.add(bumperR)

  for (const sx of [-1, 1] as const) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.06), lightMat)
    hl.position.set(0.52 * sx, 0.48, 2.14)
    g.add(hl)
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), tailMat)
    tl.position.set(0.55 * sx, 0.5, -2.2)
    g.add(tl)
  }

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.16, 0.05), dark)
  grille.position.set(0, 0.42, 2.16)
  g.add(grille)

  for (const sx of [-1, 1] as const) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.08), dark)
    mirror.position.set(0.92 * sx, 0.88, 0.52)
    g.add(mirror)
  }

  addNeon(g, neon, 1.55, 3.5, 0.1)
  addWheels(g, dark, chrome, 0.94, 1.28, -1.38, 0.36, 0.28)
  return g
}

function addWheelAt(
  parent: THREE.Object3D,
  tire: THREE.Material,
  hub: THREE.Material,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
): void {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 22)
  geo.rotateZ(Math.PI / 2)
  const hubGeo = new THREE.CylinderGeometry(radius * 0.42, radius * 0.42, width * 1.04, 16)
  hubGeo.rotateZ(Math.PI / 2)
  const w = new THREE.Mesh(geo, tire)
  w.position.set(x, y, z)
  w.userData.spinWheel = true
  w.userData.spinAxis = 'x'
  w.userData.spinRadius = radius
  paintWheel(w)
  parent.add(w)
  const cap = new THREE.Mesh(hubGeo, hub)
  cap.position.set(x, y, z)
  cap.userData.spinWheel = true
  cap.userData.spinAxis = 'x'
  cap.userData.spinRadius = radius
  paintWheel(cap)
  parent.add(cap)
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
  for (const [wx, wz] of [
    [-x, zFront],
    [x, zFront],
    [-x, zRear],
    [x, zRear],
  ]) {
    addWheelAt(g, tire, hub, wx, radius, wz, radius, width)
  }
}
