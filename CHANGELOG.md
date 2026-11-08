# Changelog — Klec GP

Formát: co hráč a návštěvník pozná. Technické detaily jsou ve zdrojákách.

---

## [0.5.0] — 2026-11-08 · *AI tempo, atmosféra, produktový polish*

### Proč tahle verze existuje
Čitelnější tratě, živější AI, menu jako produkt, easter eggy a srozumitelná dokumentace.

### Herní AI (live data)
- AI soupeři **sbírají tempo z dojetých závodů** (community / pace kalibrace) a upravují cílové časy.
- Solo: **každý závod jiní soupeři** (peklostroje) — default zapnuto; jde vypnout a vybrat ručně.
- Launch feel a lean motorek laděné tak, aby start nebyl „všichni stejně rychlí“ a motorka se nelámlala jako tyčka.

### Atmosféra & menu (UI/UX)
- Menu styl **Kalendář** — varianty Klasika / Blondýny / Zrzky / Globál.
- Klecany — dlaždice peklostroje: **Volvo V70 1. gen (~1999), tmavě modrá**.
- Mobile back navigace, pořadí tratí (Námko první, Plácek poslední), kontrast nočního města.

### Svět & tratě
- Terén na okruhu (Námko): žádná „modrá plocha“ přes asfalt — blanket se zastaví před cizí silnicí; ground bez fog jezera.
- Noční Klecany: čitelný asfalt × terén; Novostavby: světlejší okolí.
- Variabilita domů (HouseKit), méně hitchů na city/loop.

### Easter eggy & extra
- **Koloběžka** — easter egg v garáži (nejezdí; dialogy).
- **Soutěže / šampionát**, žebříčky, freestyle body na skate/kole.
- Atmosférické styly menu (neon, mech, led, kalendář…).

### Co jsme dlouho řešili
- Z-fight a „voda“ místo země (Standard + fog na flat meshích).
- Blanket na loopu lezoucí přes paralelní asfalt.
- FPS: kdy měřit draws, city perf pipeline, stíny na obřím groundu.
- AI tempo: jak zrychlit start *pocitově*, aniž by se rozbily cílové časy.

---

## [0.4.0] — reálnější svět
Okolí silnice, berm/apron/blanket, unikátní podklady map, stíny bez mizícího asfaltu, Netlify produkce + hub verzí.

## [0.3.0] — mobil + polish
Schémata řízení (volant / joystick / náklon / ťukání), Netlify `base: /`, community learning, šampionát UX.

## [0.2.0] — Klec GP
Rebrand, freestyle, atmosféra menu, online hub.

## [0.1.0] — Vertex GP
Vite + TS + Three.js, tratě, AI, online WS, tuning rozpočet.
