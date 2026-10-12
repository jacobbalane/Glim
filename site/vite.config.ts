import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Glim's website. Its own dev server and build, apart from the desktop app on port 1420.
export default defineConfig({
  root: here('.'),
  // Relative URLs, so the same build works at a domain root or under a project path.
  base: './',
  publicDir: here('../public'),
  plugins: [react()],
  server: { host: '127.0.0.1', port: 3000, strictPort: true, fs: { allow: [here('..')] } },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: here('index.html'),
        docs: here('docs/index.html'),
        changelog: here('changelog/index.html'),
      },
    },
  },
});
