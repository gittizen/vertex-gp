# Prompt: znovu vytvoř Klec GP tak, jak je (v0.6)

Zkopíruj blok níže do Cursoru / jiného agenta, pokud chceš **znovu postavit tutu hru** (ne klon jiného racing template).

---

```
Postav prohlížečovou 2.5D semi-sim závodní hru „Klec GP“ (Česko, studentský projekt, 16+).

STACK
- Vite + TypeScript + Three.js (r180), bez Unity/Unreal.
- Solo AI + online multiplayer přes vlastní ws server (max 4, port 8787).
- Lokalizace CS/EN (i18n klíče).
- Build: Netlify (base /) + GitHub Pages archivy verzí (/vertex-gp/0.x/).

HERNÍ CÍL
- Pocit GTA-street / underground: čitelné tratě, punchy feedback, menu jako produkt.
- Trať = data (body křivky) → mesh silnice + berm/apron/terrain blanket + dekorace.
- Peklostroje: street, formula, moto, monster, skate, kolo…; koloběžka = easter egg (nejezdí).
- Tuning rozpočet ~250 bodů; obtížnost AI Lehká/Střední/Těžká (+ super hard).
- Freestyle triky na skate/kole (PC); mobil = klasická jízda + schémata ovládání.

TRATĚ (ukázka)
- Námko (Klecany loop), Noční Klecany (city), Do Klecánek (climb), Novostavby (rally),
  Serpentýny, Zlatý, Hrubý, Kasárny, Mexiko, Plácek (sandbox)…
- Každá mapa: vlastní theme (road/ground/fog/sky), unikátní ground textura kde dává smysl.
- Okruh: terrain blanket NESMÍ ležet na cizím úseku asfaltu (clamp laterálu); ground bez fog „navy jezera“.

AI
- AiDriver: pace slots, launchFeel per vehicle kind, leanSmooth na moto.
- CommunityLearning + PaceCalibration: po závodě posílej/ukládej tempo; AI se live kalibruje na cílové časy tratě.
- Solo default: každý závod náhodní soupeři (stejná kategorie jako hráč); toggle v nastavení.

UI/UX
- Entry splash → home dlaždice (Závod / Trať / Peklostroj / Žebříček / Nastavení).
- Atmosféra: tóny (klecany, neon, ember, ice, moss, asphalt, calendar…).
- Calendar atmosphere packs: classic/blonde/redhead/global; art per slot (bg/race/garage/tracks/settings/board).
- Klecany garage tile: tmavě modré Volvo V70 1. gen ~1999.
- Mobile: back tlačítka ve všech submenu; touch schémata v Ovládání.
- HUD: rychlost, kolo, čas, náskok/ztráta, FPS v dev.

TECHNICKÉ PASTI, KTERÉ UŽ MÁME VYŘEŠENÉ (neopakuj)
- MeshStandard + FogExp2 na velkých flat ground meshích = navy „voda“ → matGround = Basic, fog:false.
- terrainYAt / apron na loopu skáče na sousední úsek → na loopu berm Y z road crest, apron kratší + clear of road.
- FPS: měř draws AŽ PO renderu; city může jít do perf pipeline (bez ACES/bloom).
- Stíny: contact stín u auta; obří rally ground bez receiveShadow kaše.

POLISH / PRODUKT
- Version hub: VERSIONS.md, versions/0.x, build-version-pages.mjs → site/ pro GH Pages.
- CHANGELOG lidsky; README pro laiky (co, proč, jak testovat).
- Easter eggy: koloběžka dialogy, soutěže, watermark tratí, atmosférické fotky.

Výstup: hratelný npm run dev:all, české UI default, verze 0.6.0 v GameVersion.ts + package.json.
```

---

Tento prompt **není** záruka bit-identical klonu — popisuje záměr, architekturu a pasti, které v 0.6 opravdu řešíme.
