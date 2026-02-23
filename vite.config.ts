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
    },
  },
});
