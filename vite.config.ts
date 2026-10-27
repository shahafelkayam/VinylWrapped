import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app is served from GitHub Pages under /<repo>/ and uses hash routing,
// so a relative base works no matter what the repository is called.
export default defineConfig({
  root: 'web',
  base: './',
  envDir: '..',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
