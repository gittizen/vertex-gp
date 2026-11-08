# Klec GP / Vertex GP — verze

**0.5** = současná (AI tempo live, atmosféra, demo polish).  
Historie commitů v gitu zůstává; staré tagy se nemažou.

**Hub:** https://gittizen.github.io/vertex-gp/  
**Složky:** [versions/](./versions/) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---

## Přehled

| **0.1** Vertex GP | **0.2** Klec GP | **0.3** mobil | **0.4** svět | **0.5** AI + demo |
| --- | --- | --- | --- | --- |
| [Hrát](https://gittizen.github.io/vertex-gp/0.1/) | [Hrát](https://gittizen.github.io/vertex-gp/0.2/) | [Hrát](https://gittizen.github.io/vertex-gp/0.3/) | [Hrát](https://gittizen.github.io/vertex-gp/0.4/) | [Hrát](https://gittizen.github.io/vertex-gp/0.5/) · [Netlify](https://tourmaline-gingersnap-268fa6.netlify.app/) |
| Základ engine | Identita | Dotyk + hosting | Okolí tratí | Live AI + atmosféra |

---

## 0.5 — AI, atmosféra, produktový polish *(současná)*

**Cíl:** živější AI a menu, čitelnější tratě, hratelná produkce + archivy.

- Community / pace learning → úprava jezdců podle dat
- Default: náhodní AI soupeři každý solo závod
- Menu styl Kalendář; Klecany garage = Volvo V70 1. gen
- Opravy terénu (Námko), noční kontrast, AI launch/lean
- Dokumentace: README, CHANGELOG, RECREATE_PROMPT

**Postup release**
1. `GameVersion.ts` + `package.json` → **0.5**
2. Větev `0.4` z předchozího release; `node scripts/build-version-pages.mjs`
3. Netlify = produkce 0.5; Pages = hub včetně `/0.5/`

---

## 0.4 — Reálnější svět
Okolí, berm/blanket, unikátní podklady, stíny bez děr v asfaltu.

## 0.3 — Dotyk, hosting, polish
Mobilní řízení, Netlify, community learning základy, šampionát UX.

## 0.2 — Klec GP
Rebrand, freestyle, atmosféra menu, online hub.

## 0.1 — Vertex GP
Vite + TS + Three.js, tratě, AI, online WS, tuning.

---

## Pravidlo
- Nepřepisovat staré tagy kvůli „úklidu“.
- Ke každé verzi: krátké *proč* + screenshot ve `versions/<ver>/`.
- UI verze = `src/ui/GameVersion.ts` + `package.json`.
