import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Production API URL - localtunnel to Mac mini backend
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL || 'https://fef7b5dca274b978-98-97-87-235.serveousercontent.com'
    )
  },
  server: {
    port: 3002,
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true
      }
    }
  }
})
