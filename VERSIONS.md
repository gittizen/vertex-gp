# Klec GP / Vertex GP — verze a jak jsme o tom přemýšleli

Historie zůstává v gitu (staré commity se nemažou). Každá veřejná verze je **update navrch**, ne přepis minulosti.

---

## 0.4 — Vertex GP (základ)

**Cíl:** prohlížečová 2.5D semi-sim, kterou jde hrát solo i online, bez těžkého enginu.

**Jak jsme přemýšleli**
- Vite + TypeScript + Three.js — rychlý start, jeden stack, žádný Unity build.
- Tratě jako data (`TrackDefs`) + vlastní mesh generátor — lehké mapy, ne asset-heavy levely.
- AI difficulty odděleně od fyziky — stejné peklostroje, jiný „tlak“.
- Online: vlastní `ws` server u hostitele (max 4), tunnel ven (Cloudflare). Kamarádi neběží „cloud race“, ale peer přes hosta — levné a kontrolovatelné.
- Tuning rozpočet + barvy — personalizace bez lootboxů.

**Co to bylo**
- Tři+ tratě, AI Lehká/Střední/Těžká, solo restart, lobby + odkaz do místnosti.
- Veřejný commit: *Launch Vertex GP…* — první „to jde pustit kamarádům“ milestone.

**Postup vydání**
1. Lokální `dev:all` (hra + WS).
2. Ověřit solo + lobby.
3. Commit na `master` (bez mazání historie).
4. Tag / poznámka v README jako **0.4**.

---

## 1.0 — Klec GP (identita + hloubka)

**Cíl:** z Vertex GP udělat **Klec GP** — domácí značka, freestyle, atmosféra, menu jako produkt, ne debug UI.

**Jak jsme přemýšleli**
- Rebrand (logo skate, intro s gameplay BG, watermark tratí) — první viewport musí říct „Klec“, ne generický neon race.
- Freestyle (skate/kolo, Plácek sandbox, triky A–Z) vedle klasického závodu — stejný svět, jiný skill ceiling.
- Atmosféra menu (Klecany / Česko / neon / asfalt / kalendář + packs) — stejné rozložení, jiný nádech; žádný steel/violet clutter.
- Online hub (presence, rooms, ready, laps) — browse místností místo jen „zadej kód“.
- Hostování: nejdřív GitHub Pages (`/vertex-gp/`) jako free static; multiplayer server dál u hráče.

**Co jsme ladili**
- Entry BG moc agresivní → světlejší dusk + měkčí watermark.
- Online: leave lobby nesmí shodit celý hub; browse nesmí spamovat reconnect při každém renderu.
- Verze v UI (`GAME_VERSION`) sjednocená s `package.json`.

**Postup vydání**
1. Typecheck + ruční průchod (entry → race modes → online lobby).
2. Build s `base` pro Pages.
3. Commit **1.0** na `master` (nad 0.4), tag `v1.0.0`.
4. GitHub Actions → Pages. Starý 0.4 commit zůstává.

---

## 1.1 — Dotyk + hosting mimo omezenou GH doménu

**Cíl:** hrátelnost na telefonu/tabletu + web, kde jde vlastní doména bez GH Pages limitů.

**Jak jsme přemýšleli**
- Na mobilu **jen klasická jízda** — triky a freestyle vyžadují klávesy; nutit je na touch = frustrující. Boost (Tab) ano, jako velké tlačítko.
- Režimy řízení jako ve formulích na telefonu, přepínatelné v Ovládání (stejný pattern jako skate/kolo):
  - **Volant + pedály** — default, známé z mobilních F1.
  - **Joystick** — stick řízení, plyn/brzda vpravo.
  - **Náklon** — auto plyn, DeviceOrientation, brzda tlačítkem.
  - **Ťukání stran** — auto plyn, L/R řízení, střed brzda.
- Ovládání UI: pryč potemnělý sticky header / duplicitní eyebrow.
- GitHub Pages má omezenou doménu → build na root `base: /` a deploy na **Netlify** (claim + custom domain). GH zůstává zdroják + historie verzí.

**Postup vydání**
1. Mobilní schémata + i18n varování + force classic na phone.
2. `npm run build` (root base).
3. Volitelně Netlify Drop / claim.
4. Commit **1.1** na `master` (nad 1.0), tag `v1.1.0` — nic staršího se nemaže.

---

## Pravidlo pro další verze

- **Nepřepisovat** staré tagy / force-push historii kvůli „úklidu“.
- README + tento soubor: krátce *proč*, ne jen changelog diff.
- UI verze = `src/ui/GameVersion.ts` + `package.json`.
