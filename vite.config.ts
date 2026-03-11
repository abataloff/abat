import { defineConfig } from 'vite';

const VITE_PORT = Number(process.env.VITE_PORT) || 8050;
const API_PORT = Number(process.env.PORT) || 8051;

const apiTarget = `http://localhost:${API_PORT}`;
const wsTarget = `ws://localhost:${API_PORT}`;

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
  },
  server: {
    port: VITE_PORT,
    proxy: {
      '/ws': {
        target: wsTarget,
        ws: true,
      },
      '/auth': {
        target: apiTarget,
      },
      '/api': {
        target: apiTarget,
      },
      '/admin': {
        target: apiTarget,
      },
      '/my-games': {
        target: apiTarget,
      },
      '/feedback': {
        target: apiTarget,
      },
    },
  },
});
