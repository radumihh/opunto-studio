/* OPUNTO STUDIO — the Windows app.

   The same server as on a VM, started inside Electron on 127.0.0.1, and a
   window pointed at it. Nothing else is needed on the client's computer.

   Projects and photos live in Documents\Opunto Studio:
     data\db.json          the projects
     data\settings.json    passwords, signing secret
     poze\architecture\<project>\1.avif …   poze\concepts\…
   On the first start that folder is filled with the projects and photos
   the app was built with (data/db.json and poze/ from the repo). After
   that it is the client's own and updates of the app never touch it. */
import { app, BrowserWindow, Menu, shell, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

/* the port stays the same between starts when it can, so the window's
   own storage (remembered filters, open tabs) carries over */
function freePort(preferred) {
    return new Promise(resolve => {
        const s = net.createServer();
        s.once('error', () => { const t = net.createServer().listen(0, '127.0.0.1', () => { const p = t.address().port; t.close(() => resolve(p)); }); });
        s.listen(preferred, '127.0.0.1', () => s.close(() => resolve(preferred)));
    });
}

function seed(home) {
    const data = path.join(home, 'data');
    const poze = path.join(home, 'poze');
    if (!fs.existsSync(path.join(data, 'db.json'))) {
        fs.mkdirSync(data, { recursive: true });
        const db = path.join(ROOT, 'data', 'db.json');
        if (fs.existsSync(db)) fs.copyFileSync(db, path.join(data, 'db.json'));
        const src = path.join(ROOT, 'poze');
        if (fs.existsSync(src)) fs.cpSync(src, poze, { recursive: true, force: false, errorOnExist: false,
            filter: f => !f.includes(path.sep + '_incoming') });
    }
    fs.mkdirSync(poze, { recursive: true });
    return { data, poze };
}

async function waitFor(url, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try { if ((await fetch(url)).ok) return true; } catch (e) { /* not up yet */ }
        await new Promise(r => setTimeout(r, 150));
    }
    return false;
}

async function start() {
    const home = process.env.OPUNTO_HOME || path.join(app.getPath('documents'), 'Opunto Studio');
    const { data, poze } = seed(home);
    const port = await freePort(47821);
    Object.assign(process.env, {
        PORT: String(port), HOST: '127.0.0.1',
        DATA_DIR: data, UPLOADS_DIR: poze,
        NODE_ENV: 'production'
    });
    await import(pathToFileURL(path.join(ROOT, 'server.js')).href);
    const base = 'http://127.0.0.1:' + port;
    if (!await waitFor(base + '/api/auth/me')) throw new Error('Serverul intern nu a pornit.');
    return base;
}

function open(base) {
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
        width: 1440, height: 900, minWidth: 900, minHeight: 600,
        title: 'Opunto Studio', backgroundColor: '#f5f5f7', show: false,
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false }
    });
    win.once('ready-to-show', () => { win.maximize(); win.show(); });
    /* the preview in its own window stays in the app; anything else opens in the browser */
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith(base)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1440, height: 900, autoHideMenuBar: true, backgroundColor: '#000' } };
        if (/^https?:/.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(base)) { e.preventDefault(); shell.openExternal(url); }
    });
    /* F5 / Ctrl+R reload, F12 tools — the menu that carried them is gone */
    win.webContents.on('before-input-event', (e, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { win.webContents.reload(); e.preventDefault(); }
        if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    });
    win.on('closed', () => { win = null; });
    win.loadURL(base);
}

app.whenReady().then(async () => {
    try { open(await start()); }
    catch (e) {
        dialog.showErrorBox('Opunto Studio', 'Aplicația nu a putut porni.\n\n' + (e && e.message || e));
        app.quit();
    }
});
app.on('window-all-closed', () => app.quit());
