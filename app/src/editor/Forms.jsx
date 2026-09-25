import { useEffect, useState } from 'react';
import { Plus, X, ArrowUp, ArrowDown, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/overlays';
import { Button, Input, Switch, Segmented, Label, Card } from '@/components/ui/primitives';
import { Select } from '@/components/ui/overlays';
import { CATEGORIES, cn } from '@/lib/utils';
import { Section, Field, TextField, AreaField } from './Field';
import { PhotoManager, ImageSlot } from './PhotoManager';
import { FactsEditor, TagInput, WallPicker } from './parts';

/* photos change as a list; the card photo is a position, so it is moved
   along with the photograph it points at */
function photoSetter(p, set) {
    const id = p.id;
    return fn => set(cur => {
        /* an upload that finishes after the editor moved to another project */
        if (!cur || cur.id !== id) return cur;
        const before = cur.photos || [];
        const after = typeof fn === 'function' ? fn(before) : fn;
        if (cur.site !== 'arch') return { ...cur, photos: after };
        const cardId = (before[((cur.card && cur.card.photo) || 1) - 1] || {}).id;
        const at = after.findIndex(x => x.id === cardId);
        return { ...cur, photos: after, card: { ...(cur.card || {}), photo: at >= 0 ? at + 1 : 1 } };
    });
}

/* "after photo n" — and a value past the last photo (photos were removed)
   stays selectable and says what it does now */
function afterOptions(n, autoLabel, current) {
    const opts = [{ value: 'auto', label: autoLabel }].concat(
        Array.from({ length: n }, (_, i) => ({ value: String(i + 1), label: 'După poza ' + (i + 1) })));
    if (current && current > n) opts.push({ value: String(current), label: 'După poza ' + current + (n ? ' (acum: după ultima)' : ' (nu există încă)') });
    return opts;
}

const WIDTHS = [{ value: 'narrow', label: 'Îngust' }, { value: 'medium', label: 'Mediu' }, { value: 'wide', label: 'Lat' }];

function Row({ children, className }) { return <div className={cn('grid grid-cols-2 gap-3', className)}>{children}</div>; }

function SwitchRow({ label, hint, checked, onChange, id }) {
    return (
        <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border bg-card px-3.5 py-3">
            <div>
                <div className="text-[13px] font-medium">{label}</div>
                {hint && <div className="mt-0.5 text-[12px] text-muted-foreground">{hint}</div>}
            </div>
            <Switch id={id} checked={!!checked} onCheckedChange={onChange} />
        </label>
    );
}

/* ====================================================================
   #arch
==================================================================== */
export function ArchForm({ p, set, errors }) {
    const [presets, setPresets] = useState([]);
    useEffect(() => { api.textures().then(t => setPresets(t.presets)).catch(() => {}); }, []);
    const upd = patch => set(cur => ({ ...cur, ...patch }));
    const n = (p.photos || []).length;
    const texts = p.texts || [];
    const mats = p.materials || { note: '', afterPhoto: null, items: [] };
    const setText = (i, patch) => upd({ texts: texts.map((t, k) => k === i ? { ...t, ...patch } : t) });
    const moveText = (i, j) => { const x = texts.slice(); [x[i], x[j]] = [x[j], x[i]]; upd({ texts: x }); };
    const setMats = patch => upd({ materials: { ...mats, ...patch } });
    const setMat = (i, patch) => setMats({ items: mats.items.map((m, k) => k === i ? { ...m, ...patch } : m) });
    const AUTO = ['după poza 3', 'după poza 6', 'după poza 9', 'după poza 12'];

    return (
        <>
            <Section id="general" title="General" description="Numele și locul proiectului în portofoliu.">
                <TextField id="name" label="Nume proiect" value={p.name} max={40} placeholder="ex. Casa Tartasesti"
                    onChange={v => upd({ name: v })} error={errors.name} />
                <Field label="Categorie" error={errors.category}>
                    <Select value={p.category} onValueChange={v => upd({ category: v })}
                        options={CATEGORIES.map(c => ({ value: c.id, label: c.label }))} />
                </Field>
                <Field label="Mărimea cardului în listă" hint="Lățimea cardului în strip. Arată cel mai bine alternate: lat, mediu, lat, îngust.">
                    <div className="flex items-center gap-4">
                        <Segmented value={(p.card && p.card.size) || 'wide'} onChange={v => upd({ card: { ...(p.card || {}), size: v } })}
                            options={[{ value: 'wide', label: 'Lat' }, { value: 'mid', label: 'Mediu' }, { value: 'slim', label: 'Îngust' }]} />
                        <div className="flex h-7 items-end gap-1" aria-hidden="true">
                            {['wide', 'mid', 'slim'].map(s => (
                                <div key={s} className={cn('h-full rounded-sm transition-colors', s === 'wide' ? 'w-10' : s === 'mid' ? 'w-8' : 'w-6',
                                    ((p.card && p.card.size) || 'wide') === s ? 'bg-foreground/75' : 'bg-foreground/12')} />
                            ))}
                        </div>
                    </div>
                </Field>
                <SwitchRow id="namelist" label="Apare în lista de nume" hint="Rândul „Nineteen projects since 2016” de sub portofoliu."
                    checked={p.inNameList !== false} onChange={v => upd({ inNameList: v })} />
                {p.inNameList !== false && (
                    <TextField id="listName" label="Nume scurt în listă" value={p.listName} max={28} placeholder={p.name || 'ex. Tartasesti'}
                        hint="Gol = numele proiectului." onChange={v => upd({ listName: v })} error={errors.listName} />
                )}
            </Section>

            <Section id="photos" title="Fotografii" description="În ordinea din pagină. Prima e coperta. Din meniul fiecărei poze alegi poza de pe card sau un spațiu mai mare înaintea ei.">
                <PhotoManager photos={p.photos || []} setPhotos={photoSetter(p, set)} max={40} allowSpaced
                    cardIndex={((p.card && p.card.photo) || 1) - 1}
                    onCardIndex={i => upd({ card: { ...(p.card || {}), photo: i + 1 } })}
                    error={errors.photos} />
            </Section>

            <Section id="facts" title="Date proiect" description="Blocul „Project data” de lângă copertă. Rândul „Photographs” se adaugă singur.">
                <FactsEditor facts={p.facts} onChange={v => upd({ facts: v })} max={8} labelMax={24} valueMax={32}
                    labelHint="Area" valueHint="240 m²" error={errors.facts} />
            </Section>

            <Section id="texts" title="Texte" description="Blocurile de text dintre poze. Primul e afișat mai mare. Un rând liber în text începe un paragraf nou."
                action={texts.length < 4 && (
                    <Button variant="outline" size="sm" onClick={() => upd({ texts: [...texts, { heading: ['Context', 'Approach', 'Detail', 'Notes'][texts.length], body: '', afterPhoto: null }] })}>
                        <Plus />Text
                    </Button>
                )}>
                {texts.length === 0 && <p className={cn('text-[13px]', errors.texts ? 'text-destructive' : 'text-muted-foreground')}>{errors.texts || 'Niciun text încă.'}</p>}
                {texts.map((t, i) => (
                    <Card key={i} className="grid gap-3 p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-secondary font-mono text-[11px]">{i + 1}</span>
                            <Input value={t.heading} maxLength={24} placeholder="Titlu mic (ex. Context)" onChange={e => setText(i, { heading: e.target.value })} className="h-8 min-w-[120px] flex-1" />
                            <div className="order-last w-full sm:order-none sm:w-44 sm:shrink-0">
                                <Select value={t.afterPhoto ? String(t.afterPhoto) : 'auto'} onValueChange={v => setText(i, { afterPhoto: v === 'auto' ? null : +v })}
                                    options={afterOptions(n, 'Automat (' + AUTO[i] + ')', t.afterPhoto)} className="h-8" />
                            </div>
                            <div className="flex shrink-0">
                                <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => moveText(i, i - 1)} aria-label="Mută sus"><ArrowUp /></Button>
                                <Button variant="ghost" size="icon-sm" disabled={i === texts.length - 1} onClick={() => moveText(i, i + 1)} aria-label="Mută jos"><ArrowDown /></Button>
                                <Button variant="ghost" size="icon-sm" onClick={() => upd({ texts: texts.filter((_, k) => k !== i) })} aria-label="Șterge textul"><X /></Button>
                            </div>
                        </div>
                        <AreaField value={t.body} max={1600} rows={4} placeholder="Ce era pe teren, pentru cine e casa, ce decizie organizează planul…"
                            onChange={v => setText(i, { body: v })} />
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            Lățime
                            <Segmented size="sm" value={t.width || 'medium'} onChange={v => setText(i, { width: v })} options={WIDTHS} />
                        </div>
                    </Card>
                ))}
            </Section>

            <Section id="materials" title="Materiale" description="Paleta de materiale. Fără materiale și fără notă, blocul nu apare în pagină.">
                <AreaField label="Notă despre materiale" value={mats.note} max={240} rows={2}
                    placeholder="De ce aceste materiale și ce face fiecare." onChange={v => setMats({ note: v })} />
                <Field label="Poziție în pagină">
                    <Select value={mats.afterPhoto ? String(mats.afterPhoto) : 'auto'} onValueChange={v => setMats({ afterPhoto: v === 'auto' ? null : +v })}
                        options={afterOptions(n, 'Automat (după poza 4)', mats.afterPhoto)} />
                </Field>
                <div className="grid gap-2">
                    {(mats.items || []).map((m, i) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-2">
                            <ImageSlot value={m.image} onChange={img => setMat(i, { image: img })} />
                            <div className="grid flex-1 gap-1.5">
                                <Label className="text-xs text-muted-foreground">Nume material</Label>
                                <Input value={m.name} maxLength={28} placeholder="ex. Black oak veneer" onChange={e => setMat(i, { name: e.target.value })} />
                            </div>
                            <Button variant="ghost" size="icon-sm" onClick={() => setMats({ items: mats.items.filter((_, k) => k !== i) })} aria-label="Șterge materialul"><X /></Button>
                        </div>
                    ))}
                    {(mats.items || []).length < 4 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => setMats({ items: [...(mats.items || []), { name: '', image: null }] })}>
                                <Plus />Material
                            </Button>
                            {presets.filter(t => !(mats.items || []).some(m => m.image && m.image.id === t.image.id)).length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><Layers />Din texturile site-ului</Button></DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        {presets.filter(t => !(mats.items || []).some(m => m.image && m.image.id === t.image.id)).map(t => (
                                            <DropdownMenuItem key={t.image.id} onSelect={() => setMats({ items: [...(mats.items || []), { name: t.name, image: t.image }].slice(0, 4) })}>
                                                <img src={t.image.src} alt="" className="size-5 rounded object-cover" />{t.name}
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    )}
                    <p className="text-[12px] text-muted-foreground">Textura: o poză pătrată, de aproape, cu materialul (trag-o peste pătrat sau apasă pe el), ori una din cele patru texturi pe care le folosește site-ul acum. Culoarea de sub ea e măsurată automat.</p>
                </div>
            </Section>
        </>
    );
}

/* ====================================================================
   #concepts
==================================================================== */
const TYPES = ['Main stage architecture', 'Stage architecture', 'Brand environment', 'Brand pavilion', 'Lounge scenography', 'Scenography', 'Immersive capsule', 'Public installation'];
const SCOPES = ['Concept', '3D visualisation', 'Technical drawings', 'Production', 'Build supervision'];

export function ConceptsForm({ p, set, errors, others }) {
    const upd = patch => set(cur => ({ ...cur, ...patch }));
    const heroElsewhere = others.find(o => o.wallHero && o.status === 'published');
    return (
        <>
            <Section id="general" title="General" description="Ce apare pe perete la hover și în capul paginii.">
                <TextField id="title" label="Nume proiect" value={p.title} max={32} placeholder="ex. Nibiru" onChange={v => upd({ title: v })} error={errors.title} />
                <Row>
                    <TextField id="client" label="Client" value={p.client} max={40} placeholder="ex. Coca-Cola" onChange={v => upd({ client: v })} error={errors.client} />
                    <TextField id="type" label="Tip lucrare" value={p.type} max={32} placeholder="ex. Brand environment" list="cx-types" onChange={v => upd({ type: v })} error={errors.type} />
                </Row>
                <datalist id="cx-types">{TYPES.map(t => <option key={t} value={t} />)}</datalist>
                <Row className="grid-cols-[2fr_1fr]">
                    <TextField id="place" label="Locație" value={p.place} max={32} placeholder="ex. Untold, Cluj" onChange={v => upd({ place: v })} error={errors.place} />
                    <Field label="An" error={errors.year}>
                        <Input value={p.year || ''} inputMode="numeric" maxLength={4} placeholder="2024" aria-invalid={!!errors.year || undefined}
                            onChange={e => upd({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
                    </Field>
                </Row>
            </Section>

            <Section id="photos" title="Fotografii" description="Cinci poze, în ordinea din pagină. Prima apare și pe perete. A treia și a cincea sunt afișate mai mici, cu număr.">
                <PhotoManager photos={p.photos || []} setPhotos={photoSetter(p, set)} max={5} error={errors.photos} />
            </Section>

            <Section id="facts" title="Trei cifre" description="Cifrele care descriu proiectul, cu litere mici. Apar pe perete și în pagină.">
                <FactsEditor facts={p.facts} onChange={v => upd({ facts: v })} max={3} labelMax={16} valueMax={16}
                    labelHint="span" valueHint="40 m" error={errors.facts} />
            </Section>

            <Section id="texts" title="Texte">
                <AreaField id="summary" label="Descriere într-o frază" hint="Pe perete, când se deschide proiectul, și în pagină („in one line”)."
                    value={p.summary} max={180} rows={2} onChange={v => upd({ summary: v })} error={errors.summary} />
                <AreaField id="story" label="Povestea proiectului" hint="Blocul „The brief”. Prima frază e scoasă în evidență."
                    value={p.story} max={700} rows={5} onChange={v => upd({ story: v })} error={errors.story} />
                <AreaField id="approach" label="Abordare" hint="Cum s-a lucrat. Un rând liber începe un paragraf nou."
                    value={p.approach} max={1000} rows={5} onChange={v => upd({ approach: v })} error={errors.approach} />
                <Field label="Ce am făcut" hint="Lista numerotată de sub abordare. Enter adaugă.">
                    <TagInput value={p.scope} onChange={v => upd({ scope: v })} max={8} itemMax={32} placeholder="ex. Concept"
                        suggestions={SCOPES} error={errors.scope} />
                </Field>
                <Field label="Lățimea textelor" hint="Pentru „The brief”, „In one line” și „Approach”. Mediu e lățimea de pe site.">
                    <Segmented value={p.textWidth || 'medium'} onChange={v => upd({ textWidth: v })} options={WIDTHS} />
                </Field>
            </Section>

            <Section id="wall" title="Perete" description="Unde stă proiectul pe peretele de 5×3 al secțiunii.">
                <WallPicker value={p.wallSlot} onChange={v => upd({ wallSlot: v })} others={others} error={errors.wallSlot} />
                <SwitchRow id="hero" label="Panoul final" checked={p.wallHero} onChange={v => upd({ wallHero: v })}
                    hint={heroElsewhere && !p.wallHero
                        ? 'Acum e „' + heroElsewhere.title + '”. Doar unul poate fi publicat ca panou final.'
                        : 'Poza pe care se oprește peretele. Ideal în B3, cu o poză lată și luminoasă.'} />
                {errors.wallHero && <p className="text-[12px] text-destructive">{errors.wallHero}</p>}
            </Section>
        </>
    );
}
