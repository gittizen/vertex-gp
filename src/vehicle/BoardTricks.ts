/** @deprecated — freestyle triky jsou v freestyle/FreestyleTricks.ts */
export type BoardTrickId = string
export type BoardTrickDef = {
  id: string
  dur: number
  peak: number
  spin: 'none' | 'kick' | 'heel' | 'imp' | 'shove' | 'tre' | 'laser' | 'roll' | 'yaw'
}
export const SKATE_TRICKS: BoardTrickDef[] = []
export const BIKE_TRICKS: BoardTrickDef[] = []
export class TrickComboDetector {
  reset(): void {}
  update(): null {
    return null
  }
}
export function trickById(): undefined {
  return undefined
}
