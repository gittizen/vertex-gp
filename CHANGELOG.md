# Changelog — KlecMania

Formát: co hráč a návštěvník pozná. Delší příběh verzí (od 0.1 nahoru): **[VERSIONS.md](./VERSIONS.md)**.

---

## [0.7.0] — 2026-11-09 · *KlecMania + drift brzda*

### Značka
- Hra se jmenuje **KlecMania** — skate logo **beze změny** (růžová K/L, cyan C).
- Produkce: https://klecmania.netlify.app/

### Jméno hráče
- Default už není Filip — při první návštěvě se vygeneruje náhodné jméno a uloží do localStorage (žebříček / lobby).

### Drift & freestyle
- **Space** = e-brake / drift brzda u normálních peklostrojů (default zapnuto).
- Skate a kolo drift brzdu nemají (freestyle / odrážka / šlapání).
- Sticky boost (Alt/Tab); kolo silnější šlapání; čitelnější AI board / triky.

### Audio & atmosféra
- Mute toggle ve stylu jazykového přepínače (ZVUK | TICH).
- Klecany / entry: Tarantino 60:30:10 (asfalt · krém · krev/hořčice); Volvo garage beze změny.

### Co jsme řešili
- Drift nesmí sahat na freestyle ovládání.
- Boost při blur okna; release jen dohrává 0.7, staré archivy se nepřepisují.

---

## [0.6.0] — 2026-11-09 · *UX menu, zvuk, landscape*

### Proč tahle verze existuje
Rychlejší start závodu, méně chaosu v nastavení, jednotné panely a čitelnější audio/ovládání.

### Domů & navigace
- Primární CTA **Jet** spustí klasiku hned (trať · vůz v podtitulu).
- Chipy: trať / peklostroj / obtížnost / rekordy — bez debug status řádku.
- Online jako vlastní dlaždice; Zpět z online vede Domů.

### Nastavení
- **Hráčské:** Ovládání, Obtížnost, Zvuk, Atmosféra.
- **Pokročilé** (sbalené): Soutěže, AI učení, Rekordy.

### Panely & UX
- Všechny menu panely: scrolluje tělo, **Zpět** zůstává v černém dock pásu.
- Karty tratí v seznamu jen název + `~čas` / sandbox; detail vpravo.
- Peklostroj: lore a nápověda ovládání pod „Více…“.

### Zvuk & mobil
- Engine samply podle typu peklostroje; freestyle tišší.
- Landscape-first; portrait jen když ho zapneš v Ovládání.

### Tag & copy
- Kasárny bez tagu „skate“; Plácek jen „sandbox“.
- Produkce: https://klecgp.netlify.app/

### Co jsme řešili
- Zpět ujíždějící se scrollem → dock footer.
- Stejně důležité dlaždice v nastavení → hráčské / pokročilé.
- Time-to-fun: jeden Jet místo zbytečného kroku režimu u klasiky.

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
- README / CHANGELOG / RECREATE_PROMPT — lidsky, portfolio-friendly.

### Co jsme dlouho řešili
- Z-fight a „voda“ místo země (Standard + fog na flat meshích).
- Blanket na loopu lezoucí přes paralelní asfalt.
- FPS: kdy měřit draws, city perf pipeline, stíny na obřím groundu.
- AI tempo: jak zrychlit start *pocitově*, aniž by se rozbily cílové časy.

---

## [0.4.0] — *reálnější svět*

### Proč
Mapy už nemají vypadat jako auto nad jednou zelenou deskou — okolí, terén, stíny.

### Co přibylo
- Berm / apron / terrain blanket, usazené budovy a hustší roadside dekor.
- Unikátní podklady a nálada map (Námko, noc, rally, climb…).
- Stíny bez mizícího asfaltu; contact stín pod autem.
- Version hub se screenshoty; Netlify produkce + Pages archivy jako standard.

### Co jsme řešili
- Fog „jezera“, z-fight, blanket přes cizí asfalt.
- FPS při velkém groundu a stínech.
- Aby každá trať měla vlastní vizuální identitu.

---

## [0.3.0] — *mobil + hosting + polish*

### Proč
Hrát na telefonu, poslat odkaz kamarádům, začít sbírat data pro AI.

### Co přibylo
- Dotyková schémata: volant, joystick, náklon, ťukání.
- Netlify `base: /`, GitHub Pages archivy verzí.
- Community / pace learning po dojetí; šampionát UX.
- Serpentiny a další obsah; vozidlo → tuning flow; Esc/restart polish.
- Lineární číslování verzí 0.1 → 0.2 → 0.3 (místo starých 0.4 / 1.0 / 1.1).

### Co jsme řešili
- Touch vs klávesnice, landscape, správný `base` na hostingu.
- První verze „AI se učí z jízd“ bez mid-race cheatů.
- Šampionát, který nekončí mrtvým menu.

---

## [0.2.0] — *Klec GP — identita*

### Proč
Z technického Vertex GP udělat hru s místem a značkou.

### Co přibylo
- Rebrand Klec GP (logo, entry, watermark).
- Freestyle (skate/kolo, triky), Plácek jako sandbox.
- Atmosféry menu; online hub (presence, rooms, Ready, laps).
- Víc tratí a lore kolem Klecan a okolí.

### Co jsme řešili
- Oddělit závodní smyčku od freestyle skóre.
- Lobby bez placeného dedicated serveru (WS + tunnel u hostitele).

---

## [0.1.0] — *Vertex GP — základ*

### Proč
První hratelný browser semi-sim: tratě, AI, online, tuning.

### Co bylo ve hře
- Vite + TypeScript + Three.js.
- Tratě z dat → mesh; AI obtížnosti; HUD.
- Solo + online WS (max 4); tuning rozpočet a barvy.
- Základní menu trati / vozu / obtížnosti; CS UI.

### Co jsme řešili
- Fyzika a řízení „formula feel“ na klávesnici.
- Generování silnice z křivky.
- První net sync a game loop, který drží pohromadě.
