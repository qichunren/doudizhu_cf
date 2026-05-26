import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: '',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:8787',
        ws: true,
      },
      '/room': {
        target: 'http://localhost:8787',
        ws: true,
      },
    },
  },
})
