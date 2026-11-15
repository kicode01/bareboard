import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base keeps the build deployable on any static host / sub-path
// (GitHub Pages, a subfolder, or the local preview server).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
