/* SNAPSHOT: the projects and photos as they are now, into seed/, so a new
   server starts with them (deploy/install.sh copies seed/ in on the first
   install only). Passwords and the signing secret are left out.

     npm run snapshot
*/
import fs from 'fs';
import path from 'path';
import { config, ROOT } from '../lib/config.js';

const db = JSON.parse(fs.readFileSync(path.join(config.dataDir, 'db.json'), 'utf8'));
delete db.settings;
/* drafts without a name are leftovers, not projects */
db.projects = db.projects.filter(p => (p.name || p.title || '').trim() && !/^test\b/i.test(p.name || p.title));

const seed = path.join(ROOT, 'seed');
fs.rmSync(seed, { recursive: true, force: true });
fs.mkdirSync(seed, { recursive: true });
fs.writeFileSync(path.join(seed, 'db.json'), JSON.stringify(db, null, 1));

/* only the files these records use */
const used = new Set();
const walk = v => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (typeof v.src === 'string' && v.src.startsWith('/poze/')) {
        const rel = v.src.slice(6).split('?')[0];
        used.add(rel); used.add(rel.replace(/\.avif$/, '.sm.webp'));
    }
    Object.values(v).forEach(walk);
};
walk(db);
let bytes = 0;
for (const rel of used) {
    const from = path.join(config.uploadsDir, rel);
    if (!fs.existsSync(from)) { console.warn('lipsește: ' + rel); continue; }
    const to = path.join(seed, 'poze', rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
    bytes += fs.statSync(from).size;
}
console.log(db.projects.length + ' proiecte, ' + used.size + ' fișiere, ' + (bytes / 1048576).toFixed(1) + ' MB → seed/');
