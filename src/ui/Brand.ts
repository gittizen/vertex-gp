import { assetUrl } from './assetUrl'

/** Sdílený brand lockup — úvod + home menu. */
export function brandLockupHtml(opts?: { size?: 'entry' | 'menu' }): string {
  const size = opts?.size ?? 'menu'
  return `<div class="brand-lockup brand-lockup-${size}">
    <img class="brand-mark brand-mark-skate" src="${assetUrl('brand/klec-gp-logo-skate.jpg')}?v=pinkcyan" width="160" height="160" alt="KlecMania" decoding="async" />
    <div class="brand-text">
      <h1 class="brand-title"><span class="brand-klec">Klec</span><span class="brand-gp">Mania</span></h1>
    </div>
  </div>`
}
