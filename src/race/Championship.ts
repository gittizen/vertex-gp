import { GAME_STORAGE_NS } from '../input/KeyBindings'
import { TRACKS } from '../track/TrackDefs'
import type { VehicleKind } from '../track/TrackDefs'
import type { DifficultyId } from '../ai/Difficulty'
import {
  CHAMP_TUNING_MAX,
  DEFAULT_CHAMP_TUNING,
  normalizeChampTuning,
  type PlayerTuningValues,
} from '../tuning/PlayerTuning'
import { CATALOG_MAX_KMH } from '../vehicle/VehicleProfiles'
import type { VehicleBranch } from '../vehicle/VehicleLook'
import { kindsInBranch, vehicleBranch } from '../vehicle/VehicleLook'
import { placePoints } from '../freestyle/FreestyleTricks'
import {
  cashCarryFraction,
  DNF_PLACE,
  isDnfPlace,
  placeCash,
  roundPoints,
  seasonPodiumPurse,
  seasonPodiumTier,
  CHAMP_START_CASH,
  startCash,
  tuningUpgradeCost,
  type SeasonPodiumTier,
  vehicleBuyPrice,
} from './ChampEconomy'

/** Tratě šampionátu — bez Plácku, pořadí jako v TRACKS. */
export const CHAMPIONSHIP_TRACKS: string[] = TRACKS.filter((t) => !t.sandbox).map((t) => t.id)

/** Baby 1 · Malá 3 · Velká 9 kol */
export type ChampLeague = 'baby' | 'small' | 'grand'
/** Pool tratí: polovina katalogu / všechny */
export type ChampTrackPool = 'half' | 'all'

/** @deprecated alias — staré save → mapuje se v normalize */
export type ChampCupSize = 'sprint' | 'full' | ChampLeague

export const LEAGUE_ROUNDS: Record<ChampLeague, number> = {
  baby: 1,
  small: 3,
  grand: 9,
}

export type ChampionshipRoundMeta = {
  trackId: string
  reverse: boolean
  indexLabel: string
}

export function championshipTrackPoolIds(pool: ChampTrackPool): string[] {
  if (pool === 'half') {
    const n = Math.max(1, Math.ceil(CHAMPIONSHIP_TRACKS.length / 2))
    return CHAMPIONSHIP_TRACKS.slice(0, n)
  }
  return [...CHAMPIONSHIP_TRACKS]
}

export function championshipSchedule(
  league: ChampLeague,
  pool: ChampTrackPool = 'half',
): { trackId: string; reverse: boolean }[] {
  const tracks = championshipTrackPoolIds(pool)
  const need = LEAGUE_ROUNDS[league]
  const out: { trackId: string; reverse: boolean }[] = []
  let reverse = false
  let i = 0
  while (out.length < need) {
    const trackId = tracks[i % tracks.length]!
    out.push({ trackId, reverse })
    i++
    if (i % tracks.length === 0) reverse = !reverse
  }
  return out
}

export function championshipTotalRounds(
  league: ChampLeague = 'baby',
  _pool: ChampTrackPool = 'half',
): number {
  return LEAGUE_ROUNDS[league]
}

/** Zpětná kompatibilita (dřív F→R celý katalog). */
export const CHAMPIONSHIP_TOTAL_ROUNDS = LEAGUE_ROUNDS.grand

export function championshipRoundMeta(
  round: number,
  league: ChampLeague = 'baby',
  pool: ChampTrackPool = 'half',
): ChampionshipRoundMeta | null {
  const schedule = championshipSchedule(league, pool)
  const total = schedule.length
  if (round < 0 || round >= total) return null
  const entry = schedule[round]
  if (!entry) return null
  const suffix = entry.reverse ? 'R' : 'F'
  return {
    trackId: entry.trackId,
    reverse: entry.reverse,
    indexLabel: `${round + 1}/${total}${suffix}`,
  }
}

/**
 * Kvalifikace:
 * - freestyle → Plácek (1 min triků; Plácek není v kalendáři série)
 * - ostatní → první okruhová trať kategorie (dopředu)
 */
export function championshipQualTrackId(branch?: VehicleBranch): string {
  if (branch === 'freestyle') return 'placek'
  return CHAMPIONSHIP_TRACKS[0] ?? TRACKS.find((tr) => !tr.sandbox)?.id ?? TRACKS[0]!.id
}

/** FS kvalifikace: 60 s na Plácku. */
export const CHAMP_FS_QUAL_MS = 60_000

export function isChampFsQual(career: ChampCareer): boolean {
  return !career.qualified && career.branch === 'freestyle'
}

export function isChampQualifying(career: ChampCareer): boolean {
  return !career.qualified
}

export function needsChampPostQualSetup(career: ChampCareer): boolean {
  return Boolean(career.qualified) && (!career.leagueChosen || !career.seriesChosen)
}

export type ChampRoundResult = {
  trackId: string
  reverse: boolean
  place: number
  pts: number
  cashEarned: number
  trickPts?: number
}

export type ChampCareer = {
  branch: VehicleBranch
  season: 1 | 2
  difficulty: DifficultyId
  league: ChampLeague
  trackPool: ChampTrackPool
  /**
   * Pevní AI soupeři sezóny (ne hráč).
   * Od půlky poháru: nejpomalejší slot → nejrychlejší vůz větve (`ensureChampRivalMidSpike`).
   */
  rivals: [VehicleKind, VehicleKind, VehicleKind]
  round: number
  done: boolean
  vehicle: VehicleKind
  unlocked: VehicleKind[]
  cash: number
  points: number
  results: ChampRoundResult[]
  tuning: PlayerTuningValues
  /** Půlka sezóny: hráč byl nejpomalejší → útěcha (scooter), bez poháru. */
  consolation?: boolean
  /** Půlka už proběhla (AI→apex nebo hráč→útěcha) — jen 1×. */
  midSpikeDone?: boolean
  /** Persist: tuning je už na škále 0–5 (ne legacy solo 0–10 / neutrál 5). */
  tuneScale?: 5
  /** Start grant 45k už započítán (migrace ze starého ~20k). */
  cashGrant45k?: boolean
  /** Kvalifikační 1 kolo hotové (bez výhry). */
  qualified?: boolean
  /** Po kvalifikaci: liga + pool potvrzené. */
  leagueChosen?: boolean
  /** Po kvalifikaci: série (obtížnost) potvrzená. */
  seriesChosen?: boolean
}

export type ChampMeta = {
  /** Peněženka na start další sezóny (per větev). */
  podiumCarry: Record<VehicleBranch, number>
  season2Unlocked: Record<VehicleBranch, boolean>
}

const META_KEY = `${GAME_STORAGE_NS}.champMeta`
const CAREERS_KEY = `${GAME_STORAGE_NS}.champCareers`
const LEGACY_KEY = `${GAME_STORAGE_NS}.championship`
/** Jednorázový wipe starých kariér (nákupy / dojeté / špatný cash). */
const CHAMP_WIPE_KEY = `${GAME_STORAGE_NS}.champWipe.v3`

const BRANCHES: VehicleBranch[] = ['auto', 'moto', 'monster', 'freestyle']

function emptyBranchRecord<T>(fill: T): Record<VehicleBranch, T> {
  return { auto: fill, moto: fill, monster: fill, freestyle: fill }
}

const DEFAULT_META: ChampMeta = {
  podiumCarry: emptyBranchRecord(0),
  season2Unlocked: emptyBranchRecord(false),
}

function careerKey(branch: VehicleBranch, season: 1 | 2): string {
  return `${branch}:s${season}`
}

function kindsForChampionship(branch: VehicleBranch): VehicleKind[] {
  return kindsInBranch(branch).filter((k) => k !== 'scooter')
}

/**
 * 3 AI: nevybraný starter (pokud hráč vzal jeden z 2 nejpomalejších) + 2 z poolu.
 * Bez playerVehicle = náhodný mix (migrace / fallback).
 */
export function pickChampRivals(
  branch: VehicleBranch,
  playerVehicle?: VehicleKind,
): [VehicleKind, VehicleKind, VehicleKind] {
  const pool = [...kindsForChampionship(branch)]
  const starters = starterVehicles(branch)
  const unusedStarter =
    playerVehicle && starters.includes(playerVehicle)
      ? starters.find((k) => k !== playerVehicle)
      : undefined

  const rest = pool.filter((k) => k !== playerVehicle && k !== unusedStarter)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = rest[i]!
    rest[i] = rest[j]!
    rest[j] = tmp
  }

  const picked: VehicleKind[] = []
  if (unusedStarter) picked.push(unusedStarter)
  for (const k of rest) {
    if (picked.length >= 3) break
    if (!picked.includes(k)) picked.push(k)
  }
  while (picked.length < 3) {
    const fill = pool[picked.length % pool.length]!
    picked.push(fill)
  }
  return [picked[0]!, picked[1]!, picked[2]!]
}

function normalizeLeague(raw: unknown, legacyCup?: unknown): ChampLeague {
  if (raw === 'baby' || raw === 'small' || raw === 'grand') return raw
  // staré save: sprint → small, full → grand
  if (legacyCup === 'sprint') return 'small'
  if (legacyCup === 'full') return 'grand'
  if (legacyCup === 'baby' || legacyCup === 'small' || legacyCup === 'grand') {
    return legacyCup
  }
  return 'baby'
}

function normalizeTrackPool(raw: unknown, legacyCup?: unknown): ChampTrackPool {
  if (raw === 'half' || raw === 'all') return raw
  if (legacyCup === 'full' || legacyCup === 'grand') return 'all'
  return 'half'
}

function normalizeRivals(raw: unknown, branch: VehicleBranch): [VehicleKind, VehicleKind, VehicleKind] {
  const order = kindsForChampionship(branch)
  if (Array.isArray(raw) && raw.length >= 3) {
    const mapped = [0, 1, 2].map((i) => {
      const k = raw[i]
      return typeof k === 'string' && order.includes(k as VehicleKind)
        ? (k as VehicleKind)
        : order[i % order.length]!
    }) as [VehicleKind, VehicleKind, VehicleKind]
    if (new Set(mapped).size >= Math.min(3, order.length)) return mapped
  }
  return pickChampRivals(branch)
}

export function listUnlockOrder(branch: VehicleBranch): VehicleKind[] {
  const kinds = kindsForChampionship(branch)
  return [...kinds].sort(
    (a, b) => (CATALOG_MAX_KMH[a] ?? 0) - (CATALOG_MAX_KMH[b] ?? 0),
  )
}

/**
 * 1-based kolo, od kterého platí mid-cup cut (0 = nikdy).
 * Baby 1 → 0; Small 3 → 2 (po 1. závodě); Grand 9 → 5 (po 4. závodě).
 */
export function championshipRivalSpikeRound(totalRounds: number): number {
  if (totalRounds < 2) return 0
  return Math.ceil(totalRounds / 2)
}

/**
 * V půlce sezóny: nejpomalejší v poli (hráč + 3 AI).
 * Remíza rychlosti → raději AI než hráč.
 * AI → nahrazen apexem větve; hráč → konec sezóny + scooter útěcha.
 * Baby (1 kolo): bez půlky. Jen 1× (`midSpikeDone`).
 */
export function ensureChampRivalMidSpike(career: ChampCareer): ChampCareer {
  if (career.done || career.consolation || career.midSpikeDone) return career
  const total = championshipTotalRounds(career.league, career.trackPool)
  const half1 = championshipRivalSpikeRound(total)
  if (half1 <= 0 || career.round + 1 < half1) return career

  const pool = kindsForChampionship(career.branch)
  if (pool.length === 0) return career

  type Slot = { who: 'player' | number; kind: VehicleKind; spd: number }
  const field: Slot[] = [
    { who: 'player', kind: career.vehicle, spd: CATALOG_MAX_KMH[career.vehicle] ?? 0 },
    ...career.rivals.map((kind, i) => ({
      who: i as number,
      kind,
      spd: CATALOG_MAX_KMH[kind] ?? 0,
    })),
  ]
  const minSpd = Math.min(...field.map((s) => s.spd))
  const slowAi = field.find((s) => s.who !== 'player' && s.spd === minSpd)
  const slow = slowAi ?? field.find((s) => s.spd === minSpd)!

  if (slow.who === 'player') {
    career.done = true
    career.consolation = true
    career.midSpikeDone = true
    career.vehicle = 'scooter'
    if (!career.unlocked.includes('scooter')) career.unlocked.push('scooter')
    saveCareer(career)
    return career
  }

  // Apex = nejrychlejší ve větvi, který ještě není v poli (jinak ten samý nejrychlejší)
  const taken = new Set<VehicleKind>([career.vehicle, ...career.rivals])
  const bySpeed = [...pool].sort(
    (a, b) => (CATALOG_MAX_KMH[b] ?? 0) - (CATALOG_MAX_KMH[a] ?? 0),
  )
  const replacement = bySpeed.find((k) => !taken.has(k)) ?? bySpeed[0]!
  const slowIdx = slow.who as number
  const next: [VehicleKind, VehicleKind, VehicleKind] = [...career.rivals]
  next[slowIdx] = replacement
  career.rivals = next
  career.midSpikeDone = true
  saveCareer(career)
  return career
}

/**
 * 2 nejpomalejší ve větvi — startovní výběr na začátku sezóny (všechny kategorie).
 * Freestyle: skate + bike.
 */
export function starterVehicles(branch: VehicleBranch): VehicleKind[] {
  const order = listUnlockOrder(branch)
  if (branch === 'freestyle') {
    return order.filter((k) => k === 'skate' || k === 'bike')
  }
  return order.slice(0, Math.min(2, order.length))
}

/** Fallback startovní vůz = nejpomalejší ve větvi (FS: skate). */
export function defaultChampStarter(branch: VehicleBranch): VehicleKind {
  return starterVehicles(branch)[0] ?? listUnlockOrder(branch)[0]!
}

export function loadChampMeta(): ChampMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) return structuredClone(DEFAULT_META)
    const p = JSON.parse(raw) as Partial<ChampMeta>
    const meta: ChampMeta = structuredClone(DEFAULT_META)
    if (p.podiumCarry && typeof p.podiumCarry === 'object') {
      for (const b of BRANCHES) {
        const v = Number((p.podiumCarry as Record<string, number>)[b])
        if (Number.isFinite(v)) meta.podiumCarry[b] = Math.max(0, Math.round(v))
      }
    }
    if (p.season2Unlocked && typeof p.season2Unlocked === 'object') {
      for (const b of BRANCHES) {
        meta.season2Unlocked[b] = Boolean((p.season2Unlocked as Record<string, boolean>)[b])
      }
    }
    return meta
  } catch {
    return structuredClone(DEFAULT_META)
  }
}

export function saveChampMeta(meta: ChampMeta): void {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

type CareerMap = Record<string, ChampCareer>

function loadCareerMap(): CareerMap {
  try {
    const raw = localStorage.getItem(CAREERS_KEY)
    if (!raw) return {}
    const p = JSON.parse(raw) as CareerMap
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

function saveCareerMap(map: CareerMap): void {
  localStorage.setItem(CAREERS_KEY, JSON.stringify(map))
}

/** Smaž všechny šamp kariéry + meta (nákupy, výsledky, body, cash). */
export function wipeChampionshipSaves(): void {
  try {
    localStorage.removeItem(CAREERS_KEY)
    localStorage.removeItem(META_KEY)
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* ignore */
  }
}

/** Jednou po updatu: vyčisti starý šamp save, ať start je čistých 45k. */
export function maybeWipeChampionshipSavesOnce(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false
    if (localStorage.getItem(CHAMP_WIPE_KEY) === '1') return false
    wipeChampionshipSaves()
    localStorage.setItem(CHAMP_WIPE_KEY, '1')
    return true
  } catch {
    return false
  }
}

// Hned při načtení modulu (dev / po deployi) — starý moto save pryč.
maybeWipeChampionshipSavesOnce()

function normalizeCareer(raw: Partial<ChampCareer>, branch: VehicleBranch, season: 1 | 2): ChampCareer | null {
  if (!raw || raw.branch !== branch || raw.season !== season) return null
  const difficulty = (raw.difficulty ?? 'normal') as DifficultyId
  const starters = starterVehicles(branch)
  const order = listUnlockOrder(branch)
  let unlocked = Array.isArray(raw.unlocked)
    ? raw.unlocked.filter((k): k is VehicleKind => order.includes(k as VehicleKind))
    : [...starters]
  if (branch === 'freestyle') {
    unlocked = order.filter((k) => unlocked.includes(k))
  } else if (unlocked.length === 0 && starters[0]) {
    unlocked = [starters[0]]
  }
  const vehicle =
    raw.vehicle && unlocked.includes(raw.vehicle)
      ? raw.vehicle
      : unlocked[0] ?? starters[0] ?? order[0] ?? 'street'
  const legacyCup = (raw as { cup?: unknown }).cup
  const league = normalizeLeague((raw as { league?: unknown }).league, legacyCup)
  const trackPool = normalizeTrackPool((raw as { trackPool?: unknown }).trackPool, legacyCup)
  const rivals = normalizeRivals(raw.rivals, branch)
  const maxRound = championshipTotalRounds(league, trackPool)
  const round = typeof raw.round === 'number' ? Math.max(0, Math.min(maxRound, Math.round(raw.round))) : 0
  const results: ChampRoundResult[] = Array.isArray(raw.results)
    ? raw.results
        .filter((r) => r && typeof r.trackId === 'string')
        .map((r) => ({
          trackId: r.trackId,
          reverse: Boolean(r.reverse),
          place: typeof r.place === 'number' ? r.place : DNF_PLACE,
          pts: typeof r.pts === 'number' ? r.pts : 0,
          cashEarned: typeof r.cashEarned === 'number' ? r.cashEarned : 0,
          trickPts: typeof r.trickPts === 'number' ? r.trickPts : undefined,
        }))
    : []
  const points =
    typeof raw.points === 'number'
      ? raw.points
      : results.reduce((s, r) => s + r.pts, 0)
  const done = Boolean(raw.done) || round >= maxRound
  let cash = typeof raw.cash === 'number' ? Math.max(0, Math.round(raw.cash)) : 0
  let cashGrant45k = Boolean((raw as { cashGrant45k?: unknown }).cashGrant45k)
  // Jednorázový grant 45k (před nákupem). Po cashGrant45k už cash nesanovat nahoru.
  if (!done && !cashGrant45k && cash < CHAMP_START_CASH) {
    cash = CHAMP_START_CASH
    cashGrant45k = true
  }
  return {
    branch,
    season,
    difficulty,
    league,
    trackPool,
    rivals,
    round,
    done,
    vehicle,
    unlocked,
    cash: Math.max(0, Math.round(cash)),
    points,
    results,
    tuning: normalizeChampTuning(raw.tuning, {
      alreadyChampScale: (raw as { tuneScale?: unknown }).tuneScale === 5,
      freshSeason: round === 0 && results.length === 0,
    }),
    consolation: Boolean(raw.consolation),
    midSpikeDone: Boolean((raw as { midSpikeDone?: unknown }).midSpikeDone),
    tuneScale: 5,
    cashGrant45k,
    qualified: Boolean((raw as { qualified?: unknown }).qualified),
    leagueChosen: Boolean((raw as { leagueChosen?: unknown }).leagueChosen),
    seriesChosen: Boolean((raw as { seriesChosen?: unknown }).seriesChosen),
  }
}

export function getCareer(branch: VehicleBranch, season: 1 | 2): ChampCareer | null {
  const map = loadCareerMap()
  const key = careerKey(branch, season)
  const raw = map[key]
  if (!raw) return null
  const rawCash = typeof (raw as { cash?: unknown }).cash === 'number' ? Math.round((raw as { cash: number }).cash) : -1
  const career = normalizeCareer(raw, branch, season)
  if (!career) return null
  ensureChampStartCash(career)
  // Persist migraci (tuning / 45k).
  if (
    (raw as { tuneScale?: unknown }).tuneScale !== 5 ||
    (raw as { cashGrant45k?: unknown }).cashGrant45k !== true ||
    rawCash !== career.cash
  ) {
    saveCareer(career)
  }
  return ensureChampRivalMidSpike(career)
}

/** Jednorázový grant 45k — po započtení (nákup starteru) už cash nedoplňovat. */
export function ensureChampStartCash(career: ChampCareer): ChampCareer {
  if (career.done || career.cashGrant45k) return career
  if (career.cash < CHAMP_START_CASH) {
    career.cash = CHAMP_START_CASH
    career.cashGrant45k = true
    saveCareer(career)
  }
  return career
}

export function saveCareer(career: ChampCareer): void {
  const map = loadCareerMap()
  map[careerKey(career.branch, career.season)] = career
  saveCareerMap(map)
}

export function startNewSeason(
  branch: VehicleBranch,
  season: 1 | 2,
  difficulty: DifficultyId,
  starterVehicle: VehicleKind,
  league: ChampLeague = 'baby',
  trackPool: ChampTrackPool = 'half',
): ChampCareer {
  const meta = loadChampMeta()
  if (season === 2 && !meta.season2Unlocked[branch]) {
    throw new Error(`Season 2 locked for branch ${branch}`)
  }
  const order = listUnlockOrder(branch)
  const starters = starterVehicles(branch)
  if (!starters.includes(starterVehicle)) {
    throw new Error(`Starter must be one of: ${starters.join(', ')}`)
  }
  const starter = starterVehicle
  if (!order.includes(starter)) {
    throw new Error(`Invalid starter ${starter} for ${branch}`)
  }
  const carry = meta.podiumCarry[branch] ?? 0
  meta.podiumCarry[branch] = 0
  saveChampMeta(meta)

  const starterIdx = order.indexOf(starter)
  const price = vehicleBuyPrice(branch, Math.max(0, starterIdx), difficulty)
  if (price == null) {
    throw new Error(`No buy price for starter ${starter}`)
  }
  let cash = startCash(difficulty) + carry
  if (cash < price) {
    throw new Error(`Insufficient cash for starter ${starter}`)
  }
  cash -= price

  const career: ChampCareer = {
    branch,
    season,
    difficulty,
    league: normalizeLeague(league),
    trackPool: normalizeTrackPool(trackPool),
    rivals: pickChampRivals(branch, starter),
    round: 0,
    done: false,
    vehicle: starter,
    unlocked: [starter],
    cash,
    points: 0,
    results: [],
    tuning: { ...DEFAULT_CHAMP_TUNING },
    consolation: false,
    midSpikeDone: false,
    tuneScale: 5,
    cashGrant45k: true,
    qualified: false,
    leagueChosen: false,
    seriesChosen: false,
  }
  saveCareer(career)
  return career
}

export function championshipTrackId(career: ChampCareer): string | null
export function championshipTrackId(state?: ChampionshipState): string | null
export function championshipTrackId(
  arg?: ChampCareer | ChampionshipState,
): string | null {
  if (arg && 'branch' in arg) {
    const career = arg
    if (!career.qualified) return championshipQualTrackId(career.branch)
    const total = championshipTotalRounds(career.league, career.trackPool)
    if (career.done || career.round >= total) return null
    return championshipRoundMeta(career.round, career.league, career.trackPool)?.trackId ?? null
  }
  const state = arg ?? loadChampionship()
  return legacyTrackId(state)
}

export function championshipReverse(career: ChampCareer): boolean {
  if (!career.qualified) return false
  const total = championshipTotalRounds(career.league, career.trackPool)
  if (career.done || career.round >= total) return false
  return championshipRoundMeta(career.round, career.league, career.trackPool)?.reverse ?? false
}

export function championshipProgressLabel(career: ChampCareer): string
export function championshipProgressLabel(state?: ChampionshipState): string
export function championshipProgressLabel(
  arg?: ChampCareer | ChampionshipState,
): string {
  if (arg && 'branch' in arg) {
    if (!arg.qualified) return 'Q'
    const total = championshipTotalRounds(arg.league, arg.trackPool)
    if (arg.done) return `${total}/${total}`
    return `${Math.min(arg.round + 1, total)}/${total}`
  }
  const state = arg ?? loadChampionship()
  const total = CHAMPIONSHIP_TRACKS.length
  if (state.done) return `${total}/${total}`
  return `${Math.min(state.round + 1, total)}/${total}`
}

export function championshipAiSpeedFactor(
  roundIndex: number,
  season: 1 | 2 = 1,
  totalRounds = CHAMPIONSHIP_TOTAL_ROUNDS,
): number {
  const last = Math.max(1, totalRounds - 1)
  const r = Math.max(0, Math.min(last, roundIndex | 0))
  if (season === 2) return 0.7 + 0.3 * (r / last)
  return 0.6 + 0.4 * (r / last)
}

export function recordRoundFinish(
  career: ChampCareer,
  finish: { place: number; trickPts?: number },
): ChampCareer {
  if (career.done) return career

  // Kvalifikace: bez bodů / výhry, pořadí nevadí (FS = Plácek triky).
  if (!career.qualified) {
    career.results.push({
      trackId: championshipQualTrackId(career.branch),
      reverse: false,
      place: finish.place,
      pts: 0,
      cashEarned: 0,
      trickPts: career.branch === 'freestyle' ? (finish.trickPts ?? 0) : undefined,
    })
    career.qualified = true
    career.leagueChosen = false
    career.seriesChosen = false
    saveCareer(career)
    return career
  }

  const meta = championshipRoundMeta(career.round, career.league, career.trackPool)
  if (!meta) {
    career.done = true
    saveCareer(career)
    return career
  }
  const trickPts = finish.trickPts ?? 0
  const pts = roundPoints(career.branch, finish.place, trickPts)
  const cashEarned = placeCash(finish.place, career.difficulty)
  career.results.push({
    trackId: meta.trackId,
    reverse: meta.reverse,
    place: finish.place,
    pts,
    cashEarned,
    trickPts: career.branch === 'freestyle' ? trickPts : undefined,
  })
  career.points += pts
  career.cash += cashEarned
  career.round += 1
  if (career.round >= championshipTotalRounds(career.league, career.trackPool)) {
    career.done = true
    saveCareer(career)
    return career
  }
  saveCareer(career)
  return ensureChampRivalMidSpike(career)
}

/** Odstopit: postup kola jako poslední v poli (hráč + rivals). */
export function abandonRound(career: ChampCareer): ChampCareer {
  const lastPlace = Math.max(2, 1 + career.rivals.length)
  return recordRoundFinish(career, { place: lastPlace, trickPts: 0 })
}

export function canBuy(
  career: ChampCareer,
  kind: VehicleKind,
): { ok: boolean; price?: number; reason?: string } {
  if (vehicleBranch(kind) !== career.branch) {
    return { ok: false, reason: 'wrong_branch' }
  }
  if (career.unlocked.includes(kind)) {
    return { ok: false, reason: 'already_owned' }
  }
  const order = listUnlockOrder(career.branch)
  const nextIndex = order.findIndex((k) => !career.unlocked.includes(k))
  if (nextIndex < 0 || order[nextIndex] !== kind) {
    return { ok: false, reason: 'wrong_order' }
  }
  const price = vehicleBuyPrice(career.branch, nextIndex, career.difficulty)
  if (price == null) return { ok: false, reason: 'no_price' }
  if (career.cash < price) return { ok: false, price, reason: 'insufficient_cash' }
  return { ok: true, price }
}

export function buyVehicle(career: ChampCareer, kind: VehicleKind): ChampCareer {
  const check = canBuy(career, kind)
  if (!check.ok || check.price == null) return career
  career.cash -= check.price
  career.unlocked.push(kind)
  career.vehicle = kind
  saveCareer(career)
  return career
}

export function applyTuningUpgrade(
  career: ChampCareer,
  key: keyof PlayerTuningValues,
  targetLevel: number,
): ChampCareer {
  const next = Math.round(targetLevel)
  const from = career.tuning[key]
  if (next <= from || next > CHAMP_TUNING_MAX) return career
  const cost = tuningUpgradeCost(next, career.difficulty, from, career.vehicle, career.branch)
  if (career.cash < cost) return career
  // Bez solo rozpočtu — šamp 0–5 je volný per-stat.
  career.tuning = { ...career.tuning, [key]: next }
  career.cash -= cost
  saveCareer(career)
  return career
}

export function seasonPodiumRank(career: ChampCareer): SeasonPodiumTier {
  return seasonPodiumTier({
    ...career,
    totalRounds: championshipTotalRounds(career.league, career.trackPool),
  })
}

export type SeasonCompleteInfo = {
  tier: SeasonPodiumTier
  purse: number
  cashCarry: number
  unlockedSeason2: boolean
}

export function completeSeasonAndPrepareNext(career: ChampCareer): SeasonCompleteInfo {
  if (!career.done) {
    career.done = true
    saveCareer(career)
  }
  const meta = loadChampMeta()
  // Útěcha (scooter): bez poháru / purse / S2 unlock
  if (career.consolation) {
    return { tier: 4, purse: 0, cashCarry: 0, unlockedSeason2: false }
  }
  const tier = seasonPodiumRank(career)
  const purse = seasonPodiumPurse(tier, career.difficulty)
  const carryExtra = cashCarryFraction(career.cash)
  meta.podiumCarry[career.branch] = (meta.podiumCarry[career.branch] ?? 0) + purse + carryExtra
  let unlockedSeason2 = false
  if (career.season === 1) {
    meta.season2Unlocked[career.branch] = true
    unlockedSeason2 = true
  }
  saveChampMeta(meta)
  return { tier, purse, cashCarry: carryExtra, unlockedSeason2 }
}

// —— Legacy (Game.ts — 9 kol, bez reverse) ——

export type ChampionshipState = {
  round: number
  results: Array<{ trackId: string; place: number; pts: number }>
  points: number
  done: boolean
}

export const DEFAULT_CHAMPIONSHIP: ChampionshipState = {
  round: 0,
  results: [],
  points: 0,
  done: false,
}

export function loadChampionship(): ChampionshipState {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return { ...DEFAULT_CHAMPIONSHIP, results: [] }
    const p = JSON.parse(raw) as Partial<ChampionshipState>
    const len = CHAMPIONSHIP_TRACKS.length
    return {
      round: typeof p.round === 'number' ? Math.max(0, Math.min(len, p.round)) : 0,
      results: Array.isArray(p.results) ? p.results : [],
      points: typeof p.points === 'number' ? p.points : 0,
      done: Boolean(p.done),
    }
  } catch {
    return { ...DEFAULT_CHAMPIONSHIP, results: [] }
  }
}

export function saveChampionship(state: ChampionshipState): void {
  localStorage.setItem(LEGACY_KEY, JSON.stringify(state))
}

export function resetChampionship(): ChampionshipState {
  const s = { ...DEFAULT_CHAMPIONSHIP, results: [] as ChampionshipState['results'] }
  saveChampionship(s)
  return s
}

function legacyTrackId(state: ChampionshipState): string | null {
  if (state.done || state.round >= CHAMPIONSHIP_TRACKS.length) return null
  return CHAMPIONSHIP_TRACKS[state.round] ?? null
}

export function recordChampionshipPlace(place: number): ChampionshipState {
  const state = loadChampionship()
  if (state.done) return state
  const trackId = CHAMPIONSHIP_TRACKS[state.round]
  if (!trackId) {
    state.done = true
    saveChampionship(state)
    return state
  }
  const pts = isDnfPlace(place) ? 0 : placePoints(place)
  state.results.push({ trackId, place, pts })
  state.points += pts
  state.round += 1
  if (state.round >= CHAMPIONSHIP_TRACKS.length) state.done = true
  saveChampionship(state)
  return state
}
