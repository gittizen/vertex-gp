# Klec GP / Vertex GP — verze

Přečíslování historie: **0.4 → 0.1**, **1.0 → 0.2**, **1.1 (+ polish)** → **0.3**.  
**0.4** = současná (reálnější svět, okolí, stíny, Netlify).  
Historie commitů v gitu zůstává; staré tagy se nemažou.

**Hub (všechny verze):** https://gittizen.github.io/vertex-gp/  
**Složky:** [versions/](./versions/)

---

## Sloupce verzí

| **0.1** — Vertex GP | **0.2** — Klec GP | **0.3** — mobil + polish | **0.4** — reálný svět |
| --- | --- | --- | --- |
| [Hrát 0.1](https://gittizen.github.io/vertex-gp/0.1/) | [Hrát 0.2](https://gittizen.github.io/vertex-gp/0.2/) | [Hrát 0.3](https://gittizen.github.io/vertex-gp/0.3/) | [Hrát 0.4](https://gittizen.github.io/vertex-gp/0.4/) · [Tourmaline](https://tourmaline-gingersnap-268fa6.netlify.app/) |
| Vite + TS + Three.js | Rebrand Klec GP | Mobilní řízení | Okolí, terén, unikátní mapy |
| Tratě + AI + online WS | Freestyle / atmosféra | Netlify + community AI | Stíny bez děr, asfalt, PBR |
| Tuning rozpočet | Online hub | Šampionát, UX polish | Screenshoty na hubu |

---

## 0.1 — Vertex GP (základ)

**Cíl:** prohlížečová 2.5D semi-sim, solo i online.

- Vite + TypeScript + Three.js
- Tratě jako data + mesh generátor
- AI Lehká / Střední / Těžká
- Online WS (max 4), tuning rozpočet

---

## 0.2 — Klec GP (identita)

**Cíl:** domácí značka, freestyle, atmosféra, menu jako produkt.

- Rebrand (logo, intro, watermark)
- Freestyle (skate/kolo, Plácek, triky)
- Atmosféra menu + online hub

---

## 0.3 — Dotyk, hosting a herní polish

**Cíl:** mobilní jízda + web mimo GH Pages + UX.

- Schémata řízení: volant, joystick, náklon, ťukání
- Netlify `base: /`, community learning, šampionát
- Menu vozidlo → tuning, watermark, Esc/restart

---

## 0.4 — Reálnější svět (současná)

**Cíl:** okolí při jízdě jako venku — bez levitujících domů, děr vedle silnice a černého asfaltu.

- Hustší triangulace berm/apron/blanket, `settleY` dekorací
- PBR povrchy, contact stíny, shadow mapa jezdí s autem
- Unikátní podklad per mapa (Námko / noc / rally / …)
- Opravy: zelené objekty na silnici, mizící asfalt (Hrubý)

**Postup**
1. UI verze = `src/ui/GameVersion.ts` + `package.json` → **0.4**
2. Archivy: `node scripts/build-version-pages.mjs` → Pages `/0.1` … `/0.4`
3. Produkční Netlify: Tourmaline (aktuální 0.4)

---

## Pravidlo pro další verze

- Nepřepisovat staré tagy / force-push historii kvůli „úklidu“.
- README + tento soubor + `versions/`: krátce *proč*, ne jen changelog diff.
- UI verze = `src/ui/GameVersion.ts` + `package.json`.
- Ke každé verzi screenshot gameplaye (`versions/<ver>/screenshot.png`).
