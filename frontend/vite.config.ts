import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { examApi } from './scripts/exam-api.mjs'

export default defineConfig({
  plugins: [react(), examApi()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
