/* OPUNTO STUDIO — the server.

   One process does four things:
     /api/*          the admin's JSON API (projects, uploads, settings)
     /api/public/*   what the live sites read: published projects only, and
                     the content of protected ones only with a valid token
     /uploads/*      the processed images, a folder next to this file
     /preview/*      the sites' own project pages, fed from the database,
                     so the preview is the site's code and not a copy of it
   and, after `npm run build`, the admin app itself at /.

   Storage is data/db.json (see lib/store.js). */
import express from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { createStore } from './lib/store.js';
import { createImages } from './lib/images.js';
import { createValidator } from './lib/validate.js';
import { hashPassword, checkPassword, tokenFor, tokenOk } from './lib/lock.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 4100;
const HOST = process.env.HOST || '127.0.0.1';
const UPLOADS = path.join(ROOT, 'uploads');

const store = createStore(path.join(ROOT, 'data', 'db.json'));
const images = createImages(UPLOADS);
const { validate, schemas } = createValidator(path.join(ROOT, 'schema'));

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

/* ---------------------------------------------------------------------
   OPTIONAL ADMIN LOCK. Unset, the admin is open — it listens on
   127.0.0.1 only. Set ADMIN_PASSWORD before putting it anywhere else.
--------------------------------------------------------------------- */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
function admin(req, res, next) {
    if (!ADMIN_PASSWORD) return next();
    const [, b64] = (req.headers.authorization || '').split(' ');
    const [, pw] = Buffer.from(b64 || '', 'base64').toString().split(':');
    const a = Buffer.from(pw || ''), b = Buffer.from(ADMIN_PASSWORD);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
    res.set('WWW-Authenticate', 'Basic realm="Opunto Studio"').status(401).send('Autentificare necesară');
}

/* ---------------------------------------------------------------------
   PROJECTS
--------------------------------------------------------------------- */
const now = () => new Date().toISOString();
const newId = () => crypto.randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').toLowerCase();

function blank(site, extra = {}) {
    const base = { id: newId(), site, status: 'draft', protected: false, createdAt: now(), updatedAt: now() };
    if (site === 'arch') {
        return { ...base, category: extra.category || 'architecture', name: extra.name || '', photos: [],
                 card: { size: 'wide', photo: 1 }, inNameList: true, facts: [], texts: [],
                 materials: { note: '', afterPhoto: null, items: [] } };
    }
    return { ...base, title: extra.title || extra.name || '', client: '', type: '', place: '', year: '',
             photos: [], facts: [], summary: '', story: '', approach: '', scope: [], wallSlot: null, wallHero: false };
}

/* the fields a client may not set: identity and bookkeeping */
function clean(input, current) {
    const out = { ...input };
    out.id = current.id;
    out.site = current.site;
    out.order = current.order;
    out.createdAt = current.createdAt;
    out.updatedAt = now();
    return out;
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

app.get('/api/schemas', admin, (req, res) => res.json(schemas));

app.get('/api/projects', admin, (req, res) => res.json(store.projects(req.query.site)));

app.get('/api/projects/:id', admin, (req, res) => {
    const p = store.project(req.params.id);
    p ? res.json(p) : res.status(404).json({ error: 'Proiect inexistent' });
});

app.post('/api/projects', admin, async (req, res) => {
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

app.put('/api/projects/:id', admin, async (req, res) => {
    const current = store.project(req.params.id);
    if (!current) return res.status(404).json({ error: 'Proiect inexistent' });
    const next = clean(req.body, current);
    const errors = [...validate(next), ...crossCheck(next)];
    if (errors.length) return res.status(422).json({ error: 'Date invalide', errors });
    const saved = await store.write(db => {
        const i = db.projects.findIndex(p => p.id === current.id);
        db.projects[i] = next;
        return next;
    });
    drafts.delete(saved.id);
    const gone = images.idsIn(current);
    images.idsIn(saved).forEach(id => gone.delete(id));
    gc(gone);
    res.json(saved);
});

app.post('/api/projects/:id/duplicate', admin, async (req, res) => {
    const src = store.project(req.params.id);
    if (!src) return res.status(404).json({ error: 'Proiect inexistent' });
    const copy = await store.write(db => {
        const c = structuredClone(src);
        c.id = newId();
        c.status = 'draft';
        c.createdAt = c.updatedAt = now();
        if (c.site === 'arch') c.name = (c.name + ' (copie)').slice(0, 40);
        else { c.title = (c.title + ' (copie)').slice(0, 32); c.wallSlot = null; c.wallHero = false; }
        const same = db.projects.filter(o => o.site === c.site);
        c.order = Math.max(...same.map(o => o.order ?? 0)) + 1;
        db.projects.push(c);
        return c;
    });
    res.status(201).json(copy);
});

app.delete('/api/projects/:id', admin, async (req, res) => {
    const gone = await store.write(db => {
        const i = db.projects.findIndex(p => p.id === req.params.id);
        if (i < 0) return null;
        return images.idsIn(db.projects.splice(i, 1)[0]);
    });
    if (!gone) return res.status(404).json({ error: 'Proiect inexistent' });
    drafts.delete(req.params.id);
    const removed = await gc(gone);
    res.json({ ok: true, imagesRemoved: removed });
});

/* images still used by a saved project or by an open preview draft stay */
function gc(gone) {
    return images.collect([store.read().projects, [...drafts.values()]], gone).catch(() => 0);
}

/* the order of a whole site at once: the ids, in their new order */
app.put('/api/order', admin, async (req, res) => {
    const ids = req.body.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids lipsă' });
    await store.write(db => {
        ids.forEach((id, i) => { const p = db.projects.find(o => o.id === id); if (p) p.order = i; });
    });
    res.json({ ok: true });
});

/* ---------------------------------------------------------------------
   UPLOADS — processed in memory, only the two WebP files touch the disk
--------------------------------------------------------------------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 60 * 1024 * 1024, files: 40 },
    /* the type is decided by sharp, not by the browser's guess: a .webp or
       .heic often arrives as application/octet-stream */
    fileFilter: (req, file, cb) => cb(null, true)
});
app.post('/api/uploads', admin, upload.array('files', 40), async (req, res) => {
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
   SETTINGS — the one password for protected projects
--------------------------------------------------------------------- */
app.get('/api/settings', admin, (req, res) => {
    res.json({ hasPassword: !!store.read().settings.password });
});
app.put('/api/settings/password', admin, async (req, res) => {
    const pw = String(req.body.password || '');
    if (pw && pw.length < 4) return res.status(422).json({ error: 'Parola trebuie să aibă minim 4 caractere' });
    await store.write(db => { db.settings.password = pw ? hashPassword(pw) : null; });
    res.json({ hasPassword: !!pw });
});

/* ---------------------------------------------------------------------
   PREVIEW — unsaved edits, held in memory, merged over the saved ones
--------------------------------------------------------------------- */
const drafts = new Map();
app.put('/api/preview/draft/:id', admin, (req, res) => {
    const current = store.project(req.params.id);
    if (!current) return res.status(404).json({ error: 'Proiect inexistent' });
    drafts.set(current.id, { ...req.body, id: current.id, site: current.site, order: current.order });
    res.json({ ok: true });
});
app.delete('/api/preview/draft/:id', admin, (req, res) => { drafts.delete(req.params.id); res.json({ ok: true }); });
app.get('/api/preview/data', admin, (req, res) => {
    const list = store.projects(req.query.site).map(p => drafts.get(p.id) || p);
    res.json({ projects: list, hasPassword: !!store.read().settings.password });
});

/* ---------------------------------------------------------------------
   PUBLIC — what the live sites read
--------------------------------------------------------------------- */
function publicCors(req, res, next) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Unlock');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
}
/* what a locked project still shows: enough for its card and its cell */
function redact(p) {
    const keep = p.site === 'arch'
        ? { name: p.name, category: p.category, card: p.card, inNameList: p.inNameList,
            photos: [p.photos[(p.card?.photo || 1) - 1] || p.photos[0]].filter(Boolean) }
        : { title: p.title, type: p.type, place: p.place, year: p.year, wallSlot: p.wallSlot,
            wallHero: p.wallHero, photos: p.photos.slice(0, 1) };
    return { id: p.id, site: p.site, order: p.order, protected: true, locked: true, ...keep };
}
app.use('/api/public', publicCors);
app.post('/api/public/unlock', (req, res) => {
    const s = store.read().settings;
    if (!checkPassword(String(req.body.password || ''), s.password)) return res.status(401).json({ error: 'Parolă greșită' });
    res.json({ token: tokenFor(s) });
});
app.get('/api/public/:site', (req, res) => {
    const s = store.read().settings;
    const open = tokenOk(req.get('X-Unlock') || req.query.token, s);
    const list = store.projects(req.params.site)
        .filter(p => p.status === 'published')
        .map(p => (p.protected && !open) ? redact(p) : p);
    res.set('Cache-Control', 'no-cache').json(list);
});

/* ---------------------------------------------------------------------
   STATIC
--------------------------------------------------------------------- */
app.use('/uploads', (req, res, next) => { res.set('Access-Control-Allow-Origin', '*'); next(); },
    express.static(UPLOADS, { immutable: true, maxAge: '365d',
        setHeaders: (res, file) => { if (file.endsWith('.avif')) res.type('image/avif'); } }));
app.use('/preview', admin, express.static(path.join(ROOT, 'preview'), { extensions: ['html'] }));

const DIST = path.join(ROOT, 'dist');
if (existsSync(DIST)) {
    app.use(admin, express.static(DIST));
    app.get(/^\/(?!api|uploads|preview).*/, admin, (req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

app.use((err, req, res, next) => {
    console.error(err);
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Fișier prea mare (max 60 MB)' : (err.message || 'Eroare');
    res.status(err.status || 500).json({ error: msg });
});

app.listen(PORT, HOST, () => {
    console.log('Opunto Studio  http://' + HOST + ':' + PORT + (existsSync(DIST) ? '' : '  (API; admin via `npm run dev` on :5173)'));
});
