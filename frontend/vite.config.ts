import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const backend = process.env.PORTFOLIO_DEV_BACKEND ?? 'http://localhost:8080'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/healthz': { target: backend },
      '/readyz': { target: backend },
    },
  },
  build: {
    target: 'es2022',
    cssCodeSplit: true,
    sourcemap: false,
    assetsInlineLimit: 0,
    rolldownOptions: {
      output: {
        // Vendor code changes far less often than content; keep it cacheable on its own.
        codeSplitting: {
          groups: [{ name: 'vendor', test: /node_modules[\\/](vue|@vue|vue-router)[\\/]/ }],
        },
      },
    },
  },
  ssr: {
    noExternal: ['reka-ui'],
  },
})
