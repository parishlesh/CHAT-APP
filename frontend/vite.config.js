import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than app code; separate files let browsers keep them cached across deploys.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          realtime: ['socket.io-client', 'axios'],
        },
      },
    },
  },
})
