import { useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown } from 'lucide-react';
import { Button, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/* LABEL / VALUE ROWS — "Area / 240 m²" */
export function FactsEditor({ facts, onChange, max, fixed, labelMax, valueMax, labelHint, valueHint, error }) {
    const rows = facts || [];
    const set = (i, patch) => onChange(rows.map((r, k) => k === i ? { ...r, ...patch } : r));
    const swap = (i, j) => { const n = rows.slice(); [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
    return (
        <div className="grid gap-2">
            {rows.length > 0 && (
                <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-0.5 text-[11px] font-medium text-muted-foreground">
                    <span>Etichetă</span><span>Valoare</span><span className="w-[88px]" />
                </div>
            )}
            {rows.map((r, i) => (
                <div key={i} className="group grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                    <Input value={r.label} maxLength={labelMax} placeholder={labelHint} onChange={e => set(i, { label: e.target.value })} />
                    <Input value={r.value} maxLength={valueMax} placeholder={valueHint} onChange={e => set(i, { value: e.target.value })} />
                    <div className="flex w-[88px] justify-end gap-0.5 opacity-40 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Button type="button" variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label="Mută sus"><ArrowUp /></Button>
                        <Button type="button" variant="ghost" size="icon-sm" disabled={i === rows.length - 1} onClick={() => swap(i, i + 1)} aria-label="Mută jos"><ArrowDown /></Button>
                        {!fixed && <Button type="button" variant="ghost" size="icon-sm" onClick={() => onChange(rows.filter((_, k) => k !== i))} aria-label="Șterge rândul"><X /></Button>}
                    </div>
                </div>
            ))}
            {!fixed && rows.length < max && (
                <Button type="button" variant="outline" size="sm" className="justify-self-start" onClick={() => onChange([...rows, { label: '', value: '' }])}>
                    <Plus />Adaugă rând
                </Button>
            )}
            {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>
    );
}

/* A LIST OF SHORT STRINGS, as chips — "Concept", "Production" … */
export function TagInput({ value, onChange, max, itemMax, placeholder, suggestions = [], error }) {
    const [draft, setDraft] = useState('');
    const list = value || [];
    const add = t => {
        const s = t.trim().slice(0, itemMax);
        if (!s || list.includes(s) || list.length >= max) return;
        onChange([...list, s]);
        setDraft('');
    };
    const left = suggestions.filter(s => !list.includes(s));
    return (
        <div className="grid gap-2">
            <div className={cn('flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-1.5 py-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25', error && 'border-destructive')}>
                {list.map((t, i) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-2 text-[12px] font-medium">
                        <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>{t}
                        <button type="button" onClick={() => onChange(list.filter(x => x !== t))} className="cursor-pointer rounded p-0.5 hover:bg-black/5" aria-label={'Scoate ' + t}><X className="size-3" /></button>
                    </span>
                ))}
                {list.length < max && (
                    <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={list.length ? '' : placeholder}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
                            else if (e.key === 'Backspace' && !draft && list.length) onChange(list.slice(0, -1));
                        }}
                        onBlur={() => add(draft)}
                        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground/70" />
                )}
            </div>
            {left.length > 0 && list.length < max && (
                <div className="flex flex-wrap gap-1">
                    {left.map(s => (
                        <button key={s} type="button" onClick={() => add(s)}
                            className="cursor-pointer rounded-md border border-dashed px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-foreground/30 hover:text-foreground">
                            + {s}
                        </button>
                    ))}
                </div>
            )}
            {error && <p className="text-[12px] text-destructive">{error}</p>}
        </div>
    );
}

/* THE WALL — fifteen seats; the ones other projects hold are shown with
   their names, and a published project may not share a seat */
export function WallPicker({ value, onChange, others, error }) {
    const taken = {};
    others.forEach(o => { if (o.wallSlot) (taken[o.wallSlot] = taken[o.wallSlot] || []).push(o); });
    return (
        <div className="grid gap-2">
            <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-1.5">
                <span />
                {[1, 2, 3, 4, 5].map(c => <span key={c} className="text-center font-mono text-[10px] text-muted-foreground">{c}</span>)}
                {['A', 'B', 'C'].map(r => [
                    <span key={r} className="grid place-items-center pr-1 font-mono text-[10px] text-muted-foreground">{r}</span>,
                    ...[1, 2, 3, 4, 5].map(c => {
                        const slot = r + c, on = value === slot, t = taken[slot];
                        const pub = t && t.some(o => o.status === 'published');
                        const img = t && t[0].photos && t[0].photos[0];
                        return (
                            <button key={slot} type="button" onClick={() => onChange(on ? null : slot)}
                                title={t ? t.map(o => (o.title || 'Fără nume') + (o.status === 'published' ? '' : ' (draft)')).join(', ') : 'Liber'}
                                className={cn('relative aspect-[4/3] cursor-pointer overflow-hidden rounded-md text-left ring-1 transition-all',
                                    on ? 'ring-2 ring-primary' : 'ring-black/10 hover:ring-black/30',
                                    !t && !on && 'bg-muted/60')}>
                                {img && <img src={img.sm || img.src} alt="" className={cn('absolute inset-0 size-full object-cover', !on && 'opacity-45 grayscale')} />}
                                {on && !img && <div className="absolute inset-0 bg-primary/10" />}
                                <span className={cn('absolute top-1 left-1 rounded px-1 font-mono text-[9px]', on ? 'bg-primary text-primary-foreground' : 'bg-white/85')}>{slot}</span>
                                {t && <span className={cn('absolute right-1 bottom-1 left-1 truncate rounded px-1 text-[9px] font-medium', pub ? 'bg-white/90' : 'bg-white/70 italic')}>{t[0].title || 'Fără nume'}</span>}
                            </button>
                        );
                    })
                ])}
            </div>
            <p className={cn('text-[12px]', error ? 'text-destructive' : 'text-muted-foreground')}>
                {error || (value ? 'Poziția ' + value + (taken[value] ? ' — ocupată și de „' + taken[value][0].title + '”; la publicare trebuie să fie liberă.' : '') : 'Alege o poziție. Fără poziție, proiectul nu apare pe perete.')}
            </p>
        </div>
    );
}
