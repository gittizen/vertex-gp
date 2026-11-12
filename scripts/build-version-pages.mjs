/**
 * Build playable static archives into ./site/
 * GH Pages base: /vertex-gp/<ver>/
 * Public hub: 0.3 (current) → 0.2 → 0.1
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SITE = path.join(ROOT, 'site')
const WORK = path.join(ROOT, '.worktrees')

/** Newest first. `ref` = git; `id` = public folder / URL. */
const VERSIONS = [
  {
    id: '0.3',
    ref: 'HEAD',
    base: '/vertex-gp/0.3/',
    title: 'KlecMania',
    blurb: 'Career, garage paints, rear-view, settings polish.',
    current: true,
  },
  {
    id: '0.2',
    ref: '0.2',
    base: '/vertex-gp/0.2/',
    title: 'Klec GP',
    blurb: 'Klecany brand, freestyle, atmospheres.',
    notesDir: '0.2',
  },
  {
    id: '0.1',
    ref: '0.1',
    base: '/vertex-gp/0.1/',
    title: 'Vertex GP',
    blurb: 'First engine: tracks, AI, online WS.',
    notesDir: '0.1',
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

function copyScreenshot(v) {
  const notes = v.notesDir || v.id
  const srcWebp = path.join(ROOT, 'versions', notes, 'screenshot.webp')
  const srcPng = path.join(ROOT, 'versions', notes, 'screenshot.png')
  const destDir = path.join(SITE, 'shots')
  fs.mkdirSync(destDir, { recursive: true })
  if (fs.existsSync(srcWebp)) {
    fs.copyFileSync(srcWebp, path.join(destDir, `${v.id}.webp`))
    return `./shots/${v.id}.webp`
  }
  if (fs.existsSync(srcPng)) {
    fs.copyFileSync(srcPng, path.join(destDir, `${v.id}.png`))
    return `./shots/${v.id}.png`
  }
  return null
}

function writeHub() {
  const rows = VERSIONS.map((v) => {
    const shot = copyScreenshot(v)
    const badge = v.current ? ' <span class="badge">current</span>' : ''
    const img = shot
      ? `<img class="shot" src="${shot}" alt="${v.id}" loading="lazy" width="320" height="180" />`
      : ''
    return `      <tr>
        <td><a href="./${v.id}/"><code>${v.id}</code></a>${badge}</td>
        <td><strong>${v.title}</strong><br /><span class="muted">${v.blurb}</span></td>
        <td class="shot-cell">${img}<a class="btn" href="./${v.id}/">Play</a></td>
      </tr>`
  }).join('\n')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>gittizen / vertex-gp</title>
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --link: #2f81f7;
      --green: #3fb950;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
    }
    main { max-width: 920px; margin: 0 auto; padding: 32px 16px 64px; }
    header { margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid var(--border); }
    .repo { color: var(--muted); font-size: 14px; margin: 0 0 6px; }
    .repo a { color: var(--link); text-decoration: none; }
    .repo a:hover { text-decoration: underline; }
    h1 { font-size: 28px; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.02em; }
    .about { color: var(--muted); margin: 0; max-width: 40rem; }
    .meta { display: flex; flex-wrap: wrap; gap: 12px 20px; margin: 16px 0 0; color: var(--muted); font-size: 13px; }
    .meta a { color: var(--link); text-decoration: none; }
    .meta a:hover { text-decoration: underline; }
    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; background: #010409; }
    tr:last-child td { border-bottom: 0; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; }
    td a { color: var(--link); text-decoration: none; }
    td a:hover { text-decoration: underline; }
    .muted { color: var(--muted); font-size: 13px; }
    .badge {
      display: inline-block;
      margin-left: 8px;
      padding: 1px 8px;
      border-radius: 2em;
      font-size: 11px;
      font-weight: 600;
      color: #fff;
      background: var(--green);
      vertical-align: middle;
    }
    .shot-cell { white-space: nowrap; }
    .shot {
      display: inline-block;
      width: 120px;
      height: 68px;
      object-fit: cover;
      border-radius: 4px;
      border: 1px solid var(--border);
      margin-right: 10px;
      vertical-align: middle;
      background: #010409;
    }
    .btn {
      display: inline-block;
      padding: 5px 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: #21262d;
      color: var(--text) !important;
      font-weight: 600;
      font-size: 12px;
      text-decoration: none !important;
      vertical-align: middle;
    }
    .btn:hover { background: #30363d; border-color: #8b949e; }
    footer { margin-top: 24px; color: var(--muted); font-size: 12px; }
    footer a { color: var(--link); }
  </style>
</head>
<body>
  <main>
    <header>
      <p class="repo"><a href="https://github.com/gittizen">gittizen</a> / <a href="https://github.com/gittizen/vertex-gp"><strong>vertex-gp</strong></a></p>
      <h1>KlecMania</h1>
      <p class="about">Browser racing around Klecany. Playable version archives for this repo.</p>
      <p class="meta">
        <span>Author <a href="https://github.com/gittizen">@gittizen</a></span>
        <span>Prod <a href="https://klecmania.netlify.app/">Netlify</a></span>
        <span>Source <a href="https://github.com/gittizen/vertex-gp">GitHub</a></span>
      </p>
    </header>
    <table>
      <thead>
        <tr><th>Version</th><th>Notes</th><th>Play</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <footer>
      Current release is <strong>0.3</strong>. Earlier playables: <strong>0.2</strong> · <strong>0.1</strong>.
      Extra notes under <code>versions/</code> stay in the repo; experiment tags remain in git history.
    </footer>
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

  // Public id may already be full (0.0.1); don't append another ".0".
  const pkgVer = /^\d+\.\d+\.\d+$/.test(version.id) ? version.id : `${version.id}.0`
  const pkgPath = path.join(dir, 'package.json')
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    pkg.version = pkgVer
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }

  const gv = path.join(dir, 'src', 'ui', 'GameVersion.ts')
  if (fs.existsSync(gv)) {
    fs.writeFileSync(
      gv,
      `/** Distribuční verze hry (UI + package). */\nexport const GAME_VERSION = '${pkgVer}'\nexport const GAME_VERSION_SHORT = '${version.id}'\n`,
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
