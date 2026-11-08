# Klec GP · v0.6

![Klec GP gameplay](./versions/0.6/screenshot.png)

**Prohlížečová 2.5D semi-sim závodní hra** ze světa Klecan a okolí. Solo s AI, freestyle triky, online až 4 hráči.

Studentský produkt s vlastní značkou, tratěmi podle reálných míst, pečlivým menu a AI, která **kalibruje tempo z dojetých závodů**.

| | |
|--|--|
| **Hrát** | https://klecgp.netlify.app/ |
| **Historie verzí** | https://gittizen.github.io/vertex-gp/ |
| **Archivy** | [0.1](https://gittizen.github.io/vertex-gp/0.1/) · [0.2](https://gittizen.github.io/vertex-gp/0.2/) · [0.3](https://gittizen.github.io/vertex-gp/0.3/) · [0.4](https://gittizen.github.io/vertex-gp/0.4/) · [0.5](https://gittizen.github.io/vertex-gp/0.5/) · [0.6](https://gittizen.github.io/vertex-gp/0.6/) |
| **Příběh verzí** | [VERSIONS.md](./VERSIONS.md) — od 0.1 nahoru, co se měnilo a řešilo |
| **Changelog** | [CHANGELOG.md](./CHANGELOG.md) |
| **Rebuild prompt** | [RECREATE_PROMPT.md](./RECREATE_PROMPT.md) |

Autor: **Filip Khunt** · ve hře věkové omezení **16+** · repozitář historicky `vertex-gp`

---

## Co projekt ukazuje

| Oblast | Konkrétně |
|--------|-----------|
| **Produkt** | Entry → home → závod; atmosféry menu; hratelné archivy verzí |
| **UI / UX** | Mobilní navigace zpět, schémata řízení, kontrast silnice / auto / terén, CS + EN |
| **3D / engine** | Tratě z dat (křivka → silnice + terén), stíny, výkonnostní režimy |
| **AI** | Soupeři ve stejné kategorii vozidla; live kalibrace cílových časů z dat závodů |
| **Síť** | Vlastní WebSocket lobby (max 4 hráčů) |
| **Proces** | Changelog, version hub, opakované herní testování a opravy |

---

## Hra stručně

- **Tratě** podle Klecan a okolí (Námko, Noční Klecany, Do Klecánek, Novostavby…) + freestyle Plácek  
- **Vozidla** od formule po skate; tuning s rozpočtem bodů  
- **AI** — Lehká / Střední / Těžká; default *každý solo závod jiní soupeři*  
- **Online** — založ místnost, pošli odkaz  
- **Menu** — Jet na Domů, hráčské vs pokročilé nastavení, volitelné vizuální styly

**Drobnosti pro hráče:** koloběžka v garáži (easter egg), soutěže / žebříčky, watermark tratí, CS + EN.

---

## AI a data

Po závodě hra umí zaznamenat tempo a použít ho při kalibraci soupeřů. AI tak míří na **reálnější časy tratě**, ne jen na pevný násobič rychlosti. Solo zároveň defaultně losuje jiné typy vozidel AI (stejná kategorie jako hráč).

---

## Technické výzvy (výběr)

1. Terén na okruhu vs paralelní asfalt (overlap / „falešná voda“)  
2. Čitelnost nočního města  
3. FPS a měření výkonu ve scéně  
4. Feel AI startu vs fér cílové časy; chování motorky  
5. Ovládání a navigace na telefonu  
6. Verze jako produkt (Netlify produkce + Pages archivy)

Jak verze rostly (0.1 → 0.6) a co se u každé řešilo: **[VERSIONS.md](./VERSIONS.md)** · **[CHANGELOG.md](./CHANGELOG.md)**

---

## Lokální běh

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

**Telefon:** Nastavení → Ovládání (volant / joystick / náklon / ťukání).

### Multiplayer (zkráceně)

```bash
npm run dev:all
# host vystaví WebSocket (např. tunnel na :8787)
```

Menu **Online** → WS adresa → místnost → Ready. Max **4**.

---

## Stack

Vite · TypeScript · Three.js · `ws`

```bash
npm run build          # → dist/ (Netlify)
npm run build:pages    # → site/ (hub + archivy)
```

---

Studentský projekt. Hra obsahuje vulgární výrazy (vědomá estetika).  
**Klec GP** — značka Filipa Khunta.

Noční neon. Rovinky. Smyk.
