import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: './', // Relative paths for extension
  build: {
    outDir: resolve(__dirname, '../extension/src/dashboard'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    open: true
  }
})
