/**
 * Build playable static sites for archives into ./site/
 * GH Pages base: /vertex-gp/<ver>/  (repo slug zůstává kvůli starým archivům)
 * Hub karty: nejnovější první → nejstarší poslední.
 * Staré refy se nepřepisují — jen se z nich znovu sestaví stejný archiv + přidá aktuální.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SITE = path.join(ROOT, 'site')
const WORK = path.join(ROOT, '.worktrees')

/** Pořadí: nejnovější → nejstarší (hub i build log). */
const VERSIONS = [
  {
    id: '0.8',
    ref: 'HEAD',
    base: '/vertex-gp/0.8/',
    title: '0.8 — race setup + LB',
    blurb: 'Závod setup, nesmrtelnost 👻, cloud žebříček, Volvo V70 dlaždice.',
    current: true,
  },
  {
    id: '0.7',
    ref: 'v0.7.0',
    base: '/vertex-gp/0.7/',
    title: '0.7 — KlecMania',
    blurb: 'KlecMania + Space drift brzda, mute, bike boost, Tarantino Klecany.',
  },
  {
    id: '0.6',
    ref: 'v0.6.0',
    base: '/vertex-gp/0.6/',
    title: '0.6 — UX + zvuk',
    blurb: 'Jet CTA, dock Zpět, engine SFX, landscape-first.',
  },
  {
    id: '0.5',
    ref: '0.5',
    base: '/vertex-gp/0.5/',
    title: '0.5 — AI + demo polish',
    blurb: 'Live tempo AI, náhodní soupeři, kalendář, lidské docs.',
  },
  {
    id: '0.4',
    ref: '0.4',
    base: '/vertex-gp/0.4/',
    title: '0.4 — reálnější svět',
    blurb: 'Okolí silnice, terén, unikátní mapy, stíny bez děr.',
  },
  {
    id: '0.3',
    ref: '0.3',
    base: '/vertex-gp/0.3/',
    title: '0.3 — mobil + polish',
    blurb: 'Dotyk, Netlify, pace learning, šampionát, archivy verzí.',
  },
  {
    id: '0.2',
    ref: '0.2',
    base: '/vertex-gp/0.2/',
    title: '0.2 — Klec GP',
    blurb: 'Značka Klecany, freestyle/Plácek, atmosféry, online hub.',
  },
  {
    id: '0.1',
    ref: '0.1',
    base: '/vertex-gp/0.1/',
    title: '0.1 — Vertex GP',
    blurb: 'Začátek: engine, tratě z dat, AI, online WS, tuning.',
  },
]

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', shell: true, ...opts })
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true })
}

function copyScreenshot(versionId) {
  const srcWebp = path.join(ROOT, 'versions', versionId, 'screenshot.webp')
  const srcPng = path.join(ROOT, 'versions', versionId, 'screenshot.png')
  const destDir = path.join(SITE, 'shots')
  fs.mkdirSync(destDir, { recursive: true })
  if (fs.existsSync(srcWebp)) {
    fs.copyFileSync(srcWebp, path.join(destDir, `${versionId}.webp`))
    return `./shots/${versionId}.webp`
  }
  if (fs.existsSync(srcPng)) {
    fs.copyFileSync(srcPng, path.join(destDir, `${versionId}.png`))
    return `./shots/${versionId}.png`
  }
  return null
}

function writeHub() {
  const cards = VERSIONS.map((v) => {
    const shot = copyScreenshot(v.id)
    const img = shot
      ? `<img class="shot" src="${shot}" alt="Gameplay ${v.id}" loading="lazy" />`
      : `<div class="shot shot-empty">bez screenshotu</div>`
    return `    <a class="card" href="./${v.id}/">
      ${img}
      <span class="ver">${v.id}</span>
      <strong>${v.title}</strong>
      <p>${v.blurb}</p>
      <span class="play">Hrát →</span>
    </a>`
  }).join('\n')

  const html = `<!doctype html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KlecMania · verze</title>
  <style>
    :root {
      --bg0: #0a0c10;
      --bg1: #12161e;
      --ink: #e8edf5;
      --muted: #9aa6b8;
      --line: #2a3344;
      --accent: #e6b422;
      --blood: #c8102e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", "Trebuchet MS", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(900px 420px at 12% -10%, #1a2436 0%, transparent 55%),
        radial-gradient(700px 380px at 90% 0%, #2a1810 0%, transparent 50%),
        linear-gradient(180deg, var(--bg1), var(--bg0));
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 3rem 1.25rem 4rem;
    }
    h1 {
      font-size: clamp(1.8rem, 4vw, 2.6rem);
      letter-spacing: 0.04em;
      margin: 0 0 0.4rem;
    }
    .sub { color: var(--muted); margin: 0 0 2rem; max-width: 42rem; line-height: 1.5; }
    .grid {
      display: grid;
      gap: 1rem;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 0.45rem;
      padding: 0;
      overflow: hidden;
      border: 1px solid var(--line);
      background: rgba(14, 18, 26, 0.72);
      color: inherit;
      text-decoration: none;
      transition: border-color 0.15s, transform 0.15s;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .shot {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      object-fit: cover;
      background: #0e1218;
      border-bottom: 1px solid var(--line);
    }
    .shot-empty {
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 0.85rem;
    }
    .card .ver, .card strong, .card p, .card .play {
      padding-left: 1.15rem;
      padding-right: 1.15rem;
    }
    .card .ver { padding-top: 0.9rem; }
    .card .play { padding-bottom: 1.15rem; }
    .ver {
      font-size: 0.75rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }
    .card p { margin: 0; color: var(--muted); font-size: 0.92rem; line-height: 1.45; flex: 1; }
    .play { margin-top: 0.35rem; font-size: 0.9rem; color: var(--ink); }
    .note {
      margin-top: 2rem;
      padding-top: 1rem;
      border-top: 1px solid var(--line);
      color: var(--muted);
      font-size: 0.9rem;
      line-height: 1.5;
    }
    .note a { color: var(--accent); }
  </style>
</head>
<body>
  <main>
    <h1>KlecMania</h1>
    <p class="sub">Hratelné archivy — nejnovější nahoře, nejstarší dole. Příběh změn je ve VERSIONS.md v repu. Aktuální archiv: <strong>0.8</strong> (Netlify produkce zatím 0.7).</p>
    <div class="grid">
${cards}
    </div>
    <p class="note">
      Aktuální produkce (Netlify):
      <a href="https://klecmania.netlify.app/">klecmania.netlify.app</a>
      · zdroj:
      <a href="https://github.com/gittizen/KlecMania">gittizen/KlecMania</a>
      · hub URL (historicky):
      <a href="https://gittizen.github.io/vertex-gp/">gittizen.github.io/vertex-gp</a>
    </p>
  </main>
</body>
</html>
`
  fs.writeFileSync(path.join(SITE, 'index.html'), html, 'utf8')
}

function patchHistoricalTree(dir, version) {
  const vitePath = path.join(dir, 'vite.config.ts')
  const viteJs = path.join(dir, 'vite.config.js')
  const target = fs.existsSync(vitePath) ? vitePath : viteJs
  if (fs.existsSync(target)) {
    fs.writeFileSync(
      target,
      `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  base: '${version.base}',\n  server: { port: 5173, open: true },\n})\n`,
      'utf8',
    )
  }

  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.version = `${version.id}.0`
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }

  const gv = path.join(dir, 'src', 'ui', 'GameVersion.ts')
  if (fs.existsSync(gv)) {
    fs.writeFileSync(
      gv,
      `/** Distribuční verze hry (UI + package). */\nexport const GAME_VERSION = '${version.id}.0'\nexport const GAME_VERSION_SHORT = '${version.id}'\n`,
      'utf8',
    )
  } else {
    const entry = path.join(dir, 'src', 'ui', 'Entry.ts')
    if (fs.existsSync(entry)) {
      let src = fs.readFileSync(entry, 'utf8')
      src = src.replace(/v0\.\d+/g, `v${version.id}`).replace(/v1\.\d+/g, `v${version.id}`)
      if (!src.includes(`v${version.id}`)) {
        src = src.replace(
          /class="entry-version">[^<]</,
          `class="entry-version">v${version.id}<`,
        )
      }
      fs.writeFileSync(entry, src, 'utf8')
    }
  }
}

function buildCurrent(version) {
  run('npm run build', {
    cwd: ROOT,
    env: { ...process.env, VITE_BASE: version.base },
  })
  const dest = path.join(SITE, version.id)
  rmrf(dest)
  copyDir(path.join(ROOT, 'dist'), dest)
}

function buildFromRef(version) {
  fs.mkdirSync(WORK, { recursive: true })
  const dir = path.join(WORK, version.id)
  try {
    run(`git worktree remove -f "${dir}"`, { cwd: ROOT })
  } catch {
    /* no existing worktree */
  }
  rmrf(dir)
  run(`git worktree add --detach "${dir}" ${version.ref}`, { cwd: ROOT })
  patchHistoricalTree(dir, version)
  run('npm ci', { cwd: dir })
  try {
    run('npm run build', {
      cwd: dir,
      env: { ...process.env, VITE_BASE: version.base },
    })
  } catch {
    console.warn(`tsc+build failed for ${version.id}, falling back to vite build`)
    run('npx vite build', {
      cwd: dir,
      env: { ...process.env, VITE_BASE: version.base },
    })
  }
  const dest = path.join(SITE, version.id)
  rmrf(dest)
  copyDir(path.join(dir, 'dist'), dest)
  try {
    run(`git worktree remove -f "${dir}"`, { cwd: ROOT })
  } catch {
    /* keep going */
  }
}

rmrf(SITE)
fs.mkdirSync(SITE, { recursive: true })

for (const v of VERSIONS) {
  console.log(`\n=== Building ${v.id} (${v.ref}) base=${v.base} ===`)
  if (v.current) buildCurrent(v)
  else buildFromRef(v)
}

writeHub()
console.log(`\nDone → ${SITE}`)
for (const v of VERSIONS) {
  console.log(`  ${v.id}: ${path.join(SITE, v.id, 'index.html')}`)
}
