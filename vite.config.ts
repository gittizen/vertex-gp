import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  // Dev: `/` · production (GitHub Pages): https://gittizen.github.io/vertex-gp/
  base: command === 'build' ? '/vertex-gp/' : '/',
  server: {
    port: 5173,
    open: true,
  },
}))
