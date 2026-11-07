# Vertex GP

Noční město plné neonů. Klasický okruh s tribunami. Ledová horská smyčka.  
Tři tratě, tři typy aut — a závod proti kamarádům přes internet.

Prohlížečová 2.5D semi-sim hra. Solo s AI, nebo **online až 4 hráči**, každý u sebe doma.

---

## Trať & auta

| Trať | Atmosféra | Auto |
|------|-----------|------|
| **Downtown Sprint** | Úzké ulice, neon, mlha | Vytuněné street auto |
| **Monza Parabolica** | F1 okruh, tribuny, fanoušci | Formule |
| **Alpine Freeze** | Led mezi horami, jezero | Rallye |

Obtížnost AI: Lehká / Střední / Těžká. Tuning rozpočet **100 bodů**.

---

## Rychlý start (solo)

```bash
npm install
npm run dev:all
```

Otevři **http://localhost:5173** → *Solo + AI* → trať → obtížnost → Start.

| Klávesa | Akce |
|---------|------|
| Šipky / WASD | Plyn, brzda, řízení |
| R | Restart (solo) |
| Esc | Menu |

---

## Multiplayer — jak se to má dělat

Každý hraje **u sebe na svém PC**. Server běží u **hostitele**. Kamarádi z jiného internetu se na `localhost` nepřipojí — host musí vystavit WebSocket ven (tunnel).

```
┌─────────────┐     wss://tunnel      ┌──────────────────┐
│  Kamarád A  │ ───────────────────►  │  Hostitel        │
│  prohlížeč  │                       │  hra :5173       │
└─────────────┘                       │  WS   :8787      │
┌─────────────┐     wss://tunnel      │  cloudflared ────┤──► internet
│  Kamarád B  │ ───────────────────►  └──────────────────┘
└─────────────┘
```

### 1) Hostitel — spusť hru + server

```bash
npm install
npm run dev:all
```

Běží:
- hra na `http://localhost:5173`
- multiplayer server na portu **8787**

### 2) Hostitel — vystav server na internet

Bez tunelu funguje jen stejná Wi‑Fi / stejný počítač.

Nejjednodušší je **Cloudflare Tunnel** (zdarma, bez účtu na quick tunnel):

```bash
cloudflared tunnel --url http://localhost:8787
```

V terminálu uvidíš něco jako:

```text
https://random-words-here.trycloudflare.com
```

Do hry patří **WebSocket** verze — jen změň protokol:

```text
wss://random-words-here.trycloudflare.com
```

> `https://` → **`wss://`** (stejný zbytek adresy).  
> Tunnel nech běžet po celou dobu závodu.

*(Nemáš `cloudflared`? [Stáhni ho](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/) nebo použij `ngrok http 8787` a z URL udělej stejně `wss://…`.)*

### 3) Hostitel — vytvoř místnost

1. Otevři hru → záložka **Online multiplayer**
2. Do pole **Veřejná WS adresa hostitele** vlož `wss://….trycloudflare.com`
3. Klikni **Vytvořit místnost**
4. V lobby zkopíruj **odkaz pro kamarády** a pošli ho (Discord, zprávy, …)

Odkaz už obsahuje kód místnosti i WS adresu — kamarádi nemusí nic ručně vyplňovat.

### 4) Kamarádi — připojení

1. Otevřou odkaz od hostitele (ideálně ve Chrome / Edge)
2. Automaticky skočí do lobby
3. Počkají, až host spustí závod

Ruční cesta (když odkaz nejde): stejná WS adresa + kód místnosti → **Připojit se**.

### 5) Start

Host v lobby klikne **Start závodu**.  
Max **4 hráči**. Volná místa doplní AI.

---

## Checklist (ať to fakt funguje)

- [ ] Host má `npm run dev:all` i `cloudflared` stále zapnuté  
- [ ] V menu je **`wss://`**, ne `https://` ani `ws://localhost`  
- [ ] Kamarádi otevírají **odkaz z lobby**, ne jen `localhost:5173`  
- [ ] Firewall / antivirus neblokuje Node na portu 8787  
- [ ] Po restartu tunelu je nová adresa — host musí vytvořit místnost znovu a poslat nový odkaz  

### Stejná Wi‑Fi (bez internetového tunelu)

Pokud jste všichni na jedné síti:

1. Host zjistí svou LAN IP (např. `192.168.0.42`)
2. Spustí `npm run dev:all`
3. Kamarádi otevřou `http://IP-HOSTA:5173`
4. Jako WS adresu dají `ws://IP-HOSTA:8787`

---

## Stack

Vite · TypeScript · Three.js · vlastní `ws` server (port 8787)

```bash
npm run dev      # jen frontend
npm run server   # jen multiplayer server
npm run dev:all  # obojí najednou
npm run build    # produkční build
```

---

Noční neon. Rovinky Monzy. Smyk na ledě.  
Vytvoř místnost, pošli odkaz — a ať vyhraje ten rychlejší.
