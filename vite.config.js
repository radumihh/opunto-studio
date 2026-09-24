import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const API = 'http://127.0.0.1:' + (process.env.PORT || 4100);

/* The admin app lives in /app. In development Vite serves it on :5173 and
   hands everything else to the server, so the app, the API, the images and
   the preview pages share one origin — which is what lets the editor talk
   to the preview frame. `npm run build` writes /dist, which server.js then
   serves itself. */
export default defineConfig({
    root: path.join(ROOT, 'app'),
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': path.join(ROOT, 'app/src') } },
    server: {
        port: 5173,
        proxy: { '/api': API, '/poze': API, '/preview': API }
    },
    build: { outDir: path.join(ROOT, 'dist'), emptyOutDir: true }
});
