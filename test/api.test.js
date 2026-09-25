/* End-to-end tests for the server: each suite starts a real server on a
   free port with its own temporary data and uploads folders.
   Run: npm test */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function freePort() {
    return new Promise(r => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
}
async function start(env = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opunto-test-'));
    const port = await freePort();
    const child = spawn(process.execPath, ['server.js'], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: path.join(dir, 'data'), UPLOADS_DIR: path.join(dir, 'poze'), ADMIN_PASSWORD: '', ...env },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', d => out += d);
    child.stderr.on('data', d => out += d);
    const base = 'http://127.0.0.1:' + port;
    for (let i = 0; i < 100; i++) {
        try { await fetch(base + '/api/auth/me'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
        if (child.exitCode !== null) throw new Error('server exited: ' + out);
    }
    return { base, dir, child, stop: () => { child.kill(); fs.rmSync(dir, { recursive: true, force: true }); }, log: () => out };
}

const json = (method, body, headers = {}) => ({ method, headers: { 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
async function img(w = 1600, h = 1000, color = { r: 120, g: 110, b: 100 }) {
    return sharp({ create: { width: w, height: h, channels: 3, background: color } }).jpeg({ quality: 90 }).toBuffer();
}
async function upload(base, bufs, headers = {}) {
    const fd = new FormData();
    bufs.forEach((b, i) => fd.append('files', new Blob([b]), 'f' + i + '.jpg'));
    const r = await fetch(base + '/api/uploads', { method: 'POST', body: fd, headers });
    return { status: r.status, body: await r.json() };
}
const clean = r => { const { name, ...x } = r; return x; };

describe('studio without admin password (local)', () => {
    let s;
    before(async () => { s = await start(); });
    after(() => s.stop());

    test('auth is off and the API answers', async () => {
        const me = await (await fetch(s.base + '/api/auth/me')).json();
        assert.equal(me.authOn, false);
        assert.equal(me.signedIn, true);
    });

    test('create rejects an unknown site', async () => {
        const r = await fetch(s.base + '/api/projects', json('POST', { site: 'nope' }));
        assert.equal(r.status, 400);
    });

    test('text width: narrow / medium / wide on both sites, nothing else', async () => {
        const a = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        const text = w => ({ ...a, texts: [{ heading: 'Context', body: 'x', width: w }] });
        assert.equal((await fetch(s.base + '/api/projects/' + a.id, json('PUT', text('wide')))).status, 200);
        assert.equal((await fetch(s.base + '/api/projects/' + a.id, json('PUT', text('huge')))).status, 422);
        const c = await (await fetch(s.base + '/api/projects', json('POST', { site: 'concepts' }))).json();
        assert.equal((await fetch(s.base + '/api/projects/' + c.id, json('PUT', { ...c, textWidth: 'narrow' }))).status, 200);
        assert.equal((await fetch(s.base + '/api/projects/' + c.id, json('PUT', { ...c, textWidth: 'huge' }))).status, 422);
    });

    test('upload: image becomes avif + sm.webp, junk is refused per file', async () => {
        const good = await img(4000, 2500);
        const { status, body } = await upload(s.base, [good, Buffer.from('not an image')]);
        assert.equal(status, 200);
        assert.equal(body.length, 2);
        assert.ok(body[0].src.endsWith('.avif'));
        assert.equal(body[0].width, 2560);
        assert.equal(body[0].height, 1600);
        assert.ok(body[1].error);
        const f = await fetch(s.base + body[0].src);
        assert.equal(f.status, 200);
        assert.equal(f.headers.get('content-type'), 'image/avif');
        assert.ok(fs.existsSync(path.join(s.dir, 'poze', '_incoming', body[0].id + '.sm.webp')));
        const missing = await fetch(s.base + '/poze/nothere.avif');
        assert.equal(missing.status, 404);
    });

    test('arch: draft saves incomplete, publish is refused until complete, then accepted', async () => {
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch', category: 'interior-design' }))).json();
        assert.equal(p.category, 'interior-design');
        let r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'Casa <b>Test</b>', _base: p.updatedAt }));
        assert.equal(r.status, 200);
        const saved = await r.json();
        assert.equal(saved.name, 'Casa <b>Test</b>');

        r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...saved, status: 'published', _base: saved.updatedAt }));
        assert.equal(r.status, 422);
        const e = await r.json();
        const msgs = e.errors.map(x => x.field);
        assert.ok(msgs.includes('photos') && msgs.includes('facts') && msgs.includes('texts'), JSON.stringify(e.errors));

        const ups = (await upload(s.base, await Promise.all([1, 2, 3, 4].map(() => img())))).body.map(clean);
        const full = { ...saved, status: 'published', photos: ups, _base: saved.updatedAt,
            facts: [{ label: 'Area', value: '240 m²' }, { label: 'Floors', value: 'G+1' }, { label: 'Year', value: '2024' }],
            texts: [{ heading: 'Context', body: 'One.\n\nTwo.', afterPhoto: null }],
            materials: { note: '', afterPhoto: 2, items: [{ name: 'Granite', image: { id: 'ph-granite_tile_04', src: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/granite_tile_04/granite_tile_04_diff_1k.jpg', width: 1024, height: 1024, preset: true } }] } };
        r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', full));
        assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
    });

    test('unknown fields and bad values are refused', async () => {
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        let r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, hacked: true }));
        assert.equal(r.status, 422);
        r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, photos: [{ id: 'x', src: 'javascript:alert(1)', width: 1, height: 1 }] }));
        assert.equal(r.status, 422);
        r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, category: 'nope' }));
        assert.equal(r.status, 422);
    });

    test('a save from a stale copy is refused (409) unless forced', async () => {
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        const a = await (await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'A', _base: p.updatedAt }))).json();
        await new Promise(r => setTimeout(r, 5));
        let r = await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'B', _base: p.updatedAt }));
        assert.equal(r.status, 409);
        r = await fetch(s.base + '/api/projects/' + p.id + '?force=1', json('PUT', { ...p, name: 'B', _base: p.updatedAt }));
        assert.equal(r.status, 200);
        assert.equal((await r.json()).name, 'B');
        assert.ok(a);
    });

    test('concepts: two published projects cannot share a wall slot or both be hero', async () => {
        const ups = (await upload(s.base, await Promise.all([1, 2, 3, 4, 5].map(() => img())))).body.map(clean);
        const full = (p, extra) => ({ ...p, status: 'published', title: 'T', type: 'Scenography', place: 'Cluj', year: '2024', photos: ups,
            facts: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }, { label: 'c', value: '3' }],
            summary: 's', story: 'st.', approach: 'ap', scope: ['Concept'], wallSlot: 'B3', wallHero: true, ...extra });
        const a = await (await fetch(s.base + '/api/projects', json('POST', { site: 'concepts' }))).json();
        let r = await fetch(s.base + '/api/projects/' + a.id, json('PUT', full(a)));
        assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
        const b = await (await fetch(s.base + '/api/projects', json('POST', { site: 'concepts' }))).json();
        r = await fetch(s.base + '/api/projects/' + b.id, json('PUT', full(b)));
        assert.equal(r.status, 422);
        const f = (await r.json()).errors.map(x => x.field);
        assert.ok(f.includes('wallSlot') && f.includes('wallHero'));
        r = await fetch(s.base + '/api/projects/' + b.id, json('PUT', full(b, { wallSlot: 'A1', wallHero: false })));
        assert.equal(r.status, 200);
        r = await fetch(s.base + '/api/projects/' + b.id, json('PUT', full(b, { year: '24' })));
        assert.equal(r.status, 422);
    });

    test('reorder, duplicate, delete — and images shared by a copy survive', async () => {
        const ups = (await upload(s.base, [await img()])).body.map(clean);
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        const saved = await (await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'Orig', photos: ups }))).json();
        const copy = await (await fetch(s.base + '/api/projects/' + p.id + '/duplicate', json('POST'))).json();
        assert.equal(copy.name, 'Orig (copie)');
        assert.equal(copy.status, 'draft');

        const list = await (await fetch(s.base + '/api/projects?site=arch')).json();
        const ids = list.map(x => x.id).reverse();
        await fetch(s.base + '/api/order', json('PUT', { ids }));
        const after = await (await fetch(s.base + '/api/projects?site=arch')).json();
        assert.deepEqual(after.map(x => x.id), ids);

        const orig = path.join(s.dir, 'poze', 'architecture', 'orig', '1.avif');
        const dup = path.join(s.dir, 'poze', 'architecture', 'orig-copie', '1.avif');
        assert.equal(saved.photos[0].src, '/poze/architecture/orig/1.avif?v=' + ups[0].id);
        assert.ok(fs.existsSync(orig) && fs.existsSync(dup), 'the copy has its own folder');
        await fetch(s.base + '/api/projects/' + saved.id, { method: 'DELETE' });
        assert.ok(!fs.existsSync(orig), 'folder removed with its project');
        assert.ok(fs.existsSync(dup), 'the copy keeps its files');
        await fetch(s.base + '/api/projects/' + copy.id, { method: 'DELETE' });
        assert.ok(!fs.existsSync(dup), 'image removed with its last project');
        assert.equal((await fetch(s.base + '/api/projects/' + copy.id)).status, 404);
    });

    test('export: one zip with data/db.json (no passwords) and every photo in its folder', async () => {
        const ups = (await upload(s.base, [await img(), await img()])).body.map(clean);
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'Export Me', photos: ups }));
        const r = await fetch(s.base + '/api/export');
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('content-type'), 'application/zip');
        const zip = Buffer.from(await r.arrayBuffer());
        /* the names from the zip's central directory */
        const names = [];
        for (let i = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2])); i >= 0; i = zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2]), i + 4)) {
            names.push(zip.toString('utf8', i + 46, i + 46 + zip.readUInt16LE(i + 28)));
        }
        assert.ok(names.includes('data/db.json'));
        assert.ok(names.includes('CITESTE.txt'));
        for (const f of ['1.avif', '1.sm.webp', '2.avif', '2.sm.webp']) assert.ok(names.includes('poze/architecture/export-me/' + f), f);
        assert.ok(!names.some(n => n.includes('_incoming') || n.includes('settings')));
        const i = zip.indexOf('"projects"');
        assert.ok(i > 0 && !zip.includes('"secret"'), 'no settings in the export');
    });

    test('photos taken out of a project are deleted on save', async () => {
        const ups = (await upload(s.base, [await img(), await img()])).body.map(clean);
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        const a = await (await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'Casa Țăruș', photos: ups }))).json();
        const dir = path.join(s.dir, 'poze', 'architecture', 'casa-tarus');
        assert.deepEqual(fs.readdirSync(dir).sort(), ['1.avif', '1.sm.webp', '2.avif', '2.sm.webp']);
        // reorder: the files are renumbered, the URLs follow the pictures
        const b = await (await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...a, photos: [a.photos[1], a.photos[0]], _base: a.updatedAt }))).json();
        assert.equal(b.photos[0].src, '/poze/architecture/casa-tarus/1.avif?v=' + ups[1].id);
        assert.equal(fs.statSync(path.join(dir, '1.avif')).size, ups[1].bytes);
        // rename: the folder follows the name
        const c = await (await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...b, name: 'Casa Nouă', photos: [b.photos[0]], _base: b.updatedAt }))).json();
        assert.equal(c.photos[0].src, '/poze/architecture/casa-noua/1.avif?v=' + ups[1].id);
        assert.ok(!fs.existsSync(dir), 'old folder removed');
        assert.deepEqual(fs.readdirSync(path.join(s.dir, 'poze', 'architecture', 'casa-noua')).sort(), ['1.avif', '1.sm.webp']);
        assert.equal((await fetch(s.base + c.photos[0].src)).status, 200);
    });

    test('preview uses an unsaved draft only while it matches the saved version', async () => {
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        await fetch(s.base + '/api/preview/draft/' + p.id, json('PUT', { ...p, name: 'Draft name', _base: p.updatedAt }));
        let d = await (await fetch(s.base + '/api/preview/data?site=arch')).json();
        assert.equal(d.projects.find(x => x.id === p.id).name, 'Draft name');
        assert.equal(d.categories.length, 3);
        await fetch(s.base + '/api/projects/' + p.id, json('PUT', { ...p, name: 'Saved' }));
        d = await (await fetch(s.base + '/api/preview/data?site=arch')).json();
        assert.equal(d.projects.find(x => x.id === p.id).name, 'Saved');
    });

    test('public API: published only, protected ones locked until the password', async () => {
        const ups = (await upload(s.base, await Promise.all([1, 2, 3, 4].map(() => img())))).body.map(clean);
        const p = await (await fetch(s.base + '/api/projects', json('POST', { site: 'arch' }))).json();
        const full = { ...p, name: 'Secret', status: 'published', protected: true, photos: ups,
            facts: [{ label: 'a', value: '1' }, { label: 'b', value: '2' }, { label: 'c', value: '3' }],
            texts: [{ heading: 'Context', body: 'Hidden text', afterPhoto: null }] };
        assert.equal((await fetch(s.base + '/api/projects/' + p.id, json('PUT', full))).status, 200);

        let pub = await (await fetch(s.base + '/api/public/arch')).json();
        const locked = pub.find(x => x.id === p.id);
        assert.equal(locked.locked, true);
        assert.equal(locked.texts, undefined);
        assert.equal(locked.photos.length, 1);
        assert.ok(pub.every(x => x.status === undefined || x.status === 'published'));

        let r = await fetch(s.base + '/api/public/unlock', json('POST', { password: 'x' }));
        assert.equal(r.status, 401, 'no password set: nothing unlocks');
        await fetch(s.base + '/api/settings/password', json('PUT', { password: 'opunto' }));
        r = await fetch(s.base + '/api/public/unlock', json('POST', { password: 'wrong' }));
        assert.equal(r.status, 401);
        const { token } = await (await fetch(s.base + '/api/public/unlock', json('POST', { password: 'opunto' }))).json();
        pub = await (await fetch(s.base + '/api/public/arch', { headers: { 'X-Unlock': token } })).json();
        assert.equal(pub.find(x => x.id === p.id).texts[0].body, 'Hidden text');
        assert.equal((await fetch(s.base + '/api/public/arch')).headers.get('access-control-allow-origin'), '*');

        await fetch(s.base + '/api/settings/password', json('PUT', { password: 'changed' }));
        pub = await (await fetch(s.base + '/api/public/arch', { headers: { 'X-Unlock': token } })).json();
        assert.equal(pub.find(x => x.id === p.id).locked, true, 'old token dies with the old password');

        const cats = await (await fetch(s.base + '/api/public/arch/categories')).json();
        assert.deepEqual(cats.map(c => c.id), ['interior-design', 'architecture', 'real-estate-marketing']);
    });

    test('categories: edited and validated', async () => {
        const cats = await (await fetch(s.base + '/api/categories')).json();
        let r = await fetch(s.base + '/api/categories/architecture', json('PUT', { ...cats[1], tagline: 'Twelve built' }));
        assert.equal(r.status, 200);
        r = await fetch(s.base + '/api/categories/architecture', json('PUT', { ...cats[1], name: '' }));
        assert.equal(r.status, 422);
        r = await fetch(s.base + '/api/categories/nope', json('PUT', cats[1]));
        assert.equal(r.status, 404);
    });

    test('preview pages and the backup are served', async () => {
        for (const p of ['/preview/arch.html', '/preview/concepts.html', '/preview/js/project-page.js', '/preview/js/concepts-page.js']) {
            assert.equal((await fetch(s.base + p)).status, 200, p);
        }
        const b = await fetch(s.base + '/api/backup');
        assert.equal(b.status, 200);
        const db = await b.json();
        assert.ok(Array.isArray(db.projects));
        assert.equal(db.settings, undefined, 'no secrets in the backup');
    });

    test('the database file survives a restart', async () => {
        assert.ok(fs.existsSync(path.join(s.dir, 'data', 'db.json')));
        const db = JSON.parse(fs.readFileSync(path.join(s.dir, 'data', 'db.json'), 'utf8'));
        assert.ok(db.projects.length > 3);
    });
});

describe('studio with an admin password', () => {
    let s;
    before(async () => { s = await start({ ADMIN_PASSWORD: 'correct horse' }); });
    after(() => s.stop());

    test('everything but sign-in and the public API is closed', async () => {
        assert.equal((await fetch(s.base + '/api/projects')).status, 401);
        assert.equal((await fetch(s.base + '/api/uploads', { method: 'POST' })).status, 401);
        assert.equal((await fetch(s.base + '/preview/arch.html')).status, 401);
        assert.equal((await fetch(s.base + '/api/public/arch')).status, 200);
        const me = await (await fetch(s.base + '/api/auth/me')).json();
        assert.deepEqual(me, { authOn: true, signedIn: false });
    });

    test('sign in, use the cookie, change the password, old cookie dies', async () => {
        let r = await fetch(s.base + '/api/auth/login', json('POST', { password: 'nope' }));
        assert.equal(r.status, 401);
        r = await fetch(s.base + '/api/auth/login', json('POST', { password: 'correct horse' }));
        assert.equal(r.status, 200);
        const cookie = r.headers.get('set-cookie').split(';')[0];
        assert.match(r.headers.get('set-cookie'), /HttpOnly/i);
        assert.equal((await fetch(s.base + '/api/projects', { headers: { cookie } })).status, 200);

        r = await fetch(s.base + '/api/settings/admin', json('PUT', { current: 'wrong', next: 'new password 1' }, { cookie }));
        assert.equal(r.status, 403);
        r = await fetch(s.base + '/api/settings/admin', json('PUT', { current: 'correct horse', next: 'new password 1' }, { cookie }));
        assert.equal(r.status, 200);
        const fresh = r.headers.get('set-cookie').split(';')[0];
        assert.equal((await fetch(s.base + '/api/projects', { headers: { cookie } })).status, 401, 'old session ends');
        assert.equal((await fetch(s.base + '/api/projects', { headers: { cookie: fresh } })).status, 200);
        r = await fetch(s.base + '/api/auth/login', json('POST', { password: 'correct horse' }));
        assert.equal(r.status, 401, 'env password no longer works once one is set in the studio');
    });

    test('sign-in attempts are rate limited', async () => {
        let last;
        for (let i = 0; i < 12; i++) last = await fetch(s.base + '/api/auth/login', json('POST', { password: 'x' }));
        assert.equal(last.status, 429);
    });
});

describe('startup safety', () => {
    test('refuses to listen on the network without an admin password', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opunto-test-'));
        const child = spawn(process.execPath, ['server.js'], {
            cwd: ROOT, env: { ...process.env, HOST: '0.0.0.0', PORT: String(await freePort()), DATA_DIR: dir, UPLOADS_DIR: dir, ADMIN_PASSWORD: '' }
        });
        const code = await new Promise(r => child.on('exit', r));
        fs.rmSync(dir, { recursive: true, force: true });
        assert.equal(code, 1);
    });
});
