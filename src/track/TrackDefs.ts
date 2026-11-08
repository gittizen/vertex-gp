export type VehicleKind =
  | 'moto'
  | 'formula'
  | 'monster'
  | 'street'
  | 'skate'
  | 'bike'
  | 'truck'
  | 'tank'
  | 'limo'
  | 'scooter'
export type WorldKind = 'city' | 'town' | 'rally' | 'climb' | 'plaza'
export type SkyBody = 'sun' | 'moon'

/**
 * Čitelný charcoal asfalt 2026 (ne pastel, ne skoro-černá).
 */
export const ASPHALT_GREY = 0x565a62

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
  /** true = okruh, false = start→cíl */
  loop: boolean
  surfaceGrip: number
  aiSpeedMult: number
  /** Násobitel stropu rychlosti všech jezdců na této trati (1 = beze změny). */
  playerSpeedMult?: number
  /**
   * Kalibrované tempo hráče (street, střední) — 1 kolo / 1 etapa v ms.
   * AI #2 jede na toto tempo; ostatní peklostroje přes poměr stropů.
   */
  targetPaceMs?: number
  skyBody: SkyBody
  heights?: number[]
  points: [number, number][]
  theme: TrackTheme
  /** Předpokládaný čas (orientačně z kalibrace / 2 kola u okruhu) */
  estTime: string
  /**
   * Volná plocha (ne závod) — Plácek apod.
   * Hranice v metrech kolem středu (0,0).
   */
  sandbox?: boolean
  sandboxBounds?: { halfX: number; halfZ: number }
}

/**
 * Kruhový objezd — body na kružnici (stupně, CCW kladně).
 * ~300° = jasný kruháč; reverse tratě = průjezd opačným směrem.
 */
function rbt(
  cx: number,
  cz: number,
  r: number,
  startDeg: number,
  sweepDeg: number,
  steps = 14,
): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = ((startDeg + (sweepDeg * i) / steps) * Math.PI) / 180
    out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
  }
  return out
}

export const TRACKS: TrackDef[] = [
  {
    id: 'klecanek',
    name: 'Do Klecánek',
    blurb: 'Ostře z Povltavské do kopce — dole ztráta nervů, nahoře hřbitov',
    halfWidth: 7.2,
    tension: 0.22,
    vehicle: 'street',
    world: 'climb',
    loop: false,
    surfaceGrip: 1,
    aiSpeedMult: 1,
    targetPaceMs: 15518,
    skyBody: 'sun',
    estTime: '0:16',
    // OSRM: Klecánky → ostrá Povltavská → Do Klecánek (serpentiny) → Čsl. armády → U Hřbitova
    points: [
      [0, 0],
      [-24.6, 11.3],
      [-46, 51.4],
      [-64, 86.9],
      [-66.5, 116.2],
      [-36.9, 132],
      [-7.9, 142.2],
      [-11.9, 172.6],
      [5.3, 196.9],
      [31.6, 207.8],
      [55.6, 221.7],
      [80.3, 232.9],
      [102.8, 247.3],
      [116.3, 269],
      [120.2, 294.6],
      [136.1, 314.6],
      [153.7, 332.6],
      [172.3, 349],
      [190.3, 365.4],
      [201.5, 386.6],
      [211.3, 408.3],
      [231.5, 411.5],
      [249.8, 397.3],
      [269.8, 386.6],
      [291.8, 380.6],
      [313.6, 375.4],
      [335.3, 370.7],
      [356.3, 376.1],
      [371, 391.7],
      [380.1, 411.4],
      [388.5, 431.1],
      [397.5, 450.3],
      [414.6, 462.3],
      [434.4, 469],
      [454.3, 475.1],
      [474, 481.1],
      [493.7, 486.6],
      [513.2, 485.4],
      [532.3, 478.9],
      [551.1, 471.8],
      [568.3, 461.8],
      [581.2, 449.6],
    ],
    heights: [
      0, 1, 2.1, 3.2, 4.4, 5.7, 6.9, 8.2, 9.5, 10.8, 12.2, 13.5, 14.9, 16.2, 17.6, 19, 20.4, 21.8,
      23.2, 24.6, 26.1, 27.5, 28.9, 30.4, 31.9, 33.3, 34.8, 36.3, 37.7, 39.2, 40.1, 40.4, 40.6, 40.9,
      41.2, 41.4, 41.7, 42, 42.2, 42.5, 42.7, 43,
    ],
    theme: {
      road: 0x9a968c,
      ground: 0x3a4e2c,
      barrierL: 0xb8a078,
      barrierR: 0xb8a078,
      edge: 0xffffff,
      sky: 0x7eb4d4,
      fog: 0xb8d0c8,
      building: 0xc8b8a4,
      accent: 0xc62828,
      detail: 0x2f5a32,
    },
  },
  {
    id: 'city',
    name: 'Noční Klecany',
    blurb: 'Neon, moře a lidi, co ti fandí i když jedeš do zdi',
    halfWidth: 7.2,
    tension: 0.36,
    vehicle: 'moto',
    world: 'city',
    loop: true,
    surfaceGrip: 1,
    aiSpeedMult: 1,
    targetPaceMs: 15034,
    skyBody: 'moon',
    estTime: '0:30',
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
      road: 0xa0a4ac,
      ground: 0x12121a,
      barrierL: 0xff2bd6,
      barrierR: 0x2de2e6,
      edge: 0xffffff,
      sky: 0x080812,
      fog: 0x221830,
      building: 0x222030,
      accent: 0xff2bd6,
      detail: 0x2de2e6,
    },
  },
  {
    id: 'klecany',
    name: 'Námko',
    blurb: 'Vesnický okruh: kostel, zámek a tvoje ego na Topolové',
    halfWidth: 7.6,
    tension: 0.32,
    vehicle: 'formula',
    world: 'town',
    loop: true,
    surfaceGrip: 1,
    aiSpeedMult: 1.22,
    targetPaceMs: 17018,
    skyBody: 'sun',
    estTime: '0:34',
    // Okruh podle ulic Klecan: Do Klecánek → náměstí → Čsl. armády / zámek
    // → Topolová / NUDZ → sídliště → Přemyšlenská → zpět
    points: [
      // Do Klecánek (start)
      [22, -155],
      [20, -100],
      [16, -52],
      // náměstí V. B. Třebízského (objezd)
      [-16, -24],
      [-50, -4],
      [-58, 32],
      [-28, 56],
      [12, 62],
      [46, 40],
      // U Školy → Topolová na východ
      [82, 22],
      [128, 40],
      [168, 82],
      [188, 128],
      // NUDZ / Topolová otočka
      [176, 172],
      [128, 198],
      [72, 208],
      // K Sídlišti
      [16, 200],
      [-30, 176],
      // Přemyšlenská / Na Hradišti
      [-64, 140],
      [-86, 94],
      [-92, 48],
      // Čsl. armády, kostel a zámek — zpět mimo startovní rovinku
      [-80, 8],
      [-62, -32],
      [-42, -88],
      [-8, -132],
    ],
    theme: {
      road: 0xa8a49c,
      ground: 0x4a4a38,
      barrierL: 0xc4a574,
      barrierR: 0xc4a574,
      edge: 0xffffff,
      sky: 0xff8a52,
      fog: 0xffc49a,
      building: 0xc8b8a4,
      accent: 0xb8860b,
      detail: 0x5a6a40,
    },
  },
  {
    id: 'turini',
    name: 'Novostavby',
    blurb: 'Bahno, turbo a pocit, že Sauron řídí safety car',
    halfWidth: 8.5,
    tension: 0.38,
    vehicle: 'monster',
    world: 'rally',
    loop: false,
    // Stejný grip jako Do Klecánek / Noční Klecany — bez „icy“ režimu (<0.85)
    surfaceGrip: 1,
    aiSpeedMult: 0.76,
    targetPaceMs: 26435,
    skyBody: 'sun',
    estTime: '0:26',
    // Stejná trasa — monstertruck aréna
    points: [
      [0, 0],
      [10, 80],
      [18, 170],
      [60, 220],
      [120, 240],
      [175, 280],
      [200, 350],
      [185, 430],
      [170, 520],
      [110, 560],
      [40, 545],
      [-25, 575],
      [-75, 640],
      [-95, 730],
      [-75, 820],
      [-15, 870],
      [55, 895],
      [115, 950],
      [145, 1040],
      [130, 1130],
      [70, 1180],
      [5, 1200],
      [-50, 1260],
      [-80, 1350],
      [-55, 1440],
      [10, 1490],
      [80, 1530],
      [125, 1600],
      [140, 1700],
      [150, 1800],
      [158, 1900],
    ],
    heights: [
      2, 3, 5, 8, 10, 12, 13, 12, 10, 7, 5, 4, 6, 9, 12, 14, 15, 13, 10, 7, 5, 6, 9, 12, 14, 13,
      10, 8, 7, 8, 9,
    ],
    theme: {
      road: 0x565a62,
      ground: 0x3a2a18,
      barrierL: 0xb07040,
      barrierR: 0x8a6040,
      edge: 0xa08060,
      sky: 0x3a2818,
      fog: 0x5a4030,
      building: 0x4a4848,
      accent: 0xc08050,
      detail: 0x5a3a22,
    },
  },
  {
    // OSM: V Mexiku (~50.1735, 14.4189) · U Školky / Na Kopečku — sídliště, Brooklyn nahoře
    id: 'mexiku',
    name: 'Mexiko',
    blurb: 'Brooklyn paneláky × vesnice u vody — 90° bloky, dlouhá zatáčka',
    halfWidth: 7.0,
    tension: 0.18,
    vehicle: 'skate',
    world: 'climb',
    loop: false,
    surfaceGrip: 1,
    aiSpeedMult: 0.1365,
    targetPaceMs: 61805,
    playerSpeedMult: 0.5,
    skyBody: 'sun',
    estTime: '1:02',
    // Sídliště V Mexiku: střídavé 90° L/R (bloky), Brooklyn úplně nahoře, jedna dlouhá zatáčka uprostřed
    points: [
      // ——— Brooklyn (nejvyšší) ———
      [0, 0],
      [0, 55],
      [70, 55], // 90° R
      [70, 110],
      [-20, 110], // 90° L
      [-20, 175],
      [80, 175], // 90° R
      [80, 240],
      [-10, 240], // 90° L
      [-10, 300],
      [90, 300], // 90° R
      [90, 355],
      [20, 355], // 90° L
      [20, 400],
      // ——— dlouhá zatáčka uprostřed (jediná táhlá, ne 90°) ———
      [55, 445],
      [120, 485],
      [200, 505],
      [285, 500],
      [355, 465],
      [400, 410],
      [420, 340],
      // ——— spodní sídliště — 90° do obou stran ———
      [420, 270],
      [330, 270], // 90° L
      [330, 200],
      [420, 200], // 90° R
      [420, 130],
      [325, 130], // 90° L
      [325, 55],
      [420, 55], // 90° R
      [420, -20],
      [310, -20], // 90° L
      [310, -95],
      [200, -95], // 90° R→L blok
      [200, -175],
      [95, -175], // 90° L
      [95, -255],
      [-15, -255], // 90° R
      [-15, -335],
      [-120, -335], // 90° L
      [-120, -410],
      [-40, -450],
      [40, -490],
    ],
    heights: [
      54, 52, 50, 48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 23, 20, 17, 15, 13, 12, 11, 10, 9.5, 9,
      8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5,
    ],
    theme: {
      road: 0x9e9088,
      ground: 0x2a3820,
      barrierL: 0xe8a020,
      barrierR: 0xe8a020,
      edge: 0xffffff,
      sky: 0x5a8aaa,
      fog: 0x4a6878,
      building: 0xc0b098,
      accent: 0xff6a9a,
      detail: 0x1e3a22,
    },
  },
  {
    id: 'hruby',
    name: 'Hrubý',
    blurb: 'Sedlec → 3 kruháče → Hrubý → Zdibsko — obousměrně',
    halfWidth: 8.2,
    tension: 0.3,
    vehicle: 'street',
    world: 'town',
    loop: true,
    surfaceGrip: 1,
    aiSpeedMult: 1,
    targetPaceMs: 30519,
    skyBody: 'sun',
    estTime: '1:01',
    // Sedlec → podjezd → 3× kruháč (~300°, reverse = opačný směr) → Hrubý → Zdibsko → Sedlec
    points: [
      // Sedlec — jih (ne Líbeznice)
      [0, 0],
      [-6, -70],
      [-14, -145],
      [-20, -210],
      // nájezd na kruháč 1 (Ke Zdibsku / podjezd D8)
      [-28, -248],
      ...rbt(-40, -290, 42, 90, 300, 14),
      // k benzínce Hrubý
      [-120, -310],
      [-175, -280],
      [-215, -255],
      // kruháč 2 u Hrubý
      ...rbt(-255, -245, 40, 25, 300, 14),
      // na Zdibsko
      [-310, -190],
      [-345, -120],
      [-360, -50],
      [-355, -5],
      // kruháč 3 Zdibsko
      ...rbt(-325, 30, 42, -95, 300, 14),
      // rovinka zpět na Sedlec
      [-250, 45],
      [-175, 52],
      [-100, 55],
      [-40, 48],
      [10, 28],
      [8, 10],
    ],
    theme: {
      road: 0x989aa2,
      ground: 0x3d522c,
      barrierL: 0xc4a574,
      barrierR: 0xc4a574,
      edge: 0xffffff,
      sky: 0x8ab4d4,
      fog: 0xc8d8e8,
      building: 0xc8b8a4,
      accent: 0x2e7d32,
      detail: 0x4a6a38,
    },
  },
  {
    // OSM: Na Zlatý kopec, Přemyšlení / Zdiby (~50.1586, 14.4270)
    id: 'zlaty',
    name: 'Zlatý kopec',
    blurb: 'Přemyšlení → Zlatý kopec: zlatý výšlap, nahoře se ti to vyplatí',
    halfWidth: 7.4,
    tension: 0.22,
    vehicle: 'street',
    world: 'climb',
    loop: false,
    surfaceGrip: 1,
    aiSpeedMult: 1,
    targetPaceMs: 19868,
    skyBody: 'sun',
    estTime: '0:20',
    // Mírný výšlap (jako Do Klecánek) — bez utopení v terénu
    points: [
      [0, 0],
      [22, 70],
      [48, 145],
      [35, 230],
      [-5, 310],
      [-48, 380],
      [-30, 460],
      [25, 530],
      [80, 590],
      [110, 680],
      [70, 760],
      [15, 840],
      [-40, 920],
      [-20, 1010],
      [45, 1090],
      [100, 1170],
      [130, 1260],
      [95, 1350],
      [40, 1430],
      [10, 1520],
      [55, 1600],
      [120, 1680],
    ],
    heights: [
      0, 1.5, 3.2, 5, 7, 9.2, 11.5, 14, 16.5, 19, 21.5, 24, 26.5, 29, 31.5, 34, 36.5, 39, 41, 43, 45,
      47,
    ],
    theme: {
      road: 0xa09888,
      ground: 0x4a3a1a,
      barrierL: 0xd4a017,
      barrierR: 0xd4a017,
      edge: 0xffe08a,
      sky: 0xffb060,
      fog: 0xffd9a0,
      building: 0xc4a878,
      accent: 0xffc107,
      detail: 0x5a4a22,
    },
  },
  {
    // OSM / obecní mapa: Hlavní + Červená Skála, Husinec–Řež (~50.17, 14.36)
    id: 'serpentiny',
    name: 'Serpentýny Řež',
    blurb: 'Husinec → Řež: krpál a vlásenky u Červené skály',
    halfWidth: 7.0,
    tension: 0.2,
    vehicle: 'moto',
    world: 'climb',
    loop: false,
    surfaceGrip: 1,
    aiSpeedMult: 1,
    targetPaceMs: 36769,
    skyBody: 'sun',
    estTime: '0:37',
    // Vlásenky bez překryvu: střídavé L/R legy, rozestup ≥ ~36 m (2× halfWidth + rezerva)
    points: [
      [0, 0],
      [180, 30],
      [220, 70], // hairpin 1
      [40, 110],
      [0, 150], // hairpin 2
      [180, 190],
      [220, 230], // hairpin 3
      [40, 270],
      [0, 310], // hairpin 4
      [180, 350],
      [220, 390], // hairpin 5
      [40, 430],
      [0, 470], // hairpin 6
      [180, 510],
      [220, 550], // hairpin 7
      [40, 590],
      [20, 640],
      [80, 700],
      [160, 760],
      [240, 820],
      [300, 880],
      [340, 960],
    ],
    heights: [
      0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42,
    ],
    theme: {
      road: 0x989288,
      ground: 0x3a4a28,
      barrierL: 0xc45c3a,
      barrierR: 0xc45c3a,
      edge: 0xffffff,
      sky: 0x6a9ab8,
      fog: 0xa8c4c8,
      building: 0xb8a890,
      accent: 0xe85a3a,
      detail: 0x2a4a30,
    },
  },
  {
    id: 'placek',
    name: 'Plácek',
    blurb: 'Volná plocha u vody — jeď čím chceš, freestyle body se sčítají',
    halfWidth: 12,
    tension: 0.2,
    vehicle: 'skate',
    world: 'plaza',
    loop: true,
    sandbox: true,
    sandboxBounds: { halfX: 170, halfZ: 110 },
    surfaceGrip: 1.05,
    aiSpeedMult: 0,
    skyBody: 'sun',
    estTime: '∞',
    // Obvod pro náhled / watermark
    points: [
      [-170, -110],
      [170, -110],
      [170, 110],
      [-170, 110],
    ],
    theme: {
      road: 0x9c9890,
      ground: 0x3e5a32,
      barrierL: 0xd0c8b0,
      barrierR: 0xd0c8b0,
      edge: 0xffffff,
      sky: 0x7ec8e8,
      fog: 0xb8d8e8,
      building: 0xc4b49a,
      accent: 0x2a8f6e,
      detail: 0x2f5a28,
    },
  },
  {
    // OSM / ÚP Klecany: Dolní (~západ, větší) + Horní (~východ) kasárny + E–W spojka
    id: 'kasarny',
    name: 'Kasárny',
    blurb: 'Dolní × Horní kasárny Klecany — beton, rampy a skate po bývalém areálu',
    halfWidth: 7.6,
    tension: 0.22,
    vehicle: 'skate',
    world: 'town',
    loop: true,
    surfaceGrip: 1,
    aiSpeedMult: 0.1365,
    targetPaceMs: 15785,
    skyBody: 'sun',
    estTime: '0:32',
    // Okruh: parade Dolní (Z) → spojka → parade Horní (V) → zpět
    points: [
      // Dolní — jih (směr zámek / výjezd)
      [-130, -95],
      [-130, -40],
      [-130, 20],
      [-130, 85],
      // Dolní — severní parade
      [-85, 115],
      [-35, 120],
      [5, 105],
      // Spojka Dolní → Horní (E–W páteř)
      [45, 70],
      [85, 35],
      [120, 10],
      // Horní — západní vjezd → jih
      [155, -15],
      [185, -55],
      [215, -40],
      // Horní — východ (směr Astrapark / D8)
      [235, 5],
      [240, 55],
      [220, 100],
      // Horní — sever → zpět na spojku
      [175, 115],
      [135, 95],
      [100, 55],
      [70, 20],
      // Střední kink (bývalá spojka Horní/Dolní)
      [35, -15],
      [0, -45],
      [-45, -75],
      [-90, -100],
      [-130, -95],
    ],
    theme: {
      road: 0x9a9a98,
      ground: 0x3a4238,
      barrierL: 0xff6a3d,
      barrierR: 0x2de2e6,
      edge: 0xffffff,
      sky: 0x7a9ab0,
      fog: 0xa8b8c4,
      building: 0x8a9098,
      accent: 0xff2bd6,
      detail: 0xffe08a,
    },
  },
]

export function getTrackDef(id: string): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0]
}

export const VEHICLE_KINDS: VehicleKind[] = [
  'moto',
  'formula',
  'monster',
  'truck',
  'tank',
  'street',
  'limo',
  'skate',
  'bike',
  'scooter',
]

/** Soupeři / závod — bez koloběžky (trap). */
export const RACE_VEHICLE_KINDS: VehicleKind[] = VEHICLE_KINDS.filter((k) => k !== 'scooter')

/** Freestyle peklostroje. */
export const FREESTYLE_VEHICLE_KINDS: VehicleKind[] = ['skate', 'bike']

/** Otočí body (a výšky) — jízda v opačném směru. */
export function resolveTrackDef(def: TrackDef, reverse: boolean): TrackDef {
  if (!reverse || def.sandbox) return def
  return {
    ...def,
    points: [...def.points].reverse() as [number, number][],
    heights: def.heights ? [...def.heights].reverse() : undefined,
  }
}
