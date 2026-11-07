import * as THREE from 'three'
import { matLambert } from '../render/Materials'
import type { VehicleKind } from '../track/TrackDefs'

/** Vytvoří mesh podle typu tratě. */
export function createVehicleMesh(kind: VehicleKind, color: number): THREE.Group {
  switch (kind) {
    case 'street':
      return createStreetCar(color)
    case 'rally':
      return createRallyCar(color)
    default:
      return createFormula(color)
  }
}

function paint(mesh: THREE.Mesh): void {
  mesh.userData.bodyPaint = true
}

/** Vytuněné městské auto */
function createStreetCar(color: number): THREE.Group {
  const g = new THREE.Group()
  const body = matLambert(color)
  const dark = matLambert(0x1a1a1a)
  const glass = matLambert(0x6a8aa8)
  const chrome = matLambert(0xc0c0c0)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.45, 4.2), body)
  chassis.position.y = 0.45
  paint(chassis)
  g.add(chassis)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 1.8), glass)
  cabin.position.set(0, 0.95, -0.15)
  g.add(cabin)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 1.1), body.clone())
  hood.position.set(0, 0.72, 1.35)
  paint(hood)
  g.add(hood)

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.35), dark)
  spoiler.position.set(0, 0.95, -1.95)
  g.add(spoiler)

  const skirtL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 3.2), dark)
  skirtL.position.set(-0.95, 0.25, 0)
  g.add(skirtL)
  const skirtR = skirtL.clone()
  skirtR.position.x = 0.95
  g.add(skirtR)

  // Neon underglow
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.06, 3.6),
    matLambert(0xff2bd6, { emissive: 0xff2bd6, emissiveIntensity: 0.7 }),
  )
  glow.position.y = 0.12
  g.add(glow)

  addWheels(g, dark, chrome, 0.95, 1.25, -1.35, 0.38, 0.32)
  return g
}

/** F1 formule */
function createFormula(color: number): THREE.Group {
  const g = new THREE.Group()
  const W = 1.2
  const body = matLambert(color)
  const carbon = matLambert(0x141414)
  const wing = matLambert(0xe8e8e8)

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.42 * W, 0.22, 1.4), body)
  nose.position.set(0, 0.18, 1.55)
  paint(nose)
  g.add(nose)

  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.2 * W, 0.12, 0.4), body.clone())
  tip.position.set(0, 0.14, 2.3)
  paint(tip)
  g.add(tip)

  const fw = new THREE.Mesh(new THREE.BoxGeometry(1.85 * W, 0.05, 0.36), wing)
  fw.position.set(0, 0.06, 2.4)
  g.add(fw)

  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.95 * W, 0.36, 1.5), body.clone())
  tub.position.set(0, 0.24, 0.1)
  paint(tub)
  g.add(tub)

  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.3 * W, 0.04, 6, 12, Math.PI), carbon)
  halo.rotation.x = Math.PI / 2
  halo.position.set(0, 0.5, 0.05)
  g.add(halo)

  const podL = new THREE.Mesh(new THREE.BoxGeometry(0.36 * W, 0.28, 1.15), body.clone())
  podL.position.set(-0.55 * W, 0.22, -0.15)
  paint(podL)
  g.add(podL)
  const podR = podL.clone()
  podR.position.x = 0.55 * W
  paint(podR)
  g.add(podR)

  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.7 * W, 0.42, 1.1), body.clone())
  engine.position.set(0, 0.32, -1.05)
  paint(engine)
  g.add(engine)

  const rw = new THREE.Mesh(new THREE.BoxGeometry(1.55 * W, 0.07, 0.32), wing)
  rw.position.set(0, 0.7, -1.65)
  g.add(rw)
  const endL = new THREE.Mesh(new THREE.BoxGeometry(0.07 * W, 0.48, 0.32), carbon)
  endL.position.set(-0.74 * W, 0.48, -1.65)
  g.add(endL)
  const endR = endL.clone()
  endR.position.x = 0.74 * W
  g.add(endR)

  addWheels(g, carbon, carbon, 0.78 * W, 1.1, -1.15, 0.3, 0.28)
  return g
}

/** Rallye hatch na led */
function createRallyCar(color: number): THREE.Group {
  const g = new THREE.Group()
  const body = matLambert(color)
  const dark = matLambert(0x1c1c1c)
  const glass = matLambert(0x7a9ab0)
  const accent = matLambert(0xff6a00)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.55, 4.0), body)
  chassis.position.y = 0.55
  paint(chassis)
  g.add(chassis)

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 1.7), glass)
  cabin.position.set(0, 1.15, -0.2)
  g.add(cabin)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.15, 1.2), body.clone())
  hood.position.set(0, 0.85, 1.2)
  paint(hood)
  g.add(hood)

  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.45), dark)
  wing.position.set(0, 1.25, -1.85)
  g.add(wing)

  const lightBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.18, 0.25),
    matLambert(0xfff2cc, { emissive: 0xffe0a0, emissiveIntensity: 0.6 }),
  )
  lightBar.position.set(0, 1.35, 1.55)
  g.add(lightBar)

  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.58, 4.05), accent)
  stripe.position.set(0, 0.55, 0)
  g.add(stripe)

  const archL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 1.1), dark)
  archL.position.set(-1.0, 0.4, 1.2)
  g.add(archL)
  const archR = archL.clone()
  archR.position.x = 1.0
  g.add(archR)
  const archLr = archL.clone()
  archLr.position.z = -1.25
  g.add(archLr)
  const archRr = archR.clone()
  archRr.position.z = -1.25
  g.add(archRr)

  addWheels(g, dark, accent, 1.0, 1.25, -1.3, 0.42, 0.38)
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
  const geo = new THREE.CylinderGeometry(radius, radius, width, 8)
  geo.rotateZ(Math.PI / 2)
  for (const [wx, wz] of [
    [-x, zFront],
    [x, zFront],
    [-x, zRear],
    [x, zRear],
  ]) {
    const w = new THREE.Mesh(geo, tire)
    w.position.set(wx, radius, wz)
    g.add(w)
    void hub
  }
}
