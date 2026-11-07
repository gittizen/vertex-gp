import './style.css'
import { Game } from './game/Game'

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas')
const hud = document.querySelector<HTMLElement>('#hud')
const overlay = document.querySelector<HTMLElement>('#overlay')
const menu = document.querySelector<HTMLElement>('#menu')

if (!canvas || !hud || !overlay || !menu) {
  throw new Error('Chybí herní elementy v index.html')
}

const game = new Game(canvas, hud, overlay, menu)
game.start()
