/* IMPORT — the portfolios people made in their own copies of the Windows
   app, brought together in this folder's data/db.json and poze/.

     npm run import -- <export.zip | folder> [more …] [--dry] [--into <folder>]

   Every copy of the app started from the same projects: the ones in
   data/db.json here, which the installer was built with. A project saved
   in a copy since has another updatedAt than here, and that is how the
   script tells what each person did:
     changed by one person       → their version
     changed by more than one    → the most recently saved, and it says so
     new                         → added
     gone from a copy, and nobody else changed it → deleted
   The #arch rooms (categories) the same way.

   The photos are taken from the export that holds the chosen version and
   filed again in poze/<site>/<project>/1.avif …, numbered in page order,
   so two people's "proiect-nou/1.avif" never land on each other.
   data/settings.json (passwords) is not touched. The state before is in
   git: `git checkout data poze` undoes an import.

   --dry   only print what would happen
   --into  merge into another Studio folder instead of this one
   Stop the server that uses the folder before running this. */
import fs from 'fs/promises';
import { existsSync, mkdtempSync, mkdirSync, statSync } from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createImages, URL_BASE } from '../lib/images.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const intoAt = args.indexOf('--into');
const INTO = path.resolve(intoAt >= 0 ? args[intoAt + 1] : ROOT);
const inputs = args.filter((a, i) => !a.startsWith('--') && !(intoAt >= 0 && i === intoAt + 1));
if (!inputs.length) {
    console.log('Folosire: npm run import -- export-ana.zip export-alex.zip [--dry]');
    process.exit(1);
}

const tmp = mkdtempSync(path.join(os.tmpdir(), 'opunto-import-'));
const read = async f => JSON.parse(await fs.readFile(f, 'utf8'));
const label = p => (p.site === 'arch' ? p.name : p.title) || '(fără nume)';
const site = p => p.site === 'arch' ? '#arch' : '#concepts';

/* an export: the zip from Setări → Exportă portofoliul, or that zip unpacked */
function unpack(file, i) {
    if (statSync(file).isDirectory()) return file;
    const dir = path.join(tmp, 'export-' + i);
    mkdirSync(dir, { recursive: true });
    const r = process.platform === 'win32'
        ? spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', file, '-C', dir])
        : spawnSync('unzip', ['-q', file, '-d', dir]);
    if (r.status !== 0) throw new Error('Nu pot dezarhiva ' + file + ': ' + String(r.stderr || r.error || ''));
    return dir;
}

const base = await read(path.join(INTO, 'data', 'db.json'));
const baseDir = path.join(INTO, 'poze');
const exps = [];
for (const [i, file] of inputs.entries()) {
    const dir = unpack(path.resolve(file), i);
    const dbFile = path.join(dir, 'data', 'db.json');
    if (!existsSync(dbFile)) throw new Error(file + ' nu are data/db.json. E zip-ul din Setări → Exportă portofoliul?');
    exps.push({ name: path.basename(file), db: await read(dbFile), poze: path.join(dir, 'poze') });
}

const report = { added: [], changed: [], both: [], deleted: [], keptDeleted: [], rooms: [], missing: [] };

/* PROJECTS */
const baseById = new Map(base.projects.map(p => [p.id, p]));
const ids = [...new Set([...baseById.keys(), ...exps.flatMap(e => e.db.projects.map(p => p.id))])];
const chosen = [];   // { p, poze }
for (const id of ids) {
    const b = baseById.get(id);
    const have = exps.map(e => ({ e, p: e.db.projects.find(x => x.id === id) }));
    const changed = have.filter(h => h.p && (!b || h.p.updatedAt !== b.updatedAt))
        .sort((x, y) => String(y.p.updatedAt).localeCompare(String(x.p.updatedAt)));
    const gone = b ? have.filter(h => !h.p) : [];
    if (changed.length) {
        const pick = changed[0];
        chosen.push({ p: structuredClone(pick.p), poze: pick.e.poze });
        const line = site(pick.p) + ' „' + label(pick.p) + '” — de la ' + pick.e.name;
        (b ? report.changed : report.added).push(line);
        if (changed.length > 1) report.both.push(site(pick.p) + ' „' + label(pick.p) + '”: modificat în ' +
            changed.map(c => c.e.name + ' (' + c.p.updatedAt.slice(0, 16).replace('T', ' ') + ')').join(', ') +
            '. Am păstrat versiunea din ' + pick.e.name + '.');
        if (gone.length) report.keptDeleted.push(site(pick.p) + ' „' + label(pick.p) + '”: șters în ' +
            gone.map(g => g.e.name).join(', ') + ', dar modificat în ' + changed.map(c => c.e.name).join(', ') + '. L-am păstrat.');
    } else if (gone.length) {
        report.deleted.push(site(b) + ' „' + label(b) + '” — șters în ' + gone.map(g => g.e.name).join(', '));
    } else {
        chosen.push({ p: structuredClone(b), poze: baseDir });
    }
}

/* the order on each site: as the copies left it, new ones after */
chosen.sort((x, y) => (x.p.site > y.p.site ? 1 : x.p.site < y.p.site ? -1 : 0) ||
    (x.p.order ?? 0) - (y.p.order ?? 0) || String(x.p.createdAt).localeCompare(String(y.p.createdAt)));
const count = {};
for (const c of chosen) c.p.order = (count[c.p.site] = (count[c.p.site] ?? -1) + 1);

/* #ARCH ROOMS — no timestamp: whichever copy changed it; the last one wins */
const rooms = [];
for (const [id, b] of Object.entries(base.categories || {})) {
    const changed = exps.filter(e => e.db.categories && e.db.categories[id] &&
        JSON.stringify(e.db.categories[id]) !== JSON.stringify(b));
    const pick = changed[changed.length - 1];
    rooms.push({ id, c: structuredClone(pick ? pick.db.categories[id] : b), poze: pick ? pick.poze : baseDir });
    if (changed.length) report.rooms.push('camera „' + id + '” — de la ' + changed.map(e => e.name).join(', ') +
        (changed.length > 1 ? ' (am păstrat ' + pick.name + ')' : ''));
}

/* REPORT */
const say = (title, list) => { if (list.length) console.log('\n' + title + '\n' + list.map(x => '  ' + x).join('\n')); };
say('Proiecte noi:', report.added);
say('Proiecte modificate:', report.changed);
say('Șterse:', report.deleted);
say('ATENȚIE, modificate de mai mulți:', report.both);
say('ATENȚIE, șterse de unii și modificate de alții:', report.keptDeleted);
say('Camerele #arch:', report.rooms);
const n = s => chosen.filter(c => c.p.site === s).length;
console.log('\nRezultat: ' + n('arch') + ' proiecte #arch, ' + n('concepts') + ' #concepts.');
if (dry) { console.log('(--dry: nu am scris nimic)'); await fs.rm(tmp, { recursive: true, force: true }); process.exit(0); }

/* PHOTOS — each one copied from where its version came from into a new
   poze/_incoming/<id>.avif, then filed in its project's folder */
const out = path.join(tmp, 'out');
const outPoze = path.join(out, 'poze');
await fs.mkdir(path.join(outPoze, '_incoming'), { recursive: true });
const images = createImages(outPoze);
const copied = new Set();
async function bring(ph, from, owner) {
    const rel = images.relOf(ph.src);
    if (!rel) return true;                         // a texture on the web (Poly Haven)
    const target = '_incoming/' + ph.id;
    if (!copied.has(ph.id)) {
        const src = path.join(from, ...rel.split('/'));
        if (!existsSync(src)) { report.missing.push(owner + ': ' + rel); return false; }
        await fs.copyFile(src, path.join(outPoze, target + '.avif'));
        const sm = src.replace(/\.avif$/, '.sm.webp');
        if (existsSync(sm)) await fs.copyFile(sm, path.join(outPoze, target + '.sm.webp'));
        copied.add(ph.id);
    }
    ph.src = URL_BASE + target + '.avif';
    ph.sm = URL_BASE + target + '.sm.webp';
    return true;
}
for (const { p, poze } of chosen) {
    const kept = [];
    for (const ph of p.photos || []) if (await bring(ph, poze, label(p))) kept.push(ph);
    p.photos = kept;
    for (const m of (p.materials && p.materials.items) || []) {
        if (m.image && !(await bring(m.image, poze, label(p)))) m.image = null;
    }
}
for (const { c, poze } of rooms) {
    for (const k of ['photo', 'secondPhoto']) if (c[k] && !(await bring(c[k], poze, 'camera ' + c.id))) c[k] = null;
}

const db = { version: base.version || 2, projects: chosen.map(c => c.p), categories: Object.fromEntries(rooms.map(r => [r.id, r.c])) };
const where = await images.locator(db);
for (const p of db.projects) await images.placeProject(p, db.projects, where);
for (const c of Object.values(db.categories)) await images.placeCategory(c, where);
await images.collect([db.projects, db.categories]);
await fs.rm(path.join(outPoze, '_incoming'), { recursive: true, force: true });

/* into place: data/db.json and poze/, nothing else */
await fs.writeFile(path.join(INTO, 'data', 'db.json'), JSON.stringify(db, null, 2));
await fs.rm(baseDir, { recursive: true, force: true });
await fs.cp(outPoze, baseDir, { recursive: true });
await fs.rm(tmp, { recursive: true, force: true });

say('Poze lipsă din export (scoase din proiect):', report.missing);
const files = images.photosIn([db.projects, db.categories]).length;
console.log('\nGata: ' + path.join(INTO, 'data', 'db.json') + ' și poze/ (' + files + ' poze).');
console.log('Verifică cu `npm run dev`. Ca să anulezi: git checkout data poze');
