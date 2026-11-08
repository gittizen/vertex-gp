/** Veřejné assety s Vite `base` (GitHub Pages `/vertex-gp/`). */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const clean = path.replace(/^\//, '')
  return `${base}${clean}`
}
