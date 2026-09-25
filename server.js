/* OPUNTO STUDIO — the server.

   One process does five things:
     /api/auth/*     signing in to the studio (one admin password)
     /api/*          the studio's JSON API: projects, #arch rooms, uploads,
                     settings, backup
     /api/public/*   what the live sites read: published projects only, and
                     the content of protected ones only with a valid token
     /poze/*         the photos, a folder next to this file:
                     poze/architecture/<project>/1.avif … and poze/concepts/…
     /preview/*      the sites' own project pages, fed from the database,
                     so the preview is the site's code and not a copy of it
   and, after `npm run build`, the studio app itself at /.

   Storage is data/db.json (lib/store.js). Configuration: lib/config.js
   and .env.example. */
import express from 'express';
import multer from 'multer';
import { ZipArchive } from 'archiver';
import path from 'path';
import crypto from 'crypto';
import { existsSync, mkdirSync, copyFileSync } from 'fs';
import { config, ROOT, isLoopback } from './lib/config.js';
import { createStore } from './lib/store.js';
import { createImages, URL_BASE } from './lib/images.js';
import { createValidator } from './lib/validate.js';
import { TEXTURE_PRESETS, CATEGORY_IDS } from './lib/defaults.js';
import {
    hashPassword, checkPassword, tokenFor, tokenOk,
    sessionFor, sessionOk, SESSION_MAX_AGE, limiter
} from './lib/lock.js';

mkdirSync(config.uploadsDir, { recursive: true });
const store = createStore(config.dataDir);
const images = createImages(config.uploadsDir);
const { validate, validateCategory, schemas } = createValidator(path.join(ROOT, 'schema'));

/* a studio reachable from other machines must be locked */
const adminHash = () => store.read().settings.admin?.hash || envAdmin?.hash || null;
const envAdmin = config.adminPassword ? hashPassword(config.adminPassword) : null;
if (!isLoopback(config.host) && !store.read().settings.admin && !envAdmin) {
    console.error('\n  Serverul ascultă pe ' + config.host + ', dar nu are parolă de admin.\n' +
                  '  Setează ADMIN_PASSWORD în .env (vezi .env.example) și pornește din nou.\n');
    process.exit(1);
}
const authOn = () => !!adminHash();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

/* the headers every response carries */
app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    if (!req.path.startsWith('/api/public') && !req.path.startsWith(URL_BASE)) {
        res.set('X-Frame-Options', 'SAMEORIGIN');
    }
    next();
});

/* ---------------------------------------------------------------------
   AUTH — one admin password, a signed cookie for 30 days
--------------------------------------------------------------------- */
const COOKIE = 'opunto_session';
function readCookie(req, name) {
    const m = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
}
function signedIn(req) {
    if (!authOn()) return true;
    return sessionOk(readCookie(req, COOKIE), store.read().settings.secret, adminHash());
}
function setSession(req, res) {
    const secure = req.secure;
    res.cookie(COOKIE, sessionFor(store.read().settings.secret, adminHash()),
        { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_MAX_AGE, path: '/' });
}
function admin(req, res, next) {
    if (signedIn(req)) return next();
    if (req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Autentificare necesară' });
    res.status(401).send('Autentificare necesară');
}
const loginLimit = limiter({ max: 8, windowMs: 60_000 });

app.get('/api/auth/me', (req, res) => res.json({ authOn: authOn(), signedIn: signedIn(req) }));
app.post('/api/auth/login', (req, res) => {
    const lim = loginLimit(req.ip);
    if (!lim.ok) return res.status(429).json({ error: 'Prea multe încercări. Mai încearcă în ' + lim.retryAfter + ' s.' });
    const pw = String(req.body.password || '');
    const stored = store.read().settings.admin || envAdmin;
    if (!stored || !checkPassword(pw, stored)) return res.status(401).json({ error: 'Parolă greșită' });
    setSession(req, res);
    res.json({ ok: true });
});
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
});

/* ---------------------------------------------------------------------
   PROJECTS
--------------------------------------------------------------------- */
const now = () => new Date().toISOString();
const newPhotoId = () => crypto.randomBytes(9).toString('base64url');
const newId = () => {
    const a = 'abcdefghijkmnpqrstuvwxyz23456789';
    return Array.from(crypto.randomBytes(8), b => a[b % a.length]).join('');
};

function blank(site, extra = {}) {
    const base = { id: newId(), site, status: 'draft', protected: false, createdAt: now(), updatedAt: now() };
    if (site === 'arch') {
        return { ...base, category: CATEGORY_IDS.includes(extra.category) ? extra.category : 'architecture',
                 name: '', photos: [], card: { size: 'wide', photo: 1 }, inNameList: true, listName: '',
                 facts: [], texts: [], materials: { note: '', afterPhoto: null, items: [] } };
    }
    return { ...base, title: '', client: '', type: '', place: '', year: '',
             photos: [], facts: [], summary: '', story: '', approach: '', scope: [], wallSlot: null, wallHero: false };
}

/* identity and bookkeeping are the server's; everything else is the form's */
function clean(input, current) {
    const { _base, ...rest } = input || {};
    return { ...rest, id: current.id, site: current.site, order: current.order,
             createdAt: current.createdAt, updatedAt: now() };
}

/* rules that span projects, which a schema cannot see */
function crossCheck(p) {
    if (p.site !== 'concepts' || p.status !== 'published') return [];
    const errs = [];
    const others = store.projects('concepts').filter(o => o.id !== p.id && o.status === 'published');
    const taken = others.find(o => o.wallSlot && o.wallSlot === p.wallSlot);
    if (taken) errs.push({ field: 'wallSlot', message: 'Poziția ' + p.wallSlot + ' e ocupată de „' + (taken.title || 'fără nume') + '”' });
    if (p.wallHero && others.some(o => o.wallHero)) errs.push({ field: 'wallHero', message: 'Există deja un panou final publicat' });
    return errs;
}

/* FILES ON DISK CHANGE ONE REQUEST AT A TIME. Saving renumbers a
   project's photos and cleaning deletes the unused ones; two of those
   overlapping could delete a file the other just placed. */
let queue = Promise.resolve();
const serial = fn => { const r = queue.then(fn); queue = r.catch(() => {}); return r; };

/* pictures still used by a saved project, a room or an open preview stay */
function gc() {
    const db = store.read();
    return images.collect([db.projects, db.categories, [...drafts.values()].map(d => d.data)]).catch(() => 0);
}

const api = express.Router();
api.use(admin);

api.get('/schemas', (req, res) => res.json(schemas));
api.get('/projects', (req, res) => res.json(store.projects(req.query.site)));
api.get('/projects/:id', (req, res) => {
    const p = store.project(req.params.id);
    p ? res.json(p) : res.status(404).json({ error: 'Proiectul nu mai există' });
});

api.post('/projects', async (req, res) => {
    const site = req.body.site;
    if (site !== 'arch' && site !== 'concepts') return res.status(400).json({ error: 'site trebuie să fie arch sau concepts' });
    const p = await store.write(db => {
        const p = blank(site, req.body);
        const same = db.projects.filter(o => o.site === site);
        p.order = same.length ? Math.max(...same.map(o => o.order ?? 0)) + 1 : 0;
        db.projects.push(p);
        return p;
    });
    res.status(201).json(p);
});

/* SAVE. `_base` is the updatedAt the editor started from: if the project
   has been saved elsewhere since, the save is refused (409) unless the
   editor asks to overwrite (?force=1). */
api.put('/projects/:id', async (req, res) => {
    const current = store.project(req.params.id);
    if (!current) return res.status(404).json({ error: 'Proiectul a fost șters între timp' });
    if (req.body._base && req.body._base !== current.updatedAt && req.query.force !== '1') {
        return res.status(409).json({ error: 'Proiectul a fost salvat între timp din altă fereastră', current });
    }
    const next = clean(req.body, current);
    const errors = [...validate(next), ...crossCheck(next)];
    if (errors.length) return res.status(422).json({ error: 'Date invalide', errors });
    const saved = await serial(async () => {
        await images.placeProject(next, store.projects(next.site), await images.locator(store.read()));
        const saved = await store.write(db => {
            const i = db.projects.findIndex(p => p.id === current.id);
            if (i < 0) throw Object.assign(new Error('Proiectul a fost șters între timp'), { status: 404 });
            db.projects[i] = next;
            return next;
        });
        drafts.delete(saved.id);
        await gc();
        return saved;
    });
    res.json(saved);
});

api.post('/projects/:id/duplicate', async (req, res) => {
    const src = store.project(req.params.id);
    if (!src) return res.status(404).json({ error: 'Proiectul nu mai există' });
    const copy = await serial(async () => {
        const c = structuredClone(src);
        c.id = newId();
        /* the copy gets its own files, in its own folder */
        const where = await images.locator(store.read());
        const from = new Map();
        for (const ph of images.photosIn(c)) { const id = newPhotoId(); from.set(id, await where(ph.id)); ph.id = id; }
        c.status = 'draft';
        c.createdAt = c.updatedAt = now();
        if (c.site === 'arch') c.name = ((c.name || 'Proiect') + ' (copie)').slice(0, 40);
        else { c.title = ((c.title || 'Proiect') + ' (copie)').slice(0, 32); c.wallSlot = null; c.wallHero = false; }
        await images.placeProject(c, store.projects(c.site), async id => from.get(id));
        return store.write(db => {
            const same = db.projects.filter(o => o.site === c.site);
            c.order = Math.max(-1, ...same.map(o => o.order ?? 0)) + 1;
            db.projects.push(c);
            return c;
        });
    });
    res.status(201).json(copy);
});

api.delete('/projects/:id', async (req, res) => {
    const removed = await serial(async () => {
        const found = await store.write(db => {
            const i = db.projects.findIndex(p => p.id === req.params.id);
            if (i < 0) return false;
            db.projects.splice(i, 1);
            return true;
        });
        if (!found) return null;
        drafts.delete(req.params.id);
        return gc();
    });
    if (removed === null) return res.status(404).json({ error: 'Proiectul nu mai există' });
    res.json({ ok: true, imagesRemoved: removed });
});

/* the order of a whole site at once: the ids, in their new order */
api.put('/order', async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids) || !ids.every(x => typeof x === 'string')) return res.status(400).json({ error: 'ids lipsă' });
    await store.write(db => {
        ids.forEach((id, i) => { const p = db.projects.find(o => o.id === id); if (p) p.order = i; });
    });
    res.json({ ok: true });
});


/* ---------------------------------------------------------------------
   #arch ROOMS — three fixed records
--------------------------------------------------------------------- */
api.get('/categories', (req, res) => res.json(CATEGORY_IDS.map(id => store.read().categories[id])));
api.put('/categories/:id', async (req, res) => {
    const current = store.read().categories[req.params.id];
    if (!current) return res.status(404).json({ error: 'Categorie necunoscută' });
    const next = { ...req.body, id: current.id, order: current.order };
    const errors = validateCategory(next);
    if (errors.length) return res.status(422).json({ error: 'Date invalide', errors });
    await serial(async () => {
        await images.placeCategory(next, await images.locator(store.read()));
        await store.write(db => { db.categories[current.id] = next; });
        await gc();
    });
    res.json(next);
});

/* ---------------------------------------------------------------------
   TEXTURES — the site's four, then every texture already used
--------------------------------------------------------------------- */
api.get('/textures', (req, res) => {
    const seen = new Set(TEXTURE_PRESETS.map(t => t.image.id));
    const used = [];
    for (const p of store.projects('arch')) {
        for (const m of (p.materials && p.materials.items) || []) {
            if (!m.image || seen.has(m.image.id)) continue;
            seen.add(m.image.id);
            used.push({ name: m.name, image: m.image, from: p.name });
        }
    }
    res.json({ presets: TEXTURE_PRESETS, used });
});

/* ---------------------------------------------------------------------
   UPLOADS — processed in memory, only the two finished files touch disk
--------------------------------------------------------------------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 60 * 1024 * 1024, files: 10 },
    /* the type is decided by sharp, not by the browser's guess: a .webp
       often arrives as application/octet-stream */
    fileFilter: (req, file, cb) => cb(null, true)
});
api.post('/uploads', upload.array('files', 10), async (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ error: 'Nicio imagine în cerere' });
    const out = [];
    for (const f of files) {
        try { out.push({ ...(await images.ingest(f.buffer)), name: f.originalname }); }
        catch (e) { out.push({ error: e.message, name: f.originalname }); }
    }
    res.json(out);
});

/* ---------------------------------------------------------------------
   SETTINGS
--------------------------------------------------------------------- */
api.get('/settings', (req, res) => {
    const s = store.read().settings;
    res.json({ hasPassword: !!s.password, hasAdmin: !!(s.admin || envAdmin), adminFromEnv: !s.admin && !!envAdmin });
});
api.put('/settings/password', async (req, res) => {
    const pw = String(req.body.password || '');
    if (pw && pw.length < 4) return res.status(422).json({ error: 'Parola trebuie să aibă minim 4 caractere' });
    await store.write(db => { db.settings.password = pw ? hashPassword(pw) : null; });
    res.json({ hasPassword: !!pw });
});
api.put('/settings/admin', async (req, res) => {
    const { current = '', next = '' } = req.body || {};
    const stored = store.read().settings.admin || envAdmin;
    if (stored && !checkPassword(String(current), stored)) return res.status(403).json({ error: 'Parola actuală e greșită' });
    if (String(next).length < 8) return res.status(422).json({ error: 'Parola nouă trebuie să aibă minim 8 caractere' });
    await store.write(db => { db.settings.admin = hashPassword(String(next)); });
    setSession(req, res);
    res.json({ ok: true });
});
/* THE WHOLE PORTFOLIO, to send: one .zip laid out like the repo —
     data/db.json   every project and the #arch rooms (no passwords)
     poze/…         every photo they use, in its project's folder
   Unzipped over an Opunto Studio folder, it is that portfolio. Photos are
   already compressed, so the zip only stores them. */
api.get('/export', (req, res, next) => {
    serial(() => new Promise((resolve) => {
        const db = structuredClone(store.read());
        delete db.settings;
        const files = new Set();
        for (const ph of images.photosIn([db.projects, db.categories])) {
            const rel = images.relOf(ph.src);
            if (rel.startsWith('_incoming/')) continue;
            files.add(rel); files.add(rel.replace(/\.avif$/, '.sm.webp'));
        }
        const count = site => db.projects.filter(p => p.site === site).length;
        const zip = new ZipArchive({ store: true });
        res.set('Content-Type', 'application/zip');
        res.set('Content-Disposition', 'attachment; filename="opunto-portofoliu-' + new Date().toLocaleDateString('sv-SE') + '.zip"');
        zip.on('warning', e => console.warn('export: ' + e.message));
        zip.on('error', e => { resolve(); next(e); });
        res.on('close', resolve);
        zip.pipe(res);
        zip.append(JSON.stringify(db, null, 2), { name: 'data/db.json' });
        for (const rel of [...files].sort()) {
            const file = path.join(config.uploadsDir, ...rel.split('/'));
            if (existsSync(file)) zip.file(file, { name: 'poze/' + rel });
        }
        zip.append([
            'Portofoliu Opunto, exportat ' + new Date().toLocaleString('ro-RO'),
            '',
            count('arch') + ' proiecte #arch, ' + count('concepts') + ' proiecte #concepts, ' + (files.size / 2) + ' poze.',
            '',
            'data/db.json  toate proiectele și textele (JSON)',
            'poze/         toate pozele, câte un folder pe proiect: poze/architecture/<proiect>/1.avif …',
            '',
            'Se dezarhivează peste folderul Opunto Studio (înlocuiește data/db.json și poze/).'
        ].join('\r\n'), { name: 'CITESTE.txt' });
        zip.finalize();
    })).catch(next);
});

/* the whole database as a file; the photos are in poze/ */
api.get('/backup', (req, res) => {
    const db = structuredClone(store.read());
    delete db.settings;
    res.set('Content-Disposition', 'attachment; filename="opunto-studio-' + now().slice(0, 10) + '.json"');
    res.json(db);
});

/* ---------------------------------------------------------------------
   PREVIEW — unsaved edits, held in memory, laid over the saved project
   they were started from (and dropped once that project changes)
--------------------------------------------------------------------- */
const drafts = new Map();
api.put('/preview/draft/:id', (req, res) => {
    const current = store.project(req.params.id);
    if (!current) return res.status(404).json({ error: 'Proiectul nu mai există' });
    const { _base, ...data } = req.body || {};
    drafts.set(current.id, { base: _base || current.updatedAt, at: Date.now(),
        data: { ...data, id: current.id, site: current.site, order: current.order } });
    res.json({ ok: true });
});
api.delete('/preview/draft/:id', (req, res) => { drafts.delete(req.params.id); res.json({ ok: true }); });
api.get('/preview/data', (req, res) => {
    const list = store.projects(req.query.site).map(p => {
        const d = drafts.get(p.id);
        return d && d.base === p.updatedAt ? { ...d.data, order: p.order } : p;
    });
    const db = store.read();
    res.json({ projects: list, categories: CATEGORY_IDS.map(id => db.categories[id]), hasPassword: !!db.settings.password });
});
/* drafts nobody has touched for a day are dropped */
setInterval(() => {
    for (const [id, d] of drafts) if (Date.now() - d.at > 864e5) drafts.delete(id);
}, 3600e3).unref();

/* ---------------------------------------------------------------------
   PUBLIC — what the live sites read
--------------------------------------------------------------------- */
const unlockLimit = limiter({ max: 10, windowMs: 60_000 });
function publicCors(req, res, next) {
    const origin = req.get('Origin');
    const all = config.publicOrigins.includes('*');
    if (all) res.set('Access-Control-Allow-Origin', '*');
    else if (origin && config.publicOrigins.includes(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Unlock');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
}
/* what a locked project still shows: enough for its card and its cell */
function redact(p) {
    const keep = p.site === 'arch'
        ? { name: p.name, category: p.category, card: p.card, inNameList: p.inNameList, listName: p.listName,
            photos: [p.photos[((p.card && p.card.photo) || 1) - 1] || p.photos[0]].filter(Boolean) }
        : { title: p.title, type: p.type, place: p.place, year: p.year, wallSlot: p.wallSlot,
            wallHero: p.wallHero, photos: p.photos.slice(0, 1) };
    return { id: p.id, site: p.site, order: p.order, protected: true, locked: true, ...keep };
}
function publicList(site, open) {
    return store.projects(site)
        .filter(p => p.status === 'published')
        .map(({ createdAt, ...p }) => (p.protected && !open) ? redact(p) : p);
}
const pub = express.Router();
pub.use(publicCors);
pub.post('/unlock', (req, res) => {
    const lim = unlockLimit(req.ip);
    if (!lim.ok) return res.status(429).json({ error: 'Too many attempts. Try again in ' + lim.retryAfter + ' s.' });
    const s = store.read().settings;
    if (!checkPassword(String(req.body.password || ''), s.password)) return res.status(401).json({ error: 'Wrong password' });
    res.json({ token: tokenFor(s) });
});
pub.get('/arch/categories', (req, res) => {
    res.set('Cache-Control', 'no-cache').json(CATEGORY_IDS.map(id => store.read().categories[id]));
});
pub.get('/:site(arch|concepts)', (req, res) => {
    const open = tokenOk(req.get('X-Unlock') || req.query.token, store.read().settings);
    res.set('Cache-Control', 'no-cache').json(publicList(req.params.site, open));
});
app.use('/api/public', pub);
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rută necunoscută' }));

/* ---------------------------------------------------------------------
   STATIC
--------------------------------------------------------------------- */
/* the file names repeat (1.avif, 2.avif …) but every URL carries ?v=<photo id>,
   so a URL always means the same picture and can be cached for good */
app.use(URL_BASE, (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); },
    express.static(config.uploadsDir, { immutable: true, maxAge: '365d', fallthrough: false,
        setHeaders: (res, file) => { if (file.endsWith('.avif')) res.type('image/avif'); } }));
app.use('/preview', admin, express.static(path.join(ROOT, 'preview'), { extensions: ['html'], maxAge: 0 }));

const DIST = path.join(ROOT, 'dist');
if (existsSync(DIST)) {
    app.use('/assets', express.static(path.join(DIST, 'assets'), { immutable: true, maxAge: '365d' }));
    app.use(express.static(DIST, { index: false, maxAge: 0 }));
    app.get(/^\/(?!api\/|poze\/|preview\/).*/, (req, res) => {
        res.set('Cache-Control', 'no-cache').sendFile(path.join(DIST, 'index.html'));
    });
}

app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' ? 413 : err.type === 'entity.too.large' ? 413 : 500);
    if (status >= 500) console.error(err);
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fișier prea mare (max 60 MB)'
        : err.code === 'LIMIT_FILE_COUNT' ? 'Prea multe fișiere într-o cerere'
        : status === 404 && req.path.startsWith(URL_BASE) ? 'Imagine inexistentă'
        : status >= 500 ? 'Eroare internă. Detaliile sunt în jurnalul serverului.' : (err.message || 'Eroare');
    if (res.headersSent) return;
    req.path.startsWith('/api') ? res.status(status).json({ error: msg }) : res.status(status).send(msg);
});

/* ON START: every picture in its project's folder. Also brings over a
   database from the old flat layout (uploads/<id>.avif). */
await serial(async () => {
    const legacy = path.join(ROOT, 'uploads');
    const db = store.read();
    let changed = false;
    for (const ph of legacyPhotos(db)) {
        const file = path.join(legacy, ph.id + '.avif');
        if (!existsSync(file)) continue;
        mkdirSync(path.join(config.uploadsDir, '_incoming'), { recursive: true });
        copyFileSync(file, path.join(config.uploadsDir, '_incoming', ph.id + '.avif'));
        const sm = path.join(legacy, ph.id + '.sm.webp');
        if (existsSync(sm)) copyFileSync(sm, path.join(config.uploadsDir, '_incoming', ph.id + '.sm.webp'));
        ph.src = URL_BASE + '_incoming/' + ph.id + '.avif';
        ph.sm = URL_BASE + '_incoming/' + ph.id + '.sm.webp';
        changed = true;
    }
    const where = await images.locator(db);
    for (const p of db.projects) {
        const before = JSON.stringify(p);
        await images.placeProject(p, db.projects, where).catch(e => console.warn('  ' + (p.name || p.title || p.id) + ': ' + e.message));
        if (JSON.stringify(p) !== before) changed = true;
    }
    for (const c of Object.values(db.categories)) {
        const before = JSON.stringify(c);
        await images.placeCategory(c, where).catch(() => {});
        if (JSON.stringify(c) !== before) changed = true;
    }
    if (changed) await store.write(d => { d.projects = db.projects; d.categories = db.categories; });
    await gc();
});
function legacyPhotos(db) {
    const out = [];
    const walk = v => {
        if (!v || typeof v !== 'object') return;
        if (Array.isArray(v)) return v.forEach(walk);
        if (v.id && typeof v.src === 'string' && v.src.startsWith('/uploads/')) out.push(v);
        Object.values(v).forEach(walk);
    };
    walk([db.projects, db.categories]);
    return out;
}

const server = app.listen(config.port, config.host, () => {
    const url = 'http://' + (config.host === '0.0.0.0' ? 'localhost' : config.host) + ':' + config.port;
    console.log('Opunto Studio  ' + url + (existsSync(DIST) ? '' : '  (API; aplicația rulează prin `npm run dev` pe :5173)') +
        (authOn() ? '' : '  — fără parolă de admin (doar local)'));
});

/* STOPPING: finish the write in progress, then exit */
function stop(sig) {
    console.log('\n' + sig + ': se oprește…');
    server.close();
    store.idle().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
