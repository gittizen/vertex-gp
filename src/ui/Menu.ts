import { DIFFICULTIES, type DifficultyId } from '../ai/Difficulty'
import { TRACKS, type TrackDef } from '../track/TrackDefs'
import {
  DEFAULT_PLAYER_TUNING,
  TUNING_BUDGET,
  setTuningStat,
  tuningHint,
  tuningSum,
  type PlayerTuningValues,
} from '../tuning/PlayerTuning'
import type { NetRoom } from '../net/protocol'
import { roomFromUrl } from '../net/NetClient'

export type MenuStartPayload = {
  mode: 'solo' | 'host' | 'join'
  trackId: string
  tuning: PlayerTuningValues
  name: string
  difficulty: DifficultyId
  roomCode?: string
  /** Veřejná WS adresa pro kamarády na jiném internetu (wss://…) */
  publicWsUrl?: string
}

export class Menu {
  private readonly root: HTMLElement
  private selectedTrackId = TRACKS[0].id
  private selectedDifficulty: DifficultyId = 'normal'
  private tuning: PlayerTuningValues = { ...DEFAULT_PLAYER_TUNING }
  private playerName = 'Filip'
  private publicWsUrl = ''
  private joinCode = roomFromUrl() || ''
  private tab: 'solo' | 'online' = roomFromUrl() ? 'online' : 'solo'
  private onStart: ((payload: MenuStartPayload) => void) | null = null
  private lobby: NetRoom | null = null
  private lobbyLink = ''
  private lobbyError = ''
  private isHost = false
  private onHostStart: (() => void) | null = null
  private onLeaveLobby: (() => void) | null = null
  visible = false

  constructor(root: HTMLElement) {
    this.root = root
  }

  setOnStart(cb: (payload: MenuStartPayload) => void): void {
    this.onStart = cb
  }

  setOnHostStart(cb: () => void): void {
    this.onHostStart = cb
  }

  setOnLeaveLobby(cb: () => void): void {
    this.onLeaveLobby = cb
  }

  setLobby(room: NetRoom | null, link: string, isHost: boolean, error = ''): void {
    this.lobby = room
    this.lobbyLink = link
    this.isHost = isHost
    this.lobbyError = error
    if (this.visible) this.render()
  }

  show(): void {
    this.visible = true
    this.root.classList.add('menu-visible')
    this.render()
  }

  hide(): void {
    this.visible = false
    this.root.classList.remove('menu-visible')
    this.root.innerHTML = ''
  }

  private render(): void {
    if (this.lobby) {
      this.renderLobby()
      return
    }

    const tracksHtml = TRACKS.map((t) => this.trackCard(t)).join('')
    const used = tuningSum(this.tuning)
    this.root.innerHTML = `
      <div class="menu-shell">
        <header class="menu-header">
          <p class="menu-eyebrow">Vertex GP</p>
          <h1>Výběr závodu</h1>
          <p class="menu-sub">Město · Monza · Led (rallye) — solo / online 2–4 hráči</p>
        </header>

        <div class="mode-tabs">
          <button type="button" class="mode-tab ${this.tab === 'solo' ? 'active' : ''}" data-tab="solo">Solo + AI</button>
          <button type="button" class="mode-tab ${this.tab === 'online' ? 'active' : ''}" data-tab="online">Online multiplayer</button>
        </div>

        <section class="menu-section">
          <h2>Jméno</h2>
          <input class="text-input" id="player-name" maxlength="18" value="${this.escape(this.playerName)}" />
        </section>

        <section class="menu-section">
          <h2>Trať</h2>
          <div class="track-grid">${tracksHtml}</div>
        </section>

        <section class="menu-section">
          <h2>Obtížnost AI</h2>
          <div class="track-grid">
            ${DIFFICULTIES.map((d) => {
              const active = d.id === this.selectedDifficulty ? 'active' : ''
              return `<button type="button" class="track-card ${active}" data-diff="${d.id}">
                <strong>${d.label}</strong>
                <span>${d.blurb}</span>
              </button>`
            }).join('')}
          </div>
        </section>

        <section class="menu-section">
          <h2>Tuning <span class="budget-pill">${used} / ${TUNING_BUDGET} bodů</span></h2>
          <p class="tune-rules">Rozpočet 100 bodů — na max jen jedna věc (ostatní na 0), nebo rovnoměrně.</p>
          <div class="tune-grid">
            ${this.slider('power', 'Výkon', this.tuning.power)}
            ${this.slider('brakes', 'Brzdy', this.tuning.brakes)}
            ${this.slider('downforce', 'Přítlak', this.tuning.downforce)}
            ${this.slider('grip', 'Pneumatiky / grip', this.tuning.grip)}
          </div>
          <p class="tune-hint" id="tune-hint">${tuningHint(this.tuning)}</p>
        </section>

        ${this.tab === 'online' ? this.onlineBlock() : ''}

        <div class="menu-actions">
          ${
            this.tab === 'solo'
              ? `<button type="button" class="menu-start" id="btn-solo">Start solo</button>`
              : `
                <button type="button" class="menu-start" id="btn-host">Vytvořit místnost</button>
                <button type="button" class="btn-ghost" id="btn-join">Připojit se</button>
              `
          }
        </div>
        ${this.lobbyError ? `<p class="menu-error">${this.escape(this.lobbyError)}</p>` : ''}
      </div>
    `
    this.bindCommon()
  }

  private onlineBlock(): string {
    return `
      <section class="menu-section">
        <h2>Internetové připojení</h2>
        <p class="tune-rules">
          Kamarádi jsou na jiném internetu — host musí mít <strong>veřejnou WSS adresu</strong>
          (např. Cloudflare Tunnel / ngrok na port 8787). Bez toho funguje jen stejná Wi‑Fi / localhost.
        </p>
        <label class="tune-row">
          <span class="tune-label">Veřejná WS adresa hostitele</span>
          <input class="text-input" id="public-ws" placeholder="wss://xxxx.trycloudflare.com" value="${this.escape(this.publicWsUrl)}" />
        </label>
        <label class="tune-row" style="margin-top:10px">
          <span class="tune-label">Kód místnosti (při připojení)</span>
          <input class="text-input" id="join-code" maxlength="8" placeholder="např. A1B2" value="${this.escape(this.joinCode)}" />
        </label>
      </section>
    `
  }

  private renderLobby(): void {
    const room = this.lobby!
    const players = room.players
      .map(
        (p) =>
          `<li>${this.escape(p.name)}${p.id === room.hostId ? ' · host' : ''}</li>`,
      )
      .join('')
    this.root.innerHTML = `
      <div class="menu-shell">
        <header class="menu-header">
          <p class="menu-eyebrow">Online lobby</p>
          <h1>Místnost ${room.code}</h1>
          <p class="menu-sub">${players.length}/4 hráčů · trať ${room.trackId}</p>
        </header>
        <section class="menu-section">
          <h2>Hráči</h2>
          <ol class="lobby-list">${players}</ol>
        </section>
        ${
          this.isHost
            ? `
          <section class="menu-section">
            <h2>Odkaz pro kamarády</h2>
            <p class="tune-rules">Pošli jim tento odkaz (funguje jen pokud mají stejnou veřejnou WS adresu v odkazu):</p>
            <input class="text-input" id="lobby-link" readonly value="${this.escape(this.lobbyLink)}" />
            <button type="button" class="btn-ghost" id="btn-copy" style="margin-top:10px">Kopírovat odkaz</button>
          </section>
          <button type="button" class="menu-start" id="btn-race">Start závodu</button>
        `
            : `<p class="tune-rules">Čekej, až host spustí závod…</p>`
        }
        <button type="button" class="btn-ghost" id="btn-leave" style="margin-top:12px">Opustit lobby</button>
        ${this.lobbyError ? `<p class="menu-error">${this.escape(this.lobbyError)}</p>` : ''}
      </div>
    `

    this.root.querySelector('#btn-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.lobbyLink)
      } catch {
        /* ignore */
      }
    })
    this.root.querySelector('#btn-race')?.addEventListener('click', () => this.onHostStart?.())
    this.root.querySelector('#btn-leave')?.addEventListener('click', () => this.onLeaveLobby?.())
  }

  private bindCommon(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.readFields()
        this.tab = (btn.dataset.tab as 'solo' | 'online') || 'solo'
        this.render()
      })
    })

    this.root.querySelectorAll<HTMLButtonElement>('[data-track]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.readFields()
        this.selectedTrackId = btn.dataset.track || TRACKS[0].id
        this.render()
      })
    })

    this.root.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.readFields()
        this.selectedDifficulty = (btn.dataset.diff as DifficultyId) || 'normal'
        this.render()
      })
    })

    this.root.querySelectorAll<HTMLInputElement>('input[data-tune]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.tune as keyof PlayerTuningValues
        this.tuning = setTuningStat(this.tuning, key, Number(input.value))
        this.syncSliders()
        const hint = this.root.querySelector('#tune-hint')
        if (hint) hint.textContent = tuningHint(this.tuning)
        const pill = this.root.querySelector('.budget-pill')
        if (pill) pill.textContent = `${tuningSum(this.tuning)} / ${TUNING_BUDGET} bodů`
      })
    })

    this.root.querySelector('#btn-solo')?.addEventListener('click', () => {
      this.readFields()
      this.onStart?.({
        mode: 'solo',
        trackId: this.selectedTrackId,
        tuning: { ...this.tuning },
        name: this.playerName,
        difficulty: this.selectedDifficulty,
      })
    })

    this.root.querySelector('#btn-host')?.addEventListener('click', () => {
      this.readFields()
      this.onStart?.({
        mode: 'host',
        trackId: this.selectedTrackId,
        tuning: { ...this.tuning },
        name: this.playerName,
        difficulty: this.selectedDifficulty,
        publicWsUrl: this.publicWsUrl || undefined,
      })
    })

    this.root.querySelector('#btn-join')?.addEventListener('click', () => {
      this.readFields()
      this.onStart?.({
        mode: 'join',
        trackId: this.selectedTrackId,
        tuning: { ...this.tuning },
        name: this.playerName,
        difficulty: this.selectedDifficulty,
        roomCode: this.joinCode,
        publicWsUrl: this.publicWsUrl || undefined,
      })
    })
  }

  private readFields(): void {
    const name = this.root.querySelector<HTMLInputElement>('#player-name')
    if (name) this.playerName = name.value.trim() || 'Hráč'
    const ws = this.root.querySelector<HTMLInputElement>('#public-ws')
    if (ws) this.publicWsUrl = ws.value.trim()
    const code = this.root.querySelector<HTMLInputElement>('#join-code')
    if (code) this.joinCode = code.value.trim().toUpperCase()
  }

  private syncSliders(): void {
    for (const key of Object.keys(this.tuning) as (keyof PlayerTuningValues)[]) {
      const input = this.root.querySelector<HTMLInputElement>(`input[data-tune="${key}"]`)
      if (!input) continue
      input.value = String(this.tuning[key])
      const val = input.parentElement?.querySelector('.tune-val')
      if (val) val.textContent = String(this.tuning[key])
    }
  }

  private trackCard(t: TrackDef): string {
    const active = t.id === this.selectedTrackId ? 'active' : ''
    return `
      <button type="button" class="track-card ${active}" data-track="${t.id}">
        <strong>${t.name}</strong>
        <span>${t.blurb}</span>
      </button>
    `
  }

  private slider(key: keyof PlayerTuningValues, label: string, value: number): string {
    return `
      <label class="tune-row">
        <span class="tune-label">${label} <span class="tune-val">${value}</span></span>
        <input type="range" min="0" max="100" value="${value}" data-tune="${key}" />
      </label>
    `
  }

  private escape(s: string): string {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }
}
