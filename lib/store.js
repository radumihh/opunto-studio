/* The whole database is one JSON file, read once at start and written
   whole on every change. Writes are serialised through one promise chain
   and land through a temp file + rename, so a crash mid-write leaves the
   previous file intact; the file before each write is kept as db.json.bak.
   Swapping this for a real database later means re-implementing these
   few functions and nothing else. */
import fs from 'fs/promises';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { defaultCategories, CATEGORY_IDS } from './defaults.js';

function upgrade(db) {
    db.version = 2;
    db.settings = db.settings || {};
    if (!db.settings.secret) db.settings.secret = crypto.randomBytes(32).toString('hex');
    if (!('password' in db.settings)) db.settings.password = null;
    if (!('admin' in db.settings)) db.settings.admin = null;
    db.projects = Array.isArray(db.projects) ? db.projects : [];
    const dflt = defaultCategories();
    db.categories = db.categories || {};
    for (const id of CATEGORY_IDS) db.categories[id] = { ...dflt[id], ...(db.categories[id] || {}) };
    return db;
}

export function createStore(dir) {
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'db.json');
    let db;
    if (existsSync(file)) {
        try { db = JSON.parse(readFileSync(file, 'utf8')); }
        catch (e) {
            throw new Error('data/db.json nu poate fi citit (' + e.message + '). Restaurează din data/db.json.bak.');
        }
    }
    db = upgrade(db || {});

    let chain = Promise.resolve();
    let first = !existsSync(file);
    async function flush() {
        const tmp = file + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(db, null, 2));
        if (!first) await fs.copyFile(file, file + '.bak').catch(() => {});
        first = false;
        /* OneDrive and antivirus can hold the target for a moment on Windows */
        for (let i = 0; ; i++) {
            try { await fs.rename(tmp, file); return; }
            catch (e) {
                if (i >= 8 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
                await new Promise(r => setTimeout(r, 60 * (i + 1)));
            }
        }
    }
    /* run a mutation and persist it; mutations never interleave. A
       mutation that throws changes nothing on disk. */
    function write(fn) {
        const run = chain.then(async () => {
            const snapshot = JSON.stringify(db);
            try {
                const out = await fn(db);
                await flush();
                return out;
            } catch (e) {
                db = JSON.parse(snapshot);
                throw e;
            }
        });
        chain = run.catch(() => {});
        return run;
    }
    write(() => {});

    return {
        file,
        read: () => db,
        write,
        idle: () => chain,
        projects: (site) => db.projects
            .filter(p => !site || p.site === site)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
        project: (id) => db.projects.find(p => p.id === id) || null
    };
}
