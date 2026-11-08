import type { Vehicle } from '../vehicle/Vehicle'
import type { VehicleKind } from '../track/TrackDefs'
import {
  loadAudioSettings,
  saveAudioSettings,
  type AudioSettingsValues,
  type MusicId,
} from './AudioSettings'

type SampleBank = {
  idle: AudioBuffer
  mid: AudioBuffer
  high: AudioBuffer
  top: AudioBuffer
  heavy: AudioBuffer
  bass: AudioBuffer | null
  start: AudioBuffer | null
}

type Voice = {
  /** Crossfade layers: low / mid / high RPM sample loops */
  srcLow: AudioBufferSourceNode
  srcMid: AudioBufferSourceNode
  srcHigh: AudioBufferSourceNode
  gLow: GainNode
  gMid: GainNode
  gHigh: GainNode
  filter: BiquadFilterNode
  bassShelf: BiquadFilterNode
  /** Extra bass rumble loop */
  srcBass: AudioBufferSourceNode | null
  gBass: GainNode
  /** Procedural sub + grit */
  sub: OscillatorNode
  subGain: GainNode
  noise: AudioBufferSourceNode
  rumble: BiquadFilterNode
  noiseGain: GainNode
  overGain: GainNode
  gain: GainNode
  panner: StereoPannerNode
  rateBase: number
  useHeavy: boolean
}

type KindSample = {
  rate: number
  heavy: boolean
  noise: number
  cutoff: number
  amp: number
}

type MusicBed = {
  gain: GainNode
  setStyle: (id: MusicId) => void
  setPlaying: (on: boolean) => void
}

type BeatStyle = {
  stepSec: number
  kickGain: number
  snareGain: number
  padMul: number
}

/** Mapování vozidla → pitch / heavy loop / šum */
const KIND_SAMPLE: Record<VehicleKind, KindSample> = {
  moto: { rate: 1.45, heavy: false, noise: 0.22, cutoff: 3400, amp: 1.05 },
  formula: { rate: 1.35, heavy: false, noise: 0.14, cutoff: 3800, amp: 1.0 },
  monster: { rate: 0.72, heavy: true, noise: 0.28, cutoff: 720, amp: 1.15 },
  street: { rate: 1.0, heavy: false, noise: 0.06, cutoff: 2200, amp: 0.95 },
  skate: { rate: 0.55, heavy: false, noise: 0.42, cutoff: 1600, amp: 0.55 },
  bike: { rate: 0.7, heavy: false, noise: 0.32, cutoff: 1800, amp: 0.6 },
  truck: { rate: 0.68, heavy: true, noise: 0.3, cutoff: 600, amp: 1.1 },
  tank: { rate: 0.55, heavy: true, noise: 0.36, cutoff: 480, amp: 1.12 },
  limo: { rate: 0.92, heavy: false, noise: 0.05, cutoff: 1800, amp: 0.9 },
  scooter: { rate: 1.55, heavy: false, noise: 0.12, cutoff: 2800, amp: 0.75 },
}

const SAMPLE_URLS = {
  idle: '/audio/engines/car-idle.wav',
  mid: '/audio/engines/car-mid.wav',
  high: '/audio/engines/car-high.wav',
  top: '/audio/engines/car-top.wav',
  heavy: '/audio/engines/heavy.wav',
  bass: '/audio/engines/bass-rumble.ogg',
  start: '/audio/engines/car-start.wav',
} as const

/** Amp player engines — výrazně slyšitelnější než dřív */
const ENGINE_VOICE_CAP = 1.35
const SFX_BUS_MUL = 0.55

/**
 * Reálné WAV smyčky motorů (OpenGameArt CC0 / CC-BY) + jemný šum.
 * Hudba zůstává procedurální.
 */
export class EngineAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private sfxBus: GainNode | null = null
  private voices: Voice[] = []
  private unlocked = false
  private active = false
  private lastSpeeds: number[] = []
  private musicWanted = false
  private bed: MusicBed | null = null
  private settings: AudioSettingsValues = loadAudioSettings()
  private bank: SampleBank | null = null
  private bankLoading: Promise<SampleBank | null> | null = null
  private startPlayed = false

  getSettings(): AudioSettingsValues {
    return { ...this.settings }
  }

  applySettings(partial: Partial<AudioSettingsValues>): void {
    this.settings = {
      ...this.settings,
      ...partial,
      master: clamp(partial.master ?? this.settings.master),
      music: clamp(partial.music ?? this.settings.music),
      sfx: clamp(partial.sfx ?? this.settings.sfx),
      track: partial.track ?? this.settings.track,
      muted: partial.muted ?? this.settings.muted,
    }
    saveAudioSettings(this.settings)
    this.pushLevels()
    if (this.bed) this.bed.setStyle(this.settings.track)
  }

  unlock(): void {
    if (this.unlocked) {
      void this.ctx?.resume()
      if (this.musicWanted) this.setMusic(true)
      return
    }
    this.unlocked = true
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    this.ctx = new Ctx()
    this.master = this.ctx.createGain()
    this.master.connect(this.ctx.destination)
    this.musicBus = this.ctx.createGain()
    this.sfxBus = this.ctx.createGain()
    this.musicBus.connect(this.master)
    this.sfxBus.connect(this.master)
    this.ensureMusicBed()
    this.pushLevels()
    void this.ctx.resume()
    void this.ensureBank()
    if (this.musicWanted) this.setMusic(true)
  }

  setActive(on: boolean): void {
    this.active = on
    if (!on) {
      this.silenceEngines()
      this.startPlayed = false
    }
  }

  /** Hudba na pozadí (menu / závod). Úvod ji nemá zapnutou. */
  setMusic(on: boolean): void {
    this.musicWanted = on
    if (!this.unlocked || !this.ctx) return
    this.ensureMusicBed()
    const now = this.ctx.currentTime
    this.bed?.gain.gain.setTargetAtTime(on ? 1 : 0, now, 0.2)
    this.bed?.setPlaying(on)
  }

  update(vehicles: Vehicle[], player: Vehicle, racing: boolean): void {
    if (!this.unlocked || !this.ctx || !this.sfxBus) return
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    if (!this.active) {
      this.silenceEngines()
      return
    }
    void this.ensureBank()
    if (!this.bank) return
    this.ensureVoices(vehicles.length)

    const now = this.ctx.currentTime
    const sfxMul = this.settings.sfx / 100

    if (racing && !this.startPlayed) {
      this.startPlayed = true
      this.playStart()
    }

    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i]
      const voice = this.voices[i]
      if (!voice) continue

      const kind = KIND_SAMPLE[v.kind] ?? KIND_SAMPLE.street
      this.applyHeavyBuffers(voice, kind.heavy, this.bank)
      const speed = Math.abs(v.physics.speed)
      const kmh = v.physics.speedKmh
      const gear = Math.max(1, Math.abs(v.physics.gear))
      const ideal = Math.max(1, Math.min(7, 1 + Math.floor(speed / 28)))
      const inGear = speed / (18 + gear * 24)
      // 0 idle … 1 redline v převodu
      const rpm = Math.min(1.15, Math.max(0.06, inGear))
      const overrev = Math.max(0, rpm - 0.92) / 0.23
      const mismatch = v.physics.manualShift ? Math.abs(gear - ideal) : 0
      const accel = Math.max(0, speed - (this.lastSpeeds[i] ?? speed))
      this.lastSpeeds[i] = speed

      const idle = racing ? 0.38 : 0.18
      let amp = (idle + rpm * 0.85 + Math.min(0.28, accel * 5) + overrev * 0.35) * kind.amp
      if (!racing) amp *= 0.5
      if (v.finished) amp *= 0.25

      if (!v.info.isPlayer) {
        const dx = v.physics.x - player.physics.x
        const dz = v.physics.z - player.physics.z
        const dist = Math.hypot(dx, dz)
        amp *= 0.38 / (1 + dist / 38)
        const pan = Math.max(-0.85, Math.min(0.85, dx * 0.04))
        voice.panner.pan.setTargetAtTime(pan, now, 0.05)
      } else {
        voice.panner.pan.setTargetAtTime(0, now, 0.05)
        amp += Math.min(0.22, kmh / 700)
      }

      // Ostřejší pásma: bas idle · střed · výšky · přežhavení
      const low = Math.max(0, 1 - rpm * 1.85)
      const mid = Math.max(0, 1 - Math.abs(rpm - 0.42) * 2.8)
      const high = Math.max(0, (rpm - 0.28) * 1.9 - overrev * 0.4)
      const scream = overrev * 1.1 + (mismatch >= 2 ? 0.35 : mismatch === 1 ? 0.12 : 0)
      const sum = low + mid + high || 1
      voice.gLow.gain.setTargetAtTime((low / sum) * (1 - scream * 0.25), now, 0.05)
      voice.gMid.gain.setTargetAtTime((mid / sum) * (1 - scream * 0.15), now, 0.05)
      voice.gHigh.gain.setTargetAtTime(high / sum + scream * 0.55, now, 0.05)
      voice.overGain.gain.setTargetAtTime(scream * 0.55 * kind.amp, now, 0.04)

      const rate =
        kind.rate *
        (0.72 + Math.min(1, rpm) * 1.15 + Math.min(0.18, accel * 3) + overrev * 0.28) *
        (1 + (v.kind === 'monster' ? v.turboAmount * 0.35 : 0))
      voice.srcLow.playbackRate.setTargetAtTime(rate * 0.88, now, 0.04)
      voice.srcMid.playbackRate.setTargetAtTime(rate, now, 0.04)
      voice.srcHigh.playbackRate.setTargetAtTime(rate * (1.05 + overrev * 0.2), now, 0.04)
      if (voice.srcBass) {
        voice.srcBass.playbackRate.setTargetAtTime(0.55 + rpm * 0.55, now, 0.06)
      }
      // Bass: silný na idle/nízké otáčky, slábne nahoře
      const bassAmt = (0.55 + low * 0.7 + mid * 0.25) * (kind.heavy ? 1.15 : 0.95)
      voice.gBass.gain.setTargetAtTime(bassAmt * 0.7, now, 0.06)
      voice.bassShelf.gain.setTargetAtTime(6 + low * 5 + (kind.heavy ? 3 : 0), now, 0.08)
      voice.sub.frequency.setTargetAtTime(38 + rpm * 55 + overrev * 40, now, 0.05)
      voice.subGain.gain.setTargetAtTime((0.14 + low * 0.18 + mid * 0.06) * kind.amp, now, 0.06)

      const turboWhistle =
        v.kind === 'monster'
          ? v.turboAmount * 0.9
          : v.kind === 'formula'
            ? rpm * 0.14
            : v.kind === 'moto'
              ? rpm * 0.1
              : overrev * 0.2
      voice.noiseGain.gain.setTargetAtTime(kind.noise + turboWhistle + scream * 0.35, now, 0.05)
      const cutoffBoost = v.kind === 'monster' ? 1 + v.turboAmount * 1.8 : 1
      voice.filter.frequency.setTargetAtTime(
        kind.cutoff * (0.35 + Math.min(1, rpm) * 1.05 + overrev * 0.45) * cutoffBoost,
        now,
        0.05,
      )
      if (v.kind === 'monster' && v.turboAmount > 0.12) {
        amp += v.turboAmount * 0.4
      }
      voice.gain.gain.setTargetAtTime(Math.min(ENGINE_VOICE_CAP, amp * sfxMul), now, 0.05)
    }
  }

  private pushLevels(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return
    const now = this.ctx.currentTime
    const master = this.settings.muted ? 0 : this.settings.master / 100
    this.master.gain.setTargetAtTime(master, now, 0.05)
    this.musicBus.gain.setTargetAtTime((this.settings.music / 100) * 0.32, now, 0.08)
    this.sfxBus.gain.setTargetAtTime(SFX_BUS_MUL * (this.settings.sfx / 100), now, 0.05)
  }

  private async ensureBank(): Promise<SampleBank | null> {
    if (this.bank) return this.bank
    if (this.bankLoading) return this.bankLoading
    if (!this.ctx) return null
    const ctx = this.ctx
    this.bankLoading = (async () => {
      try {
        const decode = async (url: string): Promise<AudioBuffer> => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`fetch ${url}`)
          const ab = await res.arrayBuffer()
          return await ctx.decodeAudioData(ab.slice(0))
        }
        const [idle, mid, high, top, heavy] = await Promise.all([
          decode(SAMPLE_URLS.idle),
          decode(SAMPLE_URLS.mid),
          decode(SAMPLE_URLS.high),
          decode(SAMPLE_URLS.top),
          decode(SAMPLE_URLS.heavy),
        ])
        let start: AudioBuffer | null = null
        let bass: AudioBuffer | null = null
        try {
          start = await decode(SAMPLE_URLS.start)
        } catch {
          start = null
        }
        try {
          bass = await decode(SAMPLE_URLS.bass)
        } catch {
          bass = heavy
        }
        this.bank = { idle, mid, high, top, heavy, bass, start }
        return this.bank
      } catch {
        this.bank = null
        return null
      } finally {
        this.bankLoading = null
      }
    })()
    return this.bankLoading
  }

  private playStart(): void {
    if (!this.ctx || !this.sfxBus || !this.bank?.start) return
    const src = this.ctx.createBufferSource()
    src.buffer = this.bank.start
    const g = this.ctx.createGain()
    g.gain.value = 0.7 * (this.settings.sfx / 100)
    src.connect(g)
    g.connect(this.sfxBus)
    src.start()
  }

  private ensureVoices(n: number): void {
    const ctx = this.ctx
    const bus = this.sfxBus
    const bank = this.bank
    if (!ctx || !bus || !bank) return
    while (this.voices.length < n) {
      const i = this.voices.length
      this.voices.push(this.makeVoice(ctx, bus, bank, i))
    }
  }

  private makeVoice(ctx: AudioContext, bus: GainNode, bank: SampleBank, index: number): Voice {
    const makeLoop = (buf: AudioBuffer, rate: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.playbackRate.value = rate
      return src
    }

    const useHeavy = false
    const srcLow = makeLoop(bank.idle, 1)
    const srcMid = makeLoop(bank.mid, 1)
    const srcHigh = makeLoop(bank.high, 1)

    const gLow = ctx.createGain()
    const gMid = ctx.createGain()
    const gHigh = ctx.createGain()
    gLow.gain.value = 1
    gMid.gain.value = 0
    gHigh.gain.value = 0

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 2200
    filter.Q.value = 0.85

    const bassShelf = ctx.createBiquadFilter()
    bassShelf.type = 'lowshelf'
    bassShelf.frequency.value = 180
    bassShelf.gain.value = 8

    const mix = ctx.createGain()
    mix.gain.value = 1

    const gain = ctx.createGain()
    gain.gain.value = 0
    const panner = ctx.createStereoPanner()
    panner.pan.value = 0

    const gBass = ctx.createGain()
    gBass.gain.value = 0.5
    let srcBass: AudioBufferSourceNode | null = null
    if (bank.bass) {
      srcBass = makeLoop(bank.bass, 0.7)
      srcBass.connect(gBass)
      gBass.connect(bassShelf)
    }

    srcLow.connect(gLow)
    srcMid.connect(gMid)
    srcHigh.connect(gHigh)
    gLow.connect(filter)
    gMid.connect(filter)
    gHigh.connect(filter)
    filter.connect(bassShelf)
    bassShelf.connect(mix)
    mix.connect(gain)

    const overGain = ctx.createGain()
    overGain.gain.value = 0
    // Přežhavení: top smyčka jde přes overGain (stejný high src už stačí — boost přes noise/sub)
    const sub = ctx.createOscillator()
    sub.type = 'sine'
    sub.frequency.value = 45
    const subGain = ctx.createGain()
    subGain.gain.value = 0.12
    sub.connect(subGain)
    subGain.connect(gain)

    const rumble = ctx.createBiquadFilter()
    rumble.type = 'lowpass'
    rumble.frequency.value = 220
    rumble.Q.value = 0.7
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0.08
    const noise = ctx.createBufferSource()
    noise.buffer = this.noiseBuffer(ctx)
    noise.loop = true
    noise.connect(rumble)
    rumble.connect(noiseGain)
    noiseGain.connect(overGain)
    overGain.connect(gain)

    gain.connect(panner)
    panner.connect(bus)

    const off = (index % 7) * 0.07
    srcLow.start(0, off)
    srcMid.start(0, off * 1.3)
    srcHigh.start(0, off * 0.6)
    srcBass?.start(0, off * 0.4)
    sub.start()
    noise.start()

    return {
      srcLow,
      srcMid,
      srcHigh,
      gLow,
      gMid,
      gHigh,
      filter,
      bassShelf,
      srcBass,
      gBass,
      sub,
      subGain,
      noise,
      rumble,
      noiseGain,
      overGain,
      gain,
      panner,
      rateBase: 1,
      useHeavy,
    }
  }

  /** Po vytvoření hlasů přepnout heavy banku podle kind — voláno při update přes rate; buffer swap jednorázově */
  private applyHeavyBuffers(voice: Voice, heavy: boolean, bank: SampleBank): void {
    if (voice.useHeavy === heavy) return
    // Nelze bezpečně vyměnit buffer u běžícího source — restart layers
    // Pro jednoduchost: heavy vozidla už mají rate < 1; heavy buffer nastavíme při make podle indexu nelze.
    // Místo swapu: při ensureVoices nevíme kind. Přemapujeme přes playbackRate + lowpass.
    // Heavy buffer: vytvořit nové source jen když se kind změní — stop staré.
    voice.useHeavy = heavy
    const ctx = this.ctx
    const bus = this.sfxBus
    if (!ctx || !bus) return
    try {
      voice.srcLow.stop()
      voice.srcMid.stop()
      voice.srcHigh.stop()
    } catch {
      /* already stopped */
    }
    const mk = (buf: AudioBuffer) => {
      const s = ctx.createBufferSource()
      s.buffer = buf
      s.loop = true
      return s
    }
    const lowBuf = heavy ? bank.heavy : bank.idle
    const midBuf = heavy ? bank.heavy : bank.mid
    const highBuf = heavy ? bank.top : bank.high
    voice.srcLow = mk(lowBuf)
    voice.srcMid = mk(midBuf)
    voice.srcHigh = mk(highBuf)
    voice.srcLow.connect(voice.gLow)
    voice.srcMid.connect(voice.gMid)
    voice.srcHigh.connect(voice.gHigh)
    voice.srcLow.start()
    voice.srcMid.start()
    voice.srcHigh.start()
  }

  private ensureMusicBed(): void {
    if (this.bed || !this.ctx || !this.musicBus) return
    const ctx = this.ctx
    const out = ctx.createGain()
    out.gain.value = 0

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 600
    filter.Q.value = 0.6
    const a = ctx.createOscillator()
    const b = ctx.createOscillator()
    a.type = 'sine'
    b.type = 'triangle'
    a.frequency.value = 55
    b.frequency.value = 82.4
    const aG = ctx.createGain()
    aG.gain.value = 0.18
    const bG = ctx.createGain()
    bG.gain.value = 0.1
    a.connect(aG)
    b.connect(bG)
    aG.connect(filter)
    bG.connect(filter)
    filter.connect(out)
    out.connect(this.musicBus)
    a.start()
    b.start()

    const noiseBuf = this.noiseBuffer(ctx)
    let style: BeatStyle = { stepSec: 0.22, kickGain: 0.9, snareGain: 0.55, padMul: 1 }
    let playing = false
    let step = 0
    let nextTime = 0
    let timer: number | null = null

    const hitKick = (when: number, amp: number, deep = false) => {
      const osc = ctx.createOscillator()
      const click = ctx.createOscillator()
      const g = ctx.createGain()
      const cG = ctx.createGain()
      osc.type = 'sine'
      click.type = 'square'
      const startF = deep ? 130 : 165
      const endF = deep ? 36 : 48
      osc.frequency.setValueAtTime(startF, when)
      osc.frequency.exponentialRampToValueAtTime(endF, when + 0.14)
      click.frequency.setValueAtTime(900, when)
      g.gain.setValueAtTime(0.0001, when)
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), when + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2)
      cG.gain.setValueAtTime(0.0001, when)
      cG.gain.exponentialRampToValueAtTime(Math.max(0.001, amp * 0.12), when + 0.003)
      cG.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
      osc.connect(g)
      click.connect(cG)
      g.connect(out)
      cG.connect(out)
      osc.start(when)
      click.start(when)
      osc.stop(when + 0.22)
      click.stop(when + 0.04)
    }

    const hitSnare = (when: number, amp: number) => {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      const hp = ctx.createBiquadFilter()
      hp.type = 'bandpass'
      hp.frequency.value = 1800
      hp.Q.value = 0.8
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, when)
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), when + 0.004)
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.12)
      src.connect(hp)
      hp.connect(g)
      g.connect(out)
      src.start(when)
      src.stop(when + 0.14)
    }

    const hitHat = (when: number, amp: number, open = false) => {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = open ? 7000 : 9000
      const g = ctx.createGain()
      const dur = open ? 0.12 : 0.035
      g.gain.setValueAtTime(0.0001, when)
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, amp), when + 0.002)
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur)
      src.connect(hp)
      hp.connect(g)
      g.connect(out)
      src.start(when)
      src.stop(when + dur + 0.02)
    }

    const schedule = () => {
      if (!playing) return
      const now = ctx.currentTime
      while (nextTime < now + 0.2) {
        const slot = step % 8
        const k = style.kickGain
        const s = style.snareGain
        if (slot === 0) hitKick(nextTime, k, true)
        else if (slot === 1) {
          hitKick(nextTime, k * 0.85)
          hitHat(nextTime + style.stepSec * 0.5, s * 0.25)
        } else if (slot === 2) hitHat(nextTime, s * 0.4)
        else if (slot === 3) {
          hitSnare(nextTime, s)
          hitHat(nextTime, s * 0.2)
        } else if (slot === 4) hitKick(nextTime, k * 0.45, true)
        else if (slot === 5) hitHat(nextTime, s * 0.55, true)
        else if (slot === 6) {
          hitSnare(nextTime, s * 0.95)
          hitHat(nextTime + style.stepSec * 0.48, s * 0.3)
        } else hitHat(nextTime, s * 0.35)
        step += 1
        nextTime += style.stepSec
      }
      timer = window.setTimeout(schedule, 35)
    }

    const setPlaying = (on: boolean) => {
      playing = on
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      if (on) {
        step = 0
        nextTime = ctx.currentTime + 0.05
        schedule()
      }
    }

    const setStyle = (id: MusicId) => {
      const t = ctx.currentTime
      if (id === 'techno') {
        style = { stepSec: 0.14, kickGain: 0.9, snareGain: 0.48, padMul: 1 }
        a.frequency.setTargetAtTime(55, t, 0.15)
        b.frequency.setTargetAtTime(110, t, 0.15)
        aG.gain.setTargetAtTime(0.16 * style.padMul, t, 0.15)
        bG.gain.setTargetAtTime(0.12 * style.padMul, t, 0.15)
        filter.frequency.setTargetAtTime(900, t, 0.2)
      } else if (id === 'rap') {
        style = { stepSec: 0.17, kickGain: 1.0, snareGain: 0.68, padMul: 0.85 }
        a.frequency.setTargetAtTime(41, t, 0.15)
        b.frequency.setTargetAtTime(82, t, 0.15)
        aG.gain.setTargetAtTime(0.22 * style.padMul, t, 0.15)
        bG.gain.setTargetAtTime(0.08 * style.padMul, t, 0.15)
        filter.frequency.setTargetAtTime(420, t, 0.2)
      } else {
        style = { stepSec: 0.22, kickGain: 0.32, snareGain: 0.2, padMul: 1.3 }
        a.frequency.setTargetAtTime(130.8, t, 0.25)
        b.frequency.setTargetAtTime(196, t, 0.25)
        aG.gain.setTargetAtTime(0.2 * style.padMul, t, 0.2)
        bG.gain.setTargetAtTime(0.16 * style.padMul, t, 0.2)
        filter.frequency.setTargetAtTime(1800, t, 0.25)
      }
    }

    setStyle(this.settings.track)
    this.bed = { gain: out, setStyle, setPlaying }
    if (this.musicWanted) setPlaying(true)
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  private silenceEngines(): void {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    for (const v of this.voices) {
      v.gain.gain.setTargetAtTime(0, now, 0.08)
    }
  }
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}
