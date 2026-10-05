import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // The app calls the relative path `/api`, so the browser always requests the
    // same origin it loaded from. That keeps one code path for both cases:
    // locally this proxy forwards to the backend, and through a tunnel the proxy
    // does it on this machine, so the browser never makes a cross-origin
    // request and backend CORS never comes into play.
    proxy: {
      '/api': 'http://localhost:4000',
    },
    // Vite rejects requests whose Host header it does not recognise, which is
    // exactly what a Cloudflare tunnel sends. `localhost` is always permitted
    // regardless of this list, so local development is unaffected.
    allowedHosts: [
      'quit-atmosphere-manufacturers-acrylic.trycloudflare.com',
      // Quick tunnels are assigned a random hostname each time they restart, so
      // pinning only the exact host above would break on the next restart.
      '.trycloudflare.com',
    ],
  },
})
