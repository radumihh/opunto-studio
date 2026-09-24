/* The studio's only way to the server. Every call throws an Error whose
   message is ready to show; a 422 also carries the field errors, a 409 the
   version saved elsewhere. A 401 means the session ended: the app goes
   back to the sign-in screen. */
async function call(method, url, body) {
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            credentials: 'same-origin'
        });
    } catch (e) {
        throw new Error('Serverul nu răspunde. Verifică conexiunea.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        if (res.status === 401 && !url.startsWith('/api/auth/')) dispatchEvent(new Event('opunto:signed-out'));
        const err = new Error(data.error || 'Eroare ' + res.status);
        err.status = res.status;
        err.errors = data.errors || [];
        err.current = data.current;
        throw err;
    }
    return data;
}

export const auth = {
    me: () => call('GET', '/api/auth/me'),
    login: password => call('POST', '/api/auth/login', { password }),
    logout: () => call('POST', '/api/auth/logout')
};

export const api = {
    list: site => call('GET', '/api/projects' + (site ? '?site=' + site : '')),
    get: id => call('GET', '/api/projects/' + id),
    create: (site, extra = {}) => call('POST', '/api/projects', { site, ...extra }),
    save: (p, force) => call('PUT', '/api/projects/' + p.id + (force ? '?force=1' : ''), p),
    remove: id => call('DELETE', '/api/projects/' + id),
    duplicate: id => call('POST', '/api/projects/' + id + '/duplicate'),
    reorder: ids => call('PUT', '/api/order', { ids }),
    textures: () => call('GET', '/api/textures'),
    settings: () => call('GET', '/api/settings'),
    setPassword: password => call('PUT', '/api/settings/password', { password }),
    setAdmin: (current, next) => call('PUT', '/api/settings/admin', { current, next }),
    draft: p => call('PUT', '/api/preview/draft/' + p.id, p),
    dropDraft: id => call('DELETE', '/api/preview/draft/' + id)
};

/* UPLOAD, one file per request so each has its own progress bar and a
   bad file cannot sink the rest. onProgress(0..1) covers the transfer;
   the server's encode follows, which is what `onProcessing` is for. */
export function uploadFile(file, { onProgress, onProcessing } = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('files', file, file.name);
        xhr.open('POST', '/api/uploads');
        xhr.upload.onprogress = e => {
            if (!e.lengthComputable) return;
            onProgress && onProgress(e.loaded / e.total);
            if (e.loaded === e.total) onProcessing && onProcessing();
        };
        xhr.onload = () => {
            let data;
            try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
            if (xhr.status === 401) { dispatchEvent(new Event('opunto:signed-out')); return reject(new Error('Sesiunea a expirat')); }
            if (xhr.status >= 400 || !Array.isArray(data)) return reject(new Error((data && data.error) || 'Upload eșuat'));
            const r = data[0];
            if (!r) return reject(new Error('Upload eșuat'));
            if (r.error) return reject(new Error(r.error));
            resolve(r);
        };
        xhr.onerror = () => reject(new Error('Conexiune întreruptă'));
        xhr.send(fd);
    });
}

/* tell every open preview (the editor's frame, and any preview tab) */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('opunto-preview') : null;
export function notifyPreview(msg) {
    if (channel) { channel.postMessage(msg); return; }
    /* without the channel: the editor's own frame, directly */
    document.querySelectorAll('iframe[data-preview]').forEach(f => {
        try { f.contentWindow.postMessage({ __opunto: true, ...msg }, location.origin); } catch (e) {}
    });
}
