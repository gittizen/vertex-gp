# Klec GP · v0.5

**Prohlížečová 2.5D semi-sim závodní hra** ze světa Klecan a okolí. Solo s AI, freestyle triky, online až 4 hráči.

> Ne další „racing template“. Je to studentský produkt s vlastní značkou, tratěmi podle reálných míst, UI/UX menu a AI, která se **učí z dojetých časů**.

| | |
|--|--|
| **Hrát teď (Netlify)** | https://tourmaline-gingersnap-268fa6.netlify.app/ |
| **Hub verzí (GitHub Pages)** | https://gittizen.github.io/vertex-gp/ |
| **Archivy** | [0.1](https://gittizen.github.io/vertex-gp/0.1/) · [0.2](https://gittizen.github.io/vertex-gp/0.2/) · [0.3](https://gittizen.github.io/vertex-gp/0.3/) · [0.4](https://gittizen.github.io/vertex-gp/0.4/) · [0.5](https://gittizen.github.io/vertex-gp/0.5/) |
| **Changelog** | [CHANGELOG.md](./CHANGELOG.md) |
| **Jak bys hru znovu postavil** | [RECREATE_PROMPT.md](./RECREATE_PROMPT.md) |

Autor: **Filip Khunt** · věkové omezení ve hře: **16+**

---

## Proč to dává smysl na pohovoru / před vedením

| Téma | Co v projektu uvidíš |
|------|----------------------|
| **Produkt** | Entry → home dlaždice → závod; atmosféry menu; verze s hratelnými archivy |
| **UI / UX** | Mobile back flow, schémata řízení, čitelnost tratí vs auta vs terén, CS/EN |
| **Engine / 3D** | Generované tratě (křivka → silnice + terén), stíny, výkonnostní režimy |
| **AI** | Soupeři se stejným „žánrem“ vozidla; live kalibrace tempa z dat závodů |
| **Síť** | Vlastní WebSocket lobby (ne jen hotový SaaS multiplayer) |
| **Engineering discipline** | Changelog, version hub, testování ve hře (warp/QA), iterace bugů |

Krátce: umím **dodat hratelnou věc**, ne jen slide.

---

## Co hraješ

- **Tratě** podle Klecan a okolí (Námko, Noční Klecany, Do Klecánek, Novostavby, Serpentýny…) + freestyle Plácek.
- **Peklostroje** — od formule po skate; tuning s rozpočtem bodů.
- **AI** — Lehká / Střední / Těžká; default **každý závod jiní soupeři**.
- **Online** — založ místnost, pošli odkaz (až 4).
- **Atmosféra** — styly menu včetně „Kalendář s holkama“.

### Easter eggy (spoiler light)
- **Koloběžka** v garáži — chyták, nejezdí.
- **Soutěže / šampionát**, žebříčky, watermark tratí.
- Dialogy a copy, které nejsou „lorem ipsum racing“.

---

## AI, která se učí za běhu

Po dojetí závodu hra umí **zaznamenat tempo** a použít ho při kalibraci AI (`CommunityLearning` / `PaceCalibration`).  
Soupeři tak nejsou jen pevný násobič rychlosti — cílí na **reálnější časy tratě** a mohou se měnit s tím, jak lidi (nebo ty) jezdíš.

Solo navíc defaultně **losuje jiné peklostroje AI** na každý závod (stejná kategorie jako ty: auto ≠ skate).

---

## Nad čím jsme dlouho bádali (a proč to není „hotové za víkend“)

1. **Terén vs silnice** — na okruhu blanket lezl přes druhý úsek asfaltu; flat ground + fog vypadal jako navy „jezero“.
2. **Čitelnost noci** — město bez kontrastu silnice / auta / domů.
3. **FPS** — kdy měřit draw calls, city perf pipeline, stíny na obřím groundu.
4. **AI feel** — rychlý start vs fér cílové časy; lean motorky bez „snap upright“.
5. **UI na telefonu** — cesty zpět, ovládání bez klávesnice.
6. **Verze jako produkt** — archivy 0.1–0.5 na Pages + Netlify produkce.

Detailnější příběh verzí: **[VERSIONS.md](./VERSIONS.md)**.

---

## Rychlý start

```bash
npm install
npm run dev:all
```

Otevři **http://localhost:5173** → klávesa / tap → **Závod**.

| Klávesa | Akce |
|---------|------|
| Šipky / WASD | Plyn, brzda, řízení |
| R | Restart (solo) |
| Esc | Pauza → menu |

**Telefon:** Nastavení → Ovládání → volant / joystick / náklon / ťukání.

### Multiplayer (zkráceně)

```bash
npm run dev:all
# host vystaví WS (např. cloudflared tunnel na :8787)
```

V menu **Online** → WS adresa → místnost → Ready. Max **4**.

---

## Stack & build

Vite · TypeScript · Three.js · `ws`

```bash
npm run build          # → dist/ (Netlify)
npm run build:pages    # → site/ (hub + archivy pro GH Pages)
```

---

## Licence / tón

Hra obsahuje vulgární a nekorektní výrazy (vědomá estetika).  
Kód je studentský projekt — uč se z něj, forkuj, ale respektuj že **Klec GP** je značka Filipa Khunta.

Noční neon. Rovinky. Smyk. Ať vyhraje ten rychlejší.
