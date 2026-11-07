import { spawn } from 'node:child_process'

function run(cmd, args) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code
  })
  return child
}

console.log('Startuji Vite + multiplayer server…')
run('npx', ['vite'])
run('node', ['server/index.mjs'])
