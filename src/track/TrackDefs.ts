export type VehicleKind = 'street' | 'formula' | 'rally'
export type WorldKind = 'city' | 'circuit' | 'ice'

export type TrackTheme = {
  road: number
  ground: number
  barrierL: number
  barrierR: number
  edge: number
  sky: number
  fog: number
  building: number
  accent: number
  detail: number
}

export type TrackDef = {
  id: string
  name: string
  blurb: string
  halfWidth: number
  tension: number
  vehicle: VehicleKind
  world: WorldKind
  /** 1 = suchý asfalt, ~0.45 = led */
  surfaceGrip: number
  points: [number, number][]
  theme: TrackTheme
}

export const TRACKS: TrackDef[] = [
  {
    id: 'city',
    name: 'Downtown Sprint',
    blurb: 'Úzké noční ulice · vytuněná auta · neon a mlha',
    halfWidth: 7.2,
    tension: 0.36,
    vehicle: 'street',
    world: 'city',
    surfaceGrip: 1,
    points: [
      [0, -120],
      [40, -145],
      [95, -130],
      [120, -70],
      [95, -15],
      [35, 10],
      [15, 55],
      [55, 95],
      [20, 130],
      [-40, 135],
      [-95, 100],
      [-115, 40],
      [-85, -15],
      [-110, -55],
      [-70, -100],
      [-20, -125],
    ],
    theme: {
      road: 0x5a5a68,
      ground: 0x0c0c14,
      barrierL: 0xff2bd6,
      barrierR: 0x2de2e6,
      edge: 0xffe0ff,
      sky: 0x080812,
      fog: 0x1a1230,
      building: 0x222030,
      accent: 0xff2bd6,
      detail: 0x2de2e6,
    },
  },
  {
    id: 'monza',
    name: 'Monza Parabolica',
    blurb: 'Klasický F1 okruh · tribuny a fanoušci · formule',
    halfWidth: 12.5,
    tension: 0.28,
    vehicle: 'formula',
    world: 'circuit',
    surfaceGrip: 1,
    points: [
      [0, -260],
      [40, -280],
      [100, -270],
      [160, -220],
      [200, -140],
      [210, -40],
      [180, 60],
      [120, 140],
      [40, 190],
      [-60, 200],
      [-150, 150],
      [-200, 60],
      [-210, -40],
      [-180, -140],
      [-110, -220],
      [-40, -255],
    ],
    theme: {
      road: 0x2f3338,
      ground: 0x2f7a3e,
      barrierL: 0xe10600,
      barrierR: 0xffffff,
      edge: 0xffffff,
      sky: 0x6eb0e0,
      fog: 0xa8d0ea,
      building: 0xc4c4c4,
      accent: 0xe10600,
      detail: 0x3a8f4a,
    },
  },
  {
    id: 'ice',
    name: 'Alpine Freeze',
    blurb: 'Široká ledová trať · rallye · hory a jezero',
    halfWidth: 18,
    tension: 0.3,
    vehicle: 'rally',
    world: 'ice',
    surfaceGrip: 0.68,
    points: [
      [0, -280],
      [70, -310],
      [170, -290],
      [250, -200],
      [280, -60],
      [240, 80],
      [140, 180],
      [20, 240],
      [-110, 250],
      [-220, 180],
      [-280, 40],
      [-270, -100],
      [-190, -210],
      [-80, -270],
    ],
    theme: {
      road: 0xb8cce0,
      ground: 0xe4eef5,
      barrierL: 0xff6a00,
      barrierR: 0x2a6aaa,
      edge: 0xffffff,
      sky: 0x9ab8d0,
      fog: 0xd2e2ee,
      building: 0x8aa0b0,
      accent: 0xff6a00,
      detail: 0x3a6a4a,
    },
  },
]

export function getTrackDef(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0]
}
