# Klec GP / Vertex GP — verze

**0.6** = současná (UX menu, zvuk, landscape).  
Historie commitů v gitu zůstává; staré tagy se nemažou.

**Hub:** https://gittizen.github.io/vertex-gp/  
**Složky:** [versions/](./versions/) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md)

---

## Přehled

| **0.1** Vertex GP | **0.2** Klec GP | **0.3** mobil | **0.4** svět | **0.5** AI + demo | **0.6** UX + zvuk |
| --- | --- | --- | --- | --- | --- |
| [Hrát](https://gittizen.github.io/vertex-gp/0.1/) | [Hrát](https://gittizen.github.io/vertex-gp/0.2/) | [Hrát](https://gittizen.github.io/vertex-gp/0.3/) | [Hrát](https://gittizen.github.io/vertex-gp/0.4/) | [Hrát](https://gittizen.github.io/vertex-gp/0.5/) | [Hrát](https://gittizen.github.io/vertex-gp/0.6/) · [Netlify](https://klecgp.netlify.app/) |
| Základ engine | Identita | Dotyk + hosting | Okolí tratí | Live AI + atmosféra | Jet CTA, dock Zpět, engine SFX |

---

## 0.6 — UX menu, zvuk, landscape *(současná)*

**Cíl:** rychlejší cesta do závodu, srozumitelnější nastavení, konzistentní panely, lepší audio feel.

- Domů: primární **Jet** (klasika hned), chipy trať / vůz / obtíž / rekordy; Online jako dlaždice
- Nastavení: **Hráčské** vs sbalené **Pokročilé** (soutěže, AI učení, rekordy)
- Všechny menu panely: scroll těla, **Zpět** v černém dock pásu (jako Zvuk)
- Engine zvuky podle peklostroje; freestyle tišší; landscape-first + volitelné portrait
- Tratě: lehčí karty v seznamu; tagy Kasárny/Plácek zjednodušené

**Postup release**
1. `GameVersion.ts` + `package.json` → **0.6**
2. Větev `0.5` z `v0.5.0`; `node scripts/build-version-pages.mjs`
3. Netlify = produkce 0.6; Pages = hub včetně `/0.6/`

---

## 0.5 — AI, atmosféra, produktový polish
Live tempo AI, náhodní soupeři, kalendář atmosféra, demo docs.

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
