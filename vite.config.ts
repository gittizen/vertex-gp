import { defineConfig } from 'vite'

export default defineConfig({
  // Root host (Netlify / Cloudflare / vlastní doména). GH Pages: VITE_BASE=/vertex-gp/
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5173,
    open: true,
  },
})
