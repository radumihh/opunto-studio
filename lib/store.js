/* The whole database is one JSON file, read once at start and written
   whole on every change. Writes are serialised through one promise chain
   and land through a temp file + rename, so a crash mid-write leaves the
   previous file intact; the file before each write is kept as db.json.bak.
   The settings (password hashes, signing secret) live apart, in
   data/settings.json, so db.json can be committed and shared as it is.
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
    const settingsFile = path.join(dir, 'settings.json');
    let db;
    if (existsSync(file)) {
        try { db = JSON.parse(readFileSync(file, 'utf8')); }
        catch (e) {
            throw new Error('data/db.json nu poate fi citit (' + e.message + '). Restaurează din data/db.json.bak.');
        }
    }
    db = db || {};
    if (existsSync(settingsFile)) {
        try { db.settings = JSON.parse(readFileSync(settingsFile, 'utf8')); }
        catch (e) { throw new Error('data/settings.json nu poate fi citit (' + e.message + ').'); }
    }
    db = upgrade(db);

    let chain = Promise.resolve();
    let first = !existsSync(file);
    async function flush() {
        const { settings, ...shared } = db;
        await fs.writeFile(settingsFile + '.tmp', JSON.stringify(settings, null, 2));
        await fs.rename(settingsFile + '.tmp', settingsFile);
        const tmp = file + '.tmp';
        await fs.writeFile(tmp, JSON.stringify(shared, null, 2));
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
