import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// dev: /api ส่งต่อไปยัง `wrangler pages dev` (พอร์ต 8788) ซึ่งรัน Pages Function proxy
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    proxy: { '/api': 'http://127.0.0.1:8788' },
  },
})
