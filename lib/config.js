/* Everything the server reads from the environment, in one place.
   See .env.example for what each one does. */
import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/* a .env next to server.js is read if present; real environment wins */
const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!m || m[1] in process.env) continue;
        process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
}

const abs = (p, dflt) => path.resolve(ROOT, p || dflt);

export const config = {
    port: +process.env.PORT || 4100,
    host: process.env.HOST || '127.0.0.1',
    dataDir: abs(process.env.DATA_DIR, 'data'),
    uploadsDir: abs(process.env.UPLOADS_DIR, 'poze'),
    /* bootstrap admin password; once one is set in Settings, that one wins */
    adminPassword: process.env.ADMIN_PASSWORD || '',
    /* behind nginx/caddy with HTTPS: 1, so cookies are Secure and the
       client IP comes from X-Forwarded-For */
    trustProxy: process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true',
    /* sites allowed to call /api/public/* from the browser; * for any */
    publicOrigins: (process.env.PUBLIC_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean)
};

export const isLoopback = h => ['127.0.0.1', 'localhost', '::1'].includes(h);
