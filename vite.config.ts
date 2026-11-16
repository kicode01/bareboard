import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Relative base keeps the build deployable on any static host / sub-path
// (GitHub Pages, a subfolder, or the local preview server).
export default defineConfig({
  base: './',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('@base-ui')) return 'vendor-baseui';
            if (id.includes('vaul') || id.includes('@radix-ui') || id.includes('cmdk') || id.includes('@tanstack')) {
              return 'vendor-interactive';
            }
            return 'vendor';
          }
        },
      },
    },
  },
});
