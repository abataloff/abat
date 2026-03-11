import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 8050,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8051',
        ws: true,
      },
      '/auth': {
        target: 'http://localhost:8051',
      },
      '/api': {
        target: 'http://localhost:8051',
      },
      '/admin': {
        target: 'http://localhost:8051',
      },
      '/my-games': {
        target: 'http://localhost:8051',
      },
      '/feedback': {
        target: 'http://localhost:8051',
      },
    },
  },
});
