# Klec GP / Vertex GP — verze

Přečíslování (jen pojmenování): **0.4 → 0.1**, **1.0 → 0.2**, **1.1 (+ současná)** → **0.3**.  
Historie commitů v gitu zůstává; staré tagy se nemažou.

---

## Sloupce verzí

| **0.1** — Vertex GP (základ) | **0.2** — Klec GP (identita) | **0.3** — současná (hra + polish) |
| --- | --- | --- |
| Vite + TypeScript + Three.js | Rebrand **Klec GP** (logo, intro, watermark) | Mobilní řízení (volant, stick, náklon, ťukání) |
| Tratě jako data (`TrackDefs`) + mesh generátor | Freestyle / skate / Plácek + triky A–Z | Hosting na Netlify (root `base`) |
| AI Lehká / Střední / Těžká | Atmosféra menu (Klecany, asfalt, kalendář…) | Community AI learning až po dojetí |
| Solo + online WS (max 4, host tunnel) | Online hub (presence, rooms, ready, laps) | Šampionát, Serpentiny, pace kalibrace |
| Tuning rozpočet + barvy | Sjednocená verze UI ↔ `package.json` | Menu: vozidlo → tuning → domů, neon v tuningu |
| První „pustit kamarádům“ milestone | GitHub Pages mirror `/vertex-gp/` | Watermark crossfade, Esc→menu, restart po dojetí |
| Commit: *Launch Vertex GP…* | Commit: *Release Klec GP 1.0…* | Asfalt/světlo, HUD, FPS, QA průchod |

---

## 0.1 — Vertex GP (základ)

**Cíl:** prohlížečová 2.5D semi-sim, solo i online, bez těžkého enginu.

**Jak jsme přemýšleli**
- Vite + TypeScript + Three.js — rychlý start, jeden stack.
- Tratě jako data (`TrackDefs`) + vlastní mesh generátor.
- AI difficulty odděleně od fyziky.
- Online: vlastní `ws` server u hostitele (max 4), tunnel ven.
- Tuning rozpočet + barvy — personalizace bez lootboxů.

**Co to bylo**
- Tři+ tratě, AI Lehká/Střední/Těžká, solo restart, lobby + odkaz do místnosti.
- Veřejný commit: *Launch Vertex GP…*

---

## 0.2 — Klec GP (identita + hloubka)

**Cíl:** z Vertex GP udělat **Klec GP** — domácí značka, freestyle, atmosféra, menu jako produkt.

**Jak jsme přemýšleli**
- Rebrand (logo skate, intro, watermark tratí).
- Freestyle (skate/kolo, Plácek, triky) vedle klasického závodu.
- Atmosféra menu — stejné rozložení, jiný nádech.
- Online hub (presence, rooms, ready, laps).
- Hostování: GitHub Pages jako free static; multiplayer server dál u hráče.

**Co jsme ladili**
- Entry BG, leave lobby, browse reconnect spam.
- Verze v UI (`GAME_VERSION`) sjednocená s `package.json`.

---

## 0.3 — Dotyk, hosting a herní polish

**Cíl:** mobilní jízda + web mimo GH Pages + herní hloubka a UX po 0.2.

**Jak jsme přemýšleli**
- Na mobilu jen klasická jízda; triky zůstávají na klávesách.
- Schémata řízení: volant+pedály, joystick, náklon, ťukání stran.
- Netlify s `base: /` místo omezené GH domény.
- Community learning jen po dojetí; šampionát; ladění tratí a AI.
- Menu flow vozidlo → tuning (neon), watermark, Esc při countdown → menu, restart po stage.

**Postup**
1. UI verze = `src/ui/GameVersion.ts` + `package.json` → **0.3**.
2. Cursor Origin repo `filip-xvnz7/vertex-gp` drží větve / labely **0.1 · 0.2 · 0.3**.
3. GitHub zatím neaktualizovat, dokud to výslovně neřekneš.

---

## Pravidlo pro další verze

- Nepřepisovat staré tagy / force-push historii kvůli „úklidu“.
- README + tento soubor: krátce *proč*, ne jen changelog diff.
- UI verze = `src/ui/GameVersion.ts` + `package.json`.
