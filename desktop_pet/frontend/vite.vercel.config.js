import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vercel deployment configuration for GBTxiaotudou
// This is a simplified version for web deployment without Electron
export default defineConfig({
  plugins: [react()],
  base: '/', // Use absolute path for Vercel deployment
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Proxy configuration for local development
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/version': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/verify': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Standard web build configuration
    rollupOptions: {
      output: {
        // Use ES modules for web deployment
        format: 'es',
        manualChunks: {
          // Split vendor chunks for better caching
          vendor: ['react', 'react-dom'],
          ui: ['@headlessui/react', '@heroicons/react'],
          animations: ['framer-motion'],
        },
      },
    },
    chunkSizeWarningLimit: 2000,
    sourcemap: true, // Enable sourcemaps for debugging
  },
  define: {
    // Define environment variables for Vercel
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
    'process.env.VITE_APP_VERSION': JSON.stringify('1.21.1'),
  },
})