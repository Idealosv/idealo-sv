import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('tesseract.js')) return 'ocr'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react')) return 'react-vendor'
          if (id.includes('qrcode')) return 'qrcode'
          return 'vendor'
        },
      },
    },
  },
})
