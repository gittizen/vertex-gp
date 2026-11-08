# Klec GP · v1.0

Noční město. Ulice Klecan. Horské rallye. Stoupání Do Klecánek. Freestyle na Plácku.

Prohlížečová 2.5D semi-sim hra. Solo s AI, freestyle triky, nebo **online až 4 hráči**.

> Předchozí veřejná verze: **0.4** (Vertex GP). Tahle větev je **Klec GP 1.0** — update, historie zůstává.

**Web (GitHub Pages):** https://gittizen.github.io/vertex-gp/

---

## Trať & auta

| Trať | Atmosféra | Poznámka |
|------|-----------|----------|
| **Do Klecánek** | Klecánky → U Hřbitova | Klasika |
| **Noční Klecany** | Úsvit / noc, náměstí | Domácí |
| **Námko / Novostavby / …** | Město & okolí | Více tratí |
| **Mexiko** | Skate etapa | Shift odraz |
| **Kasárny** | Drift | E-brake |
| **Plácek** | Sandbox u vody | Freestyle body |

Vytvořil **Filip Khunt**.

Obtížnost AI: Lehká / Střední / Těžká. Tuning rozpočet **250 bodů**.

---

## Rychlý start (solo)

```bash
npm install
npm run dev:all
```

Otevři **http://localhost:5173** → stiskni klávesu (entry) → **Závod** / **Trať** / **Nastavení**.

| Klávesa | Akce |
|---------|------|
| Šipky / WASD | Plyn, brzda, řízení |
| R | Restart (solo) |
| Esc | Pauza → menu |

---

## Multiplayer

Každý hraje **u sebe**. Server běží u **hostitele**. Kamarádi z jiného internetu se na `localhost` nepřipojí — host vystaví WebSocket ven (tunnel).

```bash
npm run dev:all
cloudflared tunnel --url http://localhost:8787
```

V menu **Online** → do WS pole `wss://….trycloudflare.com` → **Založit místnost** → pošli odkaz.

Max **4 hráči**. Host startuje až jsou všichni Ready.

### Stejná Wi‑Fi

1. Host: `npm run dev:all`
2. Kamarádi: `http://IP-HOSTA:5173` · WS `ws://IP-HOSTA:8787`

---

## Stack

Vite · TypeScript · Three.js · `ws` server (port 8787)

```bash
npm run dev      # frontend
npm run server   # multiplayer
npm run dev:all  # obojí
npm run build    # produkce → dist/ (base /vertex-gp/)
```

---

Noční neon. Rovinky. Smyk.  
Vytvoř místnost, pošli odkaz — a ať vyhraje ten rychlejší.
