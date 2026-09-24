import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Search, Lock, MoreHorizontal, Copy, Trash2, ExternalLink, ImageOff, GripVertical, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Badge, Segmented } from '@/components/ui/primitives';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Confirm } from '@/components/ui/overlays';
import { cn, CATEGORIES, categoryLabel, projectName, coverOf, timeAgo } from '@/lib/utils';

const TITLES = {
    arch: { title: 'Architecture', sub: 'Proiectele din #arch, pe cele trei categorii. Trage cardurile ca să schimbi ordinea din site.' },
    concepts: { title: 'Concepts', sub: 'Proiectele din #concepts. Ordinea dă numărul proiectului (No. 001) și proiectul următor.' }
};

function ProjectCard({ p, onOpen, onDuplicate, onDelete, dragging, handleProps }) {
    const cover = coverOf(p);
    return (
        <div className={cn('group relative overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-shadow hover:shadow-[0_8px_24px_-8px_rgb(0_0_0/0.18)]',
            dragging && 'shadow-[0_18px_40px_-12px_rgb(0_0_0/0.35)] ring-1 ring-black/5')}>
            <button type="button" onClick={onOpen} className="block w-full cursor-pointer text-left">
                <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {cover
                        ? <img src={cover.sm || cover.src} alt="" draggable={false} className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
                        : <div className="grid size-full place-items-center text-muted-foreground/60"><ImageOff className="size-6" strokeWidth={1.5} /></div>}
                    <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                        {p.status === 'published'
                            ? <Badge variant="success" className="bg-white/92 backdrop-blur">Publicat</Badge>
                            : <Badge variant="secondary" className="bg-white/92 backdrop-blur">Draft</Badge>}
                        {p.protected && <Badge variant="secondary" className="bg-white/92 backdrop-blur"><Lock />Parolă</Badge>}
                    </div>
                </div>
                <div className="flex items-start justify-between gap-2 px-3.5 pt-3 pb-3.5">
                    <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold tracking-tight">{projectName(p)}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                            {p.site === 'arch'
                                ? categoryLabel(p.category)
                                : [p.wallSlot, p.type, p.year].filter(Boolean).join(' · ') || 'Fără detalii'}
                            <span className="opacity-60"> · {(p.photos || []).length} poze · {timeAgo(p.updatedAt)}</span>
                        </div>
                    </div>
                </div>
            </button>
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button type="button" {...handleProps} aria-label="Trage pentru a reordona"
                    className="grid size-7 cursor-grab place-items-center rounded-md bg-white/92 shadow-sm backdrop-blur active:cursor-grabbing">
                    <GripVertical className="size-4" />
                </button>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button type="button" aria-label="Acțiuni" className="grid size-7 cursor-pointer place-items-center rounded-md bg-white/92 shadow-sm backdrop-blur">
                            <MoreHorizontal className="size-4" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={onOpen}><ExternalLink />Editează</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => window.open('/preview/' + p.site + '.html?id=' + p.id, '_blank')}><Eye />Preview în tab nou</DropdownMenuItem>
                        <DropdownMenuItem onSelect={onDuplicate}><Copy />Duplică</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={onDelete}><Trash2 />Șterge</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
}

function Sortable({ id, children, disabled }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}>
            {children({ ...attributes, ...listeners })}
        </div>
    );
}

export default function ProjectsPage({ site }) {
    const nav = useNavigate();
    const [list, setList] = useState(null);
    const [q, setQ] = useState('');
    const [cat, setCat] = useState('all');
    const [status, setStatus] = useState('all');
    const [activeId, setActiveId] = useState(null);
    const [toDelete, setToDelete] = useState(null);

    useEffect(() => {
        setList(null); setCat('all'); setQ(''); setStatus('all');
        api.list(site).then(setList).catch(e => toast.error(e.message));
    }, [site]);

    const shown = useMemo(() => (list || []).filter(p => {
        if (site === 'arch' && cat !== 'all' && p.category !== cat) return false;
        if (status !== 'all' && p.status !== status) return false;
        if (q && !projectName(p).toLowerCase().includes(q.toLowerCase())) return false;
        return true;
    }), [list, q, cat, status, site]);
    const filtering = !!q || status !== 'all';

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    async function onDragEnd({ active, over }) {
        setActiveId(null);
        if (!over || active.id === over.id) return;
        const from = list.findIndex(p => p.id === active.id);
        const to = list.findIndex(p => p.id === over.id);
        const next = arrayMove(list, from, to);
        setList(next);
        try { await api.reorder(next.map(p => p.id)); toast.success('Ordine salvată'); }
        catch (e) { toast.error(e.message); api.list(site).then(setList); }
    }

    async function create() {
        try {
            const p = await api.create(site, site === 'arch' && cat !== 'all' ? { category: cat } : {});
            nav('/p/' + p.id);
        } catch (e) { toast.error(e.message); }
    }
    async function duplicate(p) {
        try { const c = await api.duplicate(p.id); setList(l => [...l, c]); toast.success('Duplicat: ' + projectName(c)); }
        catch (e) { toast.error(e.message); }
    }
    async function remove(p) {
        try {
            await api.remove(p.id);
            setList(l => l.filter(x => x.id !== p.id));
            toast.success('„' + projectName(p) + '” a fost șters');
        } catch (e) { toast.error(e.message); }
    }

    const counts = useMemo(() => {
        const c = { all: (list || []).length };
        CATEGORIES.forEach(k => { c[k.id] = (list || []).filter(p => p.category === k.id).length; });
        return c;
    }, [list]);
    const active = activeId && (list || []).find(p => p.id === activeId);
    /* the number the site gives it: its place in its own category (#arch)
       or in the whole wall (#concepts) */
    const numberOf = p => (list || []).filter(o => site !== 'arch' || o.category === p.category).indexOf(p) + 1;

    return (
        <div className="mx-auto max-w-[1280px] px-4 pt-6 pb-16 md:px-8 md:pt-8">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="font-display text-[28px] font-semibold tracking-[-0.022em]">{TITLES[site].title}</h1>
                    <p className="mt-1 max-w-xl text-[13px] text-muted-foreground">{TITLES[site].sub}</p>
                </div>
                <Button onClick={create} size="lg"><Plus />Proiect nou</Button>
            </header>

            <div className="mb-5 flex flex-wrap items-center gap-2.5">
                {site === 'arch' && (
                    <Segmented value={cat} onChange={setCat}
                        options={[{ value: 'all', label: <>Toate <span className="opacity-50">{counts.all}</span></> },
                            ...CATEGORIES.map(c => ({ value: c.id, label: <>{c.label} <span className="opacity-50">{counts[c.id]}</span></> }))]} />
                )}
                <Segmented value={status} onChange={setStatus}
                    options={[{ value: 'all', label: 'Toate' }, { value: 'published', label: 'Publicate' }, { value: 'draft', label: 'Draft' }]} />
                <div className="relative w-full sm:ml-auto sm:w-64">
                    <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Caută proiect" className="pl-8" />
                </div>
            </div>

            {list === null ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                    {Array.from({ length: 6 }).map((_, i) => <div key={i} className="aspect-[4/3.9] animate-pulse rounded-xl bg-muted" />)}
                </div>
            ) : shown.length === 0 ? (
                <div className="grid place-items-center rounded-2xl border border-dashed py-24 text-center">
                    <div>
                        <div className="text-[15px] font-semibold">{list.length ? 'Nimic nu se potrivește' : 'Niciun proiect încă'}</div>
                        <p className="mt-1 text-[13px] text-muted-foreground">{list.length ? 'Schimbă filtrele sau căutarea.' : 'Primul proiect durează două minute: nume, poze, câteva rânduri.'}</p>
                        {!list.length && <Button onClick={create} className="mt-4"><Plus />Proiect nou</Button>}
                    </div>
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragStart={e => setActiveId(e.active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
                    <SortableContext items={shown.map(p => p.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
                            {shown.map(p => (
                                <Sortable key={p.id} id={p.id} disabled={filtering}>
                                    {handleProps => (
                                        <div className="relative">
                                            <span className="absolute -top-2 -left-2 z-10 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground shadow">
                                                {String(numberOf(p)).padStart(2, '0')}
                                            </span>
                                            <ProjectCard p={p} handleProps={handleProps}
                                                onOpen={() => nav('/p/' + p.id)}
                                                onDuplicate={() => duplicate(p)}
                                                onDelete={() => setToDelete(p)} />
                                        </div>
                                    )}
                                </Sortable>
                            ))}
                        </div>
                    </SortableContext>
                    <DragOverlay>{active ? <ProjectCard p={active} dragging /> : null}</DragOverlay>
                </DndContext>
            )}
            {filtering && shown.length > 0 && <p className="mt-4 text-xs text-muted-foreground">Reordonarea e disponibilă când nu cauți și nu filtrezi după stare.</p>}

            <Confirm open={!!toDelete} onOpenChange={o => !o && setToDelete(null)}
                title={'Ștergi „' + (toDelete ? projectName(toDelete) : '') + '”?'}
                description="Proiectul și pozele lui sunt șterse definitiv de pe server. Acțiunea nu poate fi anulată."
                confirmLabel="Șterge definitiv" destructive onConfirm={() => remove(toDelete)} />
        </div>
    );
}
