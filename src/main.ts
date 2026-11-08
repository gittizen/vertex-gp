import './style.css'
import { Game } from './game/Game'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#hud')
const overlay = document.querySelector<HTMLElement>('#overlay')
const menu = document.querySelector<HTMLElement>('#menu')
const entry = document.querySelector<HTMLElement>('#entry')
const mobile = document.querySelector<HTMLElement>('#mobile-controls')

if (!canvas || !hud || !overlay || !menu || !entry || !mobile) {
  throw new Error('Chybí herní elementy v index.html')
}

const game = new Game(canvas, hud, overlay, menu, entry, mobile)
game.start()
