/* THE IMAGE PIPELINE. Photos live in one folder next to the server, laid
   out the way a person would sort them by hand:

     poze/architecture/<project>/1.avif, 2.avif … n.avif
     poze/concepts/<project>/1.avif …
     poze/architecture/<project>/material-1.avif    (#arch textures)
     poze/architecture/_categorii/<room>-1.avif     (#arch room photos)

   Every picture also has <n>.sm.webp next to it: 720px, for the admin grid
   and the Concepts wall. The big one is AVIF, long edge capped at 2560px,
   quality 60 — reads like WebP at 85+ and weighs about a third less.

   An upload first lands in poze/_incoming/<id>.avif. Saving a project puts
   its pictures in its folder, numbered in page order; reordering or
   renaming renumbers them. A number gets reused by another picture, so the
   URL carries ?v=<id> and stays safe to cache forever.

   The original is never kept. EXIF orientation is applied, then stripped
   with the rest of the metadata. */
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LARGE = { edge: 2560, quality: 60, format: 'avif' };
const SMALL = { edge: 720, quality: 74, format: 'webp' };
export const URL_BASE = '/poze/';
const INCOMING = '_incoming';

sharp.concurrency(Math.max(1, Math.min(4, (await import('os')).cpus().length - 1)));

export function slugify(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
}

export function createImages(dir) {
    const abs = rel => path.join(dir, ...rel.split('/'));
    /* '/poze/a/b/1.avif?v=x' → 'a/b/1.avif' (null for anything else) */
    function relOf(src) {
        if (typeof src !== 'string' || !src.startsWith(URL_BASE)) return null;
        const rel = src.slice(URL_BASE.length).split('?')[0];
        return rel.split('/').includes('..') ? null : rel;
    }
    const smOf = rel => rel.replace(/\.avif$/, '.sm.webp');
    const exists = rel => fs.access(abs(rel)).then(() => true, () => false);

    async function encode(input, spec, out) {
        return sharp(input, { failOn: 'none' })
            .rotate()
            .resize({ width: spec.edge, height: spec.edge, fit: 'inside', withoutEnlargement: true })
            [spec.format](spec.format === 'avif'
                ? { quality: spec.quality, effort: 3 }
                : { quality: spec.quality, effort: 6, smartSubsample: true })
            .toFile(out);
    }

    async function ingest(buffer) {
        let meta;
        try { meta = await sharp(buffer, { failOn: 'none' }).metadata(); }
        catch (e) { meta = null; }
        const heic = buffer.length > 12 && /ftyp(heic|heix|hevc|hevx|mif1|msf1)/.test(buffer.subarray(4, 12).toString('latin1'));
        if (heic && (!meta || meta.compression === 'hevc')) {
            throw new Error('HEIC nu e suportat. Exportă poza ca JPG (pe iPhone: Setări → Cameră → Formate → Cel mai compatibil).');
        }
        if (!meta || !meta.width || !meta.height) throw new Error('Format nesuportat. Folosește JPG, PNG, WebP, AVIF sau TIFF.');
        const id = crypto.randomBytes(9).toString('base64url');
        await fs.mkdir(abs(INCOMING), { recursive: true });
        const rel = INCOMING + '/' + id + '.avif';
        const [big] = await Promise.all([
            encode(buffer, LARGE, abs(rel)),
            encode(buffer, SMALL, abs(smOf(rel)))
        ]);
        return {
            id,
            src: URL_BASE + rel,
            sm: URL_BASE + smOf(rel),
            width: big.width,
            height: big.height,
            bytes: big.size,
            originalBytes: buffer.length
        };
    }

    /* every local picture a value holds, however deep */
    function photosIn(value, out = []) {
        if (!value || typeof value !== 'object') return out;
        if (Array.isArray(value)) { value.forEach(v => photosIn(v, out)); return out; }
        if (value.id && relOf(value.src)) out.push(value);
        Object.values(value).forEach(v => photosIn(v, out));
        return out;
    }

    /* where each picture id is on disk right now, taken from the saved
       records and the incoming folder — never from the src a client sent */
    async function locator(saved) {
        const at = new Map();
        for (const ph of photosIn(saved)) {
            const rel = relOf(ph.src);
            if (!at.has(ph.id) && await exists(rel)) at.set(ph.id, rel);
        }
        return async id => {
            if (at.has(id)) return at.get(id);
            if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
            const rel = INCOMING + '/' + id + '.avif';
            return (await exists(rel)) ? rel : null;
        };
    }

    /* PUT PICTURES WHERE THEY BELONG. `slots`: [photo, folder, name].
       Rewrites each photo's src/sm. Copies to a temporary name first, then
       renames over the targets, so a reorder that swaps 1 and 2 never
       overwrites a file it still needs. Sources are copied, not moved: a
       texture can be shared, and the old files are collected afterwards. */
    async function arrange(slots, where) {
        const moves = [];
        for (const [ph, folder, name] of slots) {
            const target = folder + '/' + name + '.avif';
            const from = await where(ph.id);
            if (!from) throw Object.assign(new Error('O poză nu mai există pe disc. Scoate-o și urc-o din nou.'), { status: 422 });
            ph.src = URL_BASE + target + '?v=' + ph.id;
            ph.sm = URL_BASE + smOf(target) + '?v=' + ph.id;
            if (from !== target) moves.push({ from, target, tmp: folder + '/.tmp-' + ph.id + '.avif' });
        }
        for (const m of moves) {
            await fs.mkdir(path.dirname(abs(m.target)), { recursive: true });
            await fs.copyFile(abs(m.from), abs(m.tmp));
            await fs.copyFile(abs(smOf(m.from)), abs(smOf(m.tmp))).catch(() => {});
        }
        for (const m of moves) {
            await fs.rename(abs(m.tmp), abs(m.target));
            await fs.rename(abs(smOf(m.tmp)), abs(smOf(m.target))).catch(() => {});
        }
    }

    /* the folder a record's pictures are in now ('architecture/casa-m1') */
    function folderOf(p) {
        const ph = photosIn(p).map(x => relOf(x.src)).find(r => !r.startsWith(INCOMING + '/'));
        return ph ? ph.split('/').slice(0, 2).join('/') : null;
    }

    /* the folder a project belongs in: its name, unique on its site */
    function folderFor(p, all) {
        const site = p.site === 'arch' ? 'architecture' : 'concepts';
        const base = slugify(p.site === 'arch' ? p.name : p.title) || 'proiect-' + p.id;
        const taken = new Set(all.filter(o => o.id !== p.id).map(folderOf).filter(Boolean));
        const now = folderOf(p);
        if (now && !taken.has(now) && new RegExp('^' + site + '/' + base + '(-\\d+)?$').test(now)) return now;
        let name = base, n = 2;
        while (taken.has(site + '/' + name)) name = base + '-' + n++;
        return site + '/' + name;
    }

    async function placeProject(p, all, where) {
        const folder = folderFor(p, all);
        const slots = (p.photos || []).filter(ph => relOf(ph.src)).map((ph, i) => [ph, folder, String(i + 1)]);
        ((p.materials && p.materials.items) || []).forEach((m, i) => {
            if (m.image && relOf(m.image.src)) slots.push([m.image, folder, 'material-' + (i + 1)]);
        });
        await arrange(slots, where);
        return p;
    }

    async function placeCategory(c, where) {
        const slots = [];
        ['photo', 'secondPhoto'].forEach((k, i) => {
            if (c[k] && relOf(c[k].src)) slots.push([c[k], 'architecture/_categorii', c.id + '-' + (i + 1)]);
        });
        await arrange(slots, where);
        return c;
    }

    /* DELETE WHAT NOTHING POINTS AT. A fresh upload in _incoming is held by
       an editor that has not saved yet: it stays a day. A file in a project
       folder that no record uses any more goes at once. */
    const GRACE = 24 * 3600 * 1000;
    async function collect(keep) {
        const used = new Set(), filed = new Set();
        for (const ph of photosIn(keep)) {
            const r = relOf(ph.src);
            used.add(r); used.add(smOf(r));
            if (!r.startsWith(INCOMING + '/')) filed.add(ph.id);
        }
        let removed = 0;
        async function walk(rel) {
            const entries = await fs.readdir(rel ? abs(rel) : dir, { withFileTypes: true }).catch(() => []);
            for (const e of entries) {
                const r = rel ? rel + '/' + e.name : e.name;
                if (e.isDirectory()) {
                    await walk(r);
                    if (r !== INCOMING && r !== 'architecture' && r !== 'concepts') await fs.rmdir(abs(r)).catch(() => {});   // only if empty
                    continue;
                }
                if (!/\.(avif|webp)$/.test(e.name) || used.has(r)) continue;
                /* an upload already filed in a project goes at once */
                if (r.startsWith(INCOMING + '/') && !filed.has(e.name.split('.')[0])) {
                    const st = await fs.stat(abs(r)).catch(() => null);
                    if (!st || Date.now() - st.mtimeMs < GRACE) continue;
                }
                await fs.unlink(abs(r)).catch(() => {});
                if (!e.name.includes('.sm.')) removed++;
            }
        }
        await walk('');
        return removed;
    }

    return { ingest, collect, photosIn, locator, placeProject, placeCategory, relOf };
}
