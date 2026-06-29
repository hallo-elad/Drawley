import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Drawley build configuration.
// `base: './'` keeps asset paths relative so the production build works when
// hosted from any sub-path (GitHub Pages, Netlify, static folders, etc.).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
