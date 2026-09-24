import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/api';

/* UPLOADS IN FLIGHT. Up to three at once (the server encodes each with
   sharp, which is the slow part), and each result is handed over in the
   order the files were dropped — not in the order they finish — so the
   photographs land in the gallery exactly as they were selected. */
const PARALLEL = 3;

export function useUploads(onDone) {
    const [items, setItems] = useState([]);
    const doneRef = useRef(onDone);
    doneRef.current = onDone;
    const queue = useRef([]);
    const running = useRef(0);

    const patch = (key, p) => setItems(list => list.map(it => it.key === key ? { ...it, ...p } : it));

    /* hand over, in order, every finished upload at the head of the queue */
    const flush = useCallback(() => {
        const q = queue.current;
        const ready = [], removed = [];
        while (q.length && (q[0].result || q[0].failed)) {
            const it = q.shift();
            removed.push(it.key);
            if (it.result) { const { __key, ...photo } = it.result; ready.push(photo); }
            setTimeout(() => URL.revokeObjectURL(it.preview), 2000);
        }
        if (ready.length) doneRef.current(ready);
        if (removed.length) setItems(list => list.filter(it => !removed.includes(it.key)));
    }, []);

    const pump = useCallback(() => {
        while (running.current < PARALLEL) {
            const next = queue.current.find(it => !it.started);
            if (!next) return;
            next.started = true;
            running.current++;
            uploadFile(next.file, {
                onProgress: p => patch(next.key, { progress: p }),
                onProcessing: () => patch(next.key, { phase: 'processing' })
            }).then(r => {
                const { name, originalBytes, ...photo } = r;
                next.result = { ...photo, originalBytes, __key: next.key, alt: '' };
            }).catch(e => {
                next.failed = true;
                toast.error(next.file.name + ': ' + e.message);
            }).finally(() => {
                running.current--;
                flush();
                pump();
            });
        }
    }, [flush]);

    const add = useCallback((files, room = Infinity) => {
        const list = Array.from(files || []);
        let take = list.slice(0, Math.max(0, room));
        if (list.length > take.length) toast.warning('Doar ' + take.length + ' din ' + list.length + ' poze încap aici');
        const fresh = take.map(file => {
            const key = Math.random().toString(36).slice(2);
            return { key, file, name: file.name, size: file.size, preview: URL.createObjectURL(file), progress: 0, phase: 'upload', started: false };
        });
        if (!fresh.length) return;
        queue.current.push(...fresh);
        setItems(l => [...l, ...fresh.map(({ key, name, size, preview, progress, phase }) => ({ key, name, size, preview, progress, phase }))]);
        pump();
    }, [pump]);

    return { items, add, busy: items.length > 0 };
}
