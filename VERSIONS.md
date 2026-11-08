# Klec GP / Vertex GP — verze

**0.6** = současná produkce.  
Níže je historie **od první hratelné verze nahoru** — u každé další je, *co se oproti předchozí změnilo*, co se přidalo a co se dlouho ladilo.  
Staré tagy a archivy se nemažou.

**Hub:** https://gittizen.github.io/vertex-gp/  
**Složky:** [versions/](./versions/) · **Changelog:** [CHANGELOG.md](./CHANGELOG.md)  
**Hrát teď:** https://klecgp.netlify.app/

---

## Přehled (odkazová tabulka)

| **0.1** | **0.2** | **0.3** | **0.4** | **0.5** | **0.6** *(teď)* |
| --- | --- | --- | --- | --- | --- |
| [Hrát](https://gittizen.github.io/vertex-gp/0.1/) | [Hrát](https://gittizen.github.io/vertex-gp/0.2/) | [Hrát](https://gittizen.github.io/vertex-gp/0.3/) | [Hrát](https://gittizen.github.io/vertex-gp/0.4/) | [Hrát](https://gittizen.github.io/vertex-gp/0.5/) | [Hrát](https://gittizen.github.io/vertex-gp/0.6/) · [Netlify](https://klecgp.netlify.app/) |
| Vertex GP · základ | Klec GP · identita | mobil + hosting | reálnější svět | AI tempo + demo | UX + zvuk |

---

## 0.1 — Vertex GP *(začátek)*

**Proč vznikla:** mít v prohlížeči *hratelný* semi-sim závod, ne demíčko jedné rovinky. Stack Vite + TypeScript + Three.js od nuly.

**Co hra uměla**
- Tratě jako **data** (`TrackDefs`) → křivka → mesh silnice, start, checkpointy, kola
- Víc typů vozidel (od „street“ po formuli a další) + **tuning s rozpočtem bodů** a barvy
- Solo závod s AI (Lehká / Střední / Těžká) a základní HUD (rychlost, kolo, čas)
- **Online multiplayer** přes vlastní WebSocket server (až 4 hráči, lobby, sync stavu)
- Menu výběru trati / vozu / obtížnosti, české UI jako default

**Co se řešilo (a bolelo)**
- Fyzika „formula feel“ vs. čitelnost na klávesnici — grip, understeer, převody
- Generování silnice z bodů bez děr a divných normál
- Rozjetí game loopu, kamer, AI, které aspoň drží stopu
- Aby online vůbec existovalo (WS, room, remote sloty) — ne cloud game server, jen host + klient

**Shrnutí:** engine a smyčka *hra → závod → výsledek*. Ještě bez silné značky Klecany a bez „produktového“ menu.

---

## 0.2 — Klec GP *(identita)*

**Oproti 0.1:** z technického Vertex GP je **Klec GP** — místní atmosféra, freestyle a online jako hub.

**Co přibylo / se změnilo**
- Rebrand: logo, entry obrazovka, watermark tratí, vizuální tón „Klecany asfalt“
- **Freestyle** — skate / kolo, triky, body; **Plácek** jako volná plocha (sandbox), ne jen okruh
- Atmosféry menu (první generace vizuálních stylů)
- Online hub: presence, otevřené místnosti, Ready, počet kol, přívětivější lobby flow
- Víc tratí a peclostrojů v katalogu; texty a lore kolem míst

**Co se řešilo**
- Jak oddělit „závodní smyčku“ od freestyle (body, žádný klasický cíl na Plácku)
- Aby značka působila jako hra, ne jako školní Three.js cvičení
- Stabilita lobby (připojení, host, leave) bez placeného dedicated serveru

**Shrnutí:** hráč už cítí *kde* jezdí a že jde o Klecany — ne jen o generický okruh.

---

## 0.3 — mobil, hosting, polish

**Oproti 0.2:** hra musí jít hrát **na telefonu**, nasadit se kamarádům (Netlify) a začít sbírat data pro AI.

**Co přibylo / se změnilo**
- Mobilní řízení: **volant + pedály**, joystick, náklon, ťukání stran — přepínatelné v nastavení
- Produkční hosting (`base: /`), GitHub Pages archivy verzí jako produktový zvyk
- Základy **community / pace learning** (po dojetí se ukládá tempo)
- **Šampionát** a další solo výzvy v menu; Serpentiny a další tratě v katalogu
- Flow vozidlo → tuning, lepší Esc / restart, watermarky, CS + EN i18n rostoucí s obsahem
- Přečíslování historie (staré 0.4/1.0/1.1 → 0.1/0.2/0.3), ať jde verze číst lineárně

**Co se řešilo**
- Dotyk vs. klávesnice: žádné falešné stisky, landscape, bezpečné area
- Aby Netlify i Pages měly správný `base` (root vs `/vertex-gp/0.x/`)
- První pokusy o „AI se učí z jízd“ bez cheatů mid-race
- UX šampionátu (další trať, body, konec sezóny) tak, aby to nepadalo do mrtvého menu

**Shrnutí:** z „PC dema“ je hra, kterou pošleš odkazem a kterou jde řídit palcem.

---

## 0.4 — reálnější svět

**Oproti 0.3:** mapy přestávají vypadat jako „auto nad zelenou / modrou deskou“. Okolí, terén, stíny.

**Co přibylo / se změnilo**
- Hustší okolí silnice: **berm / apron / terrain blanket**, usazené budovy a dekor
- Unikátní podklady a look map (Námko, Noční Klecany, rally, climb…)
- Stíny a světlo tak, aby **asfalt nemizel** (typicky Hrubý a velké ground meshe)
- Contact stín pod autem; lepší usazení objektů na výšku terénu
- Version hub se screenshoty; Netlify jako jasná produkce + Pages archivy

**Co se řešilo (dlouho)**
- Z-fighting, „voda“ / fog jezero místo země (Standard materiály + fog na flat meshích)
- Blanket, který leze přes paralelní asfalt na loopu
- FPS při stínech a velkém groundu — kdy měřit draws, co vypnout v `perf`
- Aby každá trať měla *vlastní* náladu, ne stejný copy-paste roadside

**Shrnutí:** svět začíná vypadat jako místo, ne jako blueprint.

---

## 0.5 — AI tempo, atmosféra, demo polish

**Oproti 0.4:** AI přestává být jen násobič rychlosti; menu vypadá jako produkt; docs pro lidi (ne jen pro gita).

**Co přibylo / se změnilo**
- **Live kalibrace tempa** z dojetých závodů (community / pace) → realističtější cílové časy AI
- Solo default: **každý závod jiní AI soupeři** (stejná kategorie peklostroje); jde vypnout a vybrat ručně
- Launch feel AI a lean motorek — start není „všichni stejně“, moto se neláme jako tyčka
- Menu styl **Kalendář** (Klasika / Blondýny / Zrzky / Globál) + další atmosféry
- Klecany garage art (Volvo V70 1. gen); pořadí tratí (Námko první, Plácek poslední)
- HouseKit — variabilnější domy; noční kontrast asfalt × terén; Novostavby světlejší
- Easter egg **koloběžka** v garáži; soutěže / žebříčky / freestyle body dál v produktu
- README, CHANGELOG, RECREATE_PROMPT — lidsky, vhodné i na první dojem (portfolio)

**Co se řešilo**
- Jak zrychlit AI *pocitově* na startu, aniž by se rozbily fér cílové časy
- Terén na Námku vs. cizí silnice (blanket stop)
- Dokumentace bez „AI slopu“ a bez přehánění — co hra opravdu umí

**Shrnutí:** hra je připravená ukázat kamarádům *i* na GitHubu jako hotový malý produkt.

---

## 0.6 — UX menu, zvuk, landscape *(současná)*

**Oproti 0.5:** méně tření před jízdou, srozumitelnější nastavení, jednotné panely, lepší audio a mobilní orientace.

**Co přibylo / se změnilo**
- Domů: primární **Jet** spustí klasiku hned (trať · vůz v podtitulu); chipy trať / vůz / obtíž / rekordy
- Online jako vlastní dlaždice; Zpět z online vede Domů
- Nastavení: **Hráčské** (ovládání, obtížnost, zvuk, atmosféra) vs sbalené **Pokročilé** (soutěže, AI učení, rekordy)
- Všechny menu panely: scrolluje tělo, **Zpět** sedí v černém dock pásu (vzor ze Zvuku)
- Engine zvuky **podle typu peklostroje**; freestyle tišší
- Landscape-first; portrait jen když ho zapneš v Ovládání
- Lehčí karty tratí v seznamu (`~čas` / sandbox); lore vozu pod „Více…“
- Tag cleanup: Kasárny bez „skate“, Plácek jen „sandbox“
- Produkční URL: **klecgp.netlify.app** (starý Tourmaline host už neběží)

**Co se řešilo**
- Zpět dřív „ujížděl“ se scrollem — proto dock footer
- Cognitive load v hubu nastavení (všechny dlaždice stejně důležité)
- Time-to-fun: režim → Enter vs. jeden Jet
- Sjednocení velikosti panelů (Zvuk vs Ovládání vs zbytek)

**Shrnutí:** stejná hra pod kapotou, ale cesta *otevřít → jet* je kratší a menu působí uceleně.

---

## Pravidlo release

1. `GameVersion.ts` + `package.json` = UI verze  
2. Nová větev z předchozího tagu (archiv); `node scripts/build-version-pages.mjs`  
3. Netlify = aktuální produkce; Pages = hub + `/0.x/`  
4. Ke každé verzi: *proč* + screenshot ve `versions/<ver>/`  
5. **Nepřepisovat** staré tagy kvůli úklidu
