/* The whole database is one JSON file, read once at start and written
   whole on every change. Writes are serialised through one promise chain
   and land through a temp file + rename, so a crash mid-write leaves the
   previous file intact. Swapping this for a real database later means
   re-implementing these few functions and nothing else. */
import fs from 'fs/promises';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

const EMPTY = () => ({
    version: 1,
    settings: { password: null, secret: crypto.randomBytes(32).toString('hex') },
    projects: []
});

export function createStore(file) {
    mkdirSync(path.dirname(file), { recursive: true });
    let db;
    if (existsSync(file)) {
        db = JSON.parse(readFileSync(file, 'utf8'));
        db.settings = db.settings || EMPTY().settings;
        if (!db.settings.secret) db.settings.secret = crypto.randomBytes(32).toString('hex');
        db.projects = db.projects || [];
    } else {
        db = EMPTY();
    }

    let chain = Promise.resolve();
    async function flush() {
        const tmp = file + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(db, null, 2));
        /* OneDrive and antivirus can hold the target for a moment on Windows */
        for (let i = 0; ; i++) {
            try { await fs.rename(tmp, file); return; }
            catch (e) {
                if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
                await new Promise(r => setTimeout(r, 60 * (i + 1)));
            }
        }
    }
    /* run a mutation and persist it; mutations never interleave */
    function write(fn) {
        const run = chain.then(async () => {
            const out = await fn(db);
            await flush();
            return out;
        });
        chain = run.catch(() => {});
        return run;
    }
    if (!existsSync(file)) write(() => {});

    return {
        read: () => db,
        write,
        projects: (site) => db.projects
            .filter(p => !site || p.site === site)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        project: (id) => db.projects.find(p => p.id === id) || null
    };
}
