import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'glim-preview-screenshots',
      configureServer(server) {
        // Captures stay outside public/ so they are never bundled in the desktop app.
        const directory = resolve('.cache/preview-screenshots');
        server.middlewares.use('/__preview_shots', async (request, response, next) => {
          const match = /^\/([a-z0-9-]+\.png|manifest\.json)$/.exec(
            (request.url ?? '').split('?')[0],
          );
          if (!match || request.method !== 'GET') return next();
          const path = resolve(directory, match[1]);
          try {
            await access(path);
            response.setHeader(
              'Content-Type',
              match[1].endsWith('.png') ? 'image/png' : 'application/json',
            );
            response.setHeader('Cache-Control', 'no-store');
            const stream = createReadStream(path);
            stream.on('error', () => response.destroy());
            stream.pipe(response);
          } catch {
            response.statusCode = 404;
            response.end();
          }
        });
      },
    },
  ],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/.cache/**'] } },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { target: 'es2022' },
});
