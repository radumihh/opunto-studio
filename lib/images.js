/* THE IMAGE PIPELINE. Every upload becomes two files next to the server,
   in /uploads:

     <id>.avif      the one the sites show. Long edge capped at 2560px —
                    the project pages fill the window height, so this is
                    sharp on a 1440p screen at 2x and on 4K at 1x. AVIF at
                    quality 60 reads like WebP at 85+ and weighs about a
                    third less (a detailed 4000px render: ~480 KB, not ~740).
     <id>.sm.webp   720px WebP, for the admin grid and the Concepts wall.

   The original is never kept: it is typically 5–15x the size and nothing
   reads it. EXIF orientation is applied first, then stripped with the rest
   of the metadata. */
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LARGE = { edge: 2560, quality: 60, format: 'avif' };
const SMALL = { edge: 720, quality: 74, format: 'webp' };

sharp.concurrency(Math.max(1, Math.min(4, (await import('os')).cpus().length - 1)));

export function createImages(dir) {
    async function encode(input, spec, out) {
        const info = await sharp(input, { failOn: 'none' })
            .rotate()
            .resize({ width: spec.edge, height: spec.edge, fit: 'inside', withoutEnlargement: true })
            [spec.format](spec.format === 'avif'
                ? { quality: spec.quality, effort: 3 }
                : { quality: spec.quality, effort: 6, smartSubsample: true })
            .toFile(out);
        return info;
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
        const [big] = await Promise.all([
            encode(buffer, LARGE, path.join(dir, id + '.avif')),
            encode(buffer, SMALL, path.join(dir, id + '.sm.webp'))
        ]);
        return {
            id,
            src: '/uploads/' + id + '.avif',
            sm: '/uploads/' + id + '.sm.webp',
            width: big.width,
            height: big.height,
            bytes: big.size,
            originalBytes: buffer.length
        };
    }

    /* every image id a value points at, however deep */
    function idsIn(value) {
        const ids = new Set();
        const walk = (v) => {
            if (!v || typeof v !== 'object') return;
            if (Array.isArray(v)) { v.forEach(walk); return; }
            if (typeof v.src === 'string' && v.src.startsWith('/uploads/') && v.id) ids.add(v.id);
            Object.values(v).forEach(walk);
        };
        walk(value);
        return ids;
    }

    /* DELETE WHAT NOTHING POINTS AT — carefully. An image that was just
       uploaded is held by an editor that has not saved yet, so it is not
       in any project; it is only removed once it is a day old. What the
       caller knows was dropped (`gone`: the photos taken out of a project
       on save, or everything a deleted project had) goes at once. */
    const GRACE = 24 * 3600 * 1000;
    async function collect(keep, gone = new Set()) {
        const used = idsIn(keep);
        const files = await fs.readdir(dir);
        let removed = 0;
        for (const f of files) {
            const m = f.match(/^([A-Za-z0-9_-]+)(?:\.sm\.webp|\.avif|\.webp)$/);
            if (!m || used.has(m[1])) continue;
            if (!gone.has(m[1])) {
                const st = await fs.stat(path.join(dir, f)).catch(() => null);
                if (!st || Date.now() - st.mtimeMs < GRACE) continue;
            }
            await fs.unlink(path.join(dir, f)).catch(() => {});
            removed++;
        }
        return removed;
    }

    return { ingest, collect, idsIn };
}
