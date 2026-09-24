import { useRef, useState } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ImagePlus, MoreHorizontal, Trash2, Star, CreditCard, MoveHorizontal, Type, ArrowUpToLine, Loader2, UploadCloud } from 'lucide-react';
import { Button, Badge, Input, Label } from '@/components/ui/primitives';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Dialog, DialogContent } from '@/components/ui/overlays';
import { cn, formatBytes } from '@/lib/utils';
import { useUploads } from './useUploads';

/* ONE PHOTOGRAPH IN THE GRID */
function Tile({ photo, index, isCard, overlay, onMenu, handle, dragging }) {
    const ar = photo.width && photo.height ? photo.width / photo.height : 1.5;
    return (
        <div className={cn('group relative overflow-hidden rounded-lg bg-muted ring-1 ring-black/5',
            dragging && 'shadow-[0_18px_40px_-12px_rgb(0_0_0/0.4)]')}>
            <div {...handle} className="relative aspect-[4/3] cursor-grab touch-none active:cursor-grabbing">
                <img src={photo.sm || photo.src} alt={photo.alt || ''} draggable={false}
                    className="absolute inset-0 size-full object-cover" style={{ objectFit: ar < 0.9 ? 'contain' : 'cover', background: '#eee' }} />
                <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <span className="pointer-events-none absolute top-1.5 left-1.5 grid h-5 min-w-5 place-items-center rounded-md bg-black/65 px-1 font-mono text-[10px] text-white backdrop-blur">
                {index + 1}
            </span>
            <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex flex-wrap gap-1">
                {index === 0 && <Badge className="bg-white/92 text-foreground backdrop-blur"><Star />Copertă</Badge>}
                {isCard && <Badge className="bg-white/92 text-foreground backdrop-blur"><CreditCard />Card</Badge>}
                {photo.spaced && <Badge className="bg-white/92 text-foreground backdrop-blur"><MoveHorizontal />Spațiu</Badge>}
                {photo.alt && <Badge className="bg-white/92 text-foreground backdrop-blur"><Type />Alt</Badge>}
            </div>
            {!overlay && (
                <div className="absolute top-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
                    {onMenu}
                </div>
            )}
        </div>
    );
}

function SortableTile({ photo, ...rest }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.id });
    return (
        <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}>
            <Tile photo={photo} handle={{ ...attributes, ...listeners }} {...rest} />
        </div>
    );
}

/* AN UPLOAD IN FLIGHT: the local file under a progress veil */
function Pending({ item }) {
    const pct = Math.round(item.progress * 100);
    return (
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted ring-1 ring-black/5">
            <img src={item.preview} alt="" className="absolute inset-0 size-full object-cover opacity-45 blur-[1px]" />
            <div className="absolute inset-0 grid place-items-center">
                <div className="grid justify-items-center gap-1.5 rounded-lg bg-white/88 px-3 py-2 text-[11px] font-medium shadow-sm backdrop-blur">
                    {item.phase === 'processing'
                        ? <><Loader2 className="size-4 animate-spin" />Optimizez…</>
                        : <><div className="h-1 w-16 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-primary transition-[width]" style={{ width: pct + '%' }} /></div>{pct}%</>}
                </div>
            </div>
        </div>
    );
}

/* THE GALLERY OF A PROJECT: drop or pick files, drag to reorder, and a
   menu per photograph for everything else. `setPhotos` takes a function
   of the current list, so uploads finishing mid-edit never lose a change. */
export function PhotoManager({ photos, setPhotos, max, cardIndex, onCardIndex, allowSpaced, error }) {
    const input = useRef(null);
    const [over, setOver] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [editing, setEditing] = useState(null);
    const uploads = useUploads(ready => setPhotos(list => [...list, ...ready].slice(0, max)));
    const room = max - photos.length - uploads.items.length;

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    const drop = files => { setOver(false); if (files && files.length) uploads.add(files, room); };
    const update = (id, patch) => setPhotos(list => list.map(p => p.id === id ? { ...p, ...patch } : p));
    const move = (from, to) => setPhotos(list => arrayMove(list, from, to));

    const totalBytes = photos.reduce((s, p) => s + (p.bytes || 0), 0);
    const origBytes = photos.reduce((s, p) => s + (p.originalBytes || p.bytes || 0), 0);
    const active = activeId && photos.find(p => p.id === activeId);
    const edited = editing && photos.find(p => p.id === editing);

    return (
        <div
            onDragEnter={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
            onDrop={e => { e.preventDefault(); drop(e.dataTransfer.files); }}
            className={cn('relative rounded-xl transition-colors', over && 'bg-[oklch(0.96_0.03_250)] ring-2 ring-[oklch(0.65_0.15_250)] ring-offset-4')}>

            <input ref={input} type="file" accept="image/*" multiple hidden
                onChange={e => { drop(e.target.files); e.target.value = ''; }} />

            {photos.length === 0 && uploads.items.length === 0 ? (
                <button type="button" onClick={() => input.current.click()}
                    className={cn('grid w-full cursor-pointer place-items-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors hover:border-foreground/25 hover:bg-muted/50',
                        error && 'border-destructive/50')}>
                    <UploadCloud className="mb-2 size-7 text-muted-foreground" strokeWidth={1.5} />
                    <div className="text-[13px] font-medium">Trage pozele aici sau alege-le</div>
                    <div className="mt-1 text-xs text-muted-foreground">JPG, PNG, WebP, HEIC · până la {max} poze · se optimizează automat</div>
                </button>
            ) : (
                <>
                    <DndContext sensors={sensors} collisionDetection={closestCenter}
                        onDragStart={e => setActiveId(e.active.id)} onDragCancel={() => setActiveId(null)}
                        onDragEnd={({ active: a, over: o }) => {
                            setActiveId(null);
                            if (!o || a.id === o.id) return;
                            move(photos.findIndex(p => p.id === a.id), photos.findIndex(p => p.id === o.id));
                        }}>
                        <SortableContext items={photos.map(p => p.id)} strategy={rectSortingStrategy}>
                            <div className="grid grid-cols-3 gap-2.5">
                                {photos.map((p, i) => (
                                    <SortableTile key={p.id} photo={p} index={i} isCard={cardIndex === i}
                                        onMenu={
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button type="button" aria-label="Opțiuni poză" className="grid size-6 cursor-pointer place-items-center rounded-md bg-white/92 shadow-sm backdrop-blur">
                                                        <MoreHorizontal className="size-3.5" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent>
                                                    {i > 0 && <DropdownMenuItem onSelect={() => move(i, 0)}><ArrowUpToLine />Fă-o copertă</DropdownMenuItem>}
                                                    {onCardIndex && cardIndex !== i && <DropdownMenuItem onSelect={() => onCardIndex(i)}><CreditCard />Folosește pe card</DropdownMenuItem>}
                                                    {allowSpaced && i > 0 && <DropdownMenuItem onSelect={() => update(p.id, { spaced: !p.spaced })}><MoveHorizontal />{p.spaced ? 'Fără spațiu mai mare' : 'Spațiu mai mare înainte'}</DropdownMenuItem>}
                                                    <DropdownMenuItem onSelect={() => setEditing(p.id)}><Type />Descriere (alt)</DropdownMenuItem>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem destructive onSelect={() => setPhotos(list => list.filter(x => x.id !== p.id))}><Trash2 />Scoate din proiect</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        } />
                                ))}
                                {uploads.items.map(it => <Pending key={it.key} item={it} />)}
                                {room > 0 && (
                                    <button type="button" onClick={() => input.current.click()}
                                        className="grid aspect-[4/3] cursor-pointer place-items-center rounded-lg border-2 border-dashed text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted/50 hover:text-foreground">
                                        <div className="grid justify-items-center gap-1 text-xs font-medium"><ImagePlus className="size-5" strokeWidth={1.6} />Adaugă</div>
                                    </button>
                                )}
                            </div>
                        </SortableContext>
                        <DragOverlay>{active ? <Tile photo={active} index={photos.indexOf(active)} isCard={cardIndex === photos.indexOf(active)} overlay dragging /> : null}</DragOverlay>
                    </DndContext>
                    <div className="mt-2.5 flex items-center justify-between text-[12px] text-muted-foreground">
                        <span>{photos.length}/{max} poze · trage ca să reordonezi</span>
                        {totalBytes > 0 && <span className="tabular-nums">{formatBytes(totalBytes)}{origBytes > totalBytes * 1.05 ? ' (din ' + formatBytes(origBytes) + ')' : ''}</span>}
                    </div>
                </>
            )}
            {error && <p className="mt-1.5 text-[12px] text-destructive">{error}</p>}

            {over && (
                <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-xl bg-white/70 backdrop-blur-[2px]">
                    <div className="grid justify-items-center gap-1 text-[13px] font-medium"><UploadCloud className="size-6" />Lasă pozele aici</div>
                </div>
            )}

            <Dialog open={!!edited} onOpenChange={o => !o && setEditing(null)}>
                {edited && (
                    <DialogContent title={'Poza ' + (photos.indexOf(edited) + 1)} className="w-[min(92vw,34rem)]">
                        <img src={edited.src} alt="" className="max-h-[50vh] w-full rounded-lg bg-muted object-contain" />
                        <div className="grid gap-1.5">
                            <Label htmlFor="alt">Ce se vede în poză</Label>
                            <Input id="alt" autoFocus value={edited.alt || ''} maxLength={200} placeholder="ex. Livingul spre grădină, lumina de seară"
                                onChange={e => update(edited.id, { alt: e.target.value })}
                                onKeyDown={e => e.key === 'Enter' && setEditing(null)} />
                            <p className="text-xs text-muted-foreground">Pentru cititoarele de ecran și motoarele de căutare. {edited.width}×{edited.height}px · {formatBytes(edited.bytes)}</p>
                        </div>
                        <div className="flex justify-end"><Button onClick={() => setEditing(null)}>Gata</Button></div>
                    </DialogContent>
                )}
            </Dialog>
        </div>
    );
}

/* ONE IMAGE IN A SMALL SQUARE — a material's texture */
export function ImageSlot({ value, onChange, label = 'Textură' }) {
    const input = useRef(null);
    const [over, setOver] = useState(false);
    const uploads = useUploads(ready => onChange(ready[0]));
    const pending = uploads.items[0];
    const pick = files => { setOver(false); if (files && files[0]) uploads.add([files[0]], 1); };
    return (
        <div
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files); }}
            className={cn('group relative size-[72px] shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-black/5', over && 'ring-2 ring-[oklch(0.65_0.15_250)]')}>
            <input ref={input} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files); e.target.value = ''; }} />
            {pending ? (
                <>
                    <img src={pending.preview} alt="" className="absolute inset-0 size-full object-cover opacity-40" />
                    <div className="absolute inset-0 grid place-items-center"><Loader2 className="size-4 animate-spin" /></div>
                </>
            ) : value ? (
                <>
                    <img src={value.sm || value.src} alt="" className="absolute inset-0 size-full object-cover" />
                    <div className="absolute inset-0 flex items-end justify-center gap-1 bg-black/35 pb-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button type="button" onClick={() => input.current.click()} className="cursor-pointer rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-medium">Schimbă</button>
                        <button type="button" onClick={() => onChange(null)} aria-label="Scoate" className="cursor-pointer rounded bg-white/90 p-0.5"><Trash2 className="size-3" /></button>
                    </div>
                </>
            ) : (
                <button type="button" onClick={() => input.current.click()} className="grid size-full cursor-pointer place-items-center text-muted-foreground hover:text-foreground">
                    <div className="grid justify-items-center gap-0.5 text-[10px] font-medium"><ImagePlus className="size-4" strokeWidth={1.6} />{label}</div>
                </button>
            )}
        </div>
    );
}
