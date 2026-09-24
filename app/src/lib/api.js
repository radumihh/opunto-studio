/* The admin's only way to the server. Every call throws an Error whose
   message is ready to show; a 422 also carries the field errors. */
async function call(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || 'Eroare ' + res.status);
        err.status = res.status;
        err.errors = data.errors || [];
        throw err;
    }
    return data;
}

export const api = {
    list: site => call('GET', '/api/projects' + (site ? '?site=' + site : '')),
    get: id => call('GET', '/api/projects/' + id),
    create: (site, extra = {}) => call('POST', '/api/projects', { site, ...extra }),
    save: p => call('PUT', '/api/projects/' + p.id, p),
    remove: id => call('DELETE', '/api/projects/' + id),
    duplicate: id => call('POST', '/api/projects/' + id + '/duplicate'),
    reorder: ids => call('PUT', '/api/order', { ids }),
    settings: () => call('GET', '/api/settings'),
    setPassword: password => call('PUT', '/api/settings/password', { password }),
    draft: p => call('PUT', '/api/preview/draft/' + p.id, p),
    dropDraft: id => call('DELETE', '/api/preview/draft/' + id)
};

/* UPLOAD, one file per request so each has its own progress bar and a
   bad file cannot sink the rest. onProgress(0..1) covers the transfer;
   the server's encode follows, which is what `processing` is for. */
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
            if (xhr.status >= 400 || !Array.isArray(data)) return reject(new Error((data && data.error) || 'Upload eșuat'));
            const r = data[0];
            if (!r || r.error) return reject(new Error(r ? 'Nu e o imagine validă' : 'Upload eșuat'));
            resolve(r);
        };
        xhr.onerror = () => reject(new Error('Conexiune întreruptă'));
        xhr.send(fd);
    });
}

/* tell every open preview (the editor's frame, and any preview tab) */
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('opunto-preview') : null;
export function notifyPreview(msg) {
    if (channel) channel.postMessage(msg);
}
