import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useBlocker } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronLeft, Lock, LockOpen, MoreHorizontal, Copy, Trash2, ExternalLink, PanelRightOpen, Loader2, Check, AlertCircle } from 'lucide-react';
import { api, notifyPreview } from '@/lib/api';
import { Button, Switch, Segmented, Tooltip, Badge } from '@/components/ui/primitives';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, Confirm } from '@/components/ui/overlays';
import { ArchForm, ConceptsForm } from '@/editor/Forms';
import { PreviewPane } from '@/editor/PreviewPane';
import { cn, projectName, categoryLabel } from '@/lib/utils';

/* the fields the editor sends; bookkeeping is the server's */
const strip = p => { const { updatedAt, createdAt, ...rest } = p; return rest; };

export default function EditorPage() {
    const { id } = useParams();
    const nav = useNavigate();
    const [p, setP] = useState(null);
    const [saved, setSaved] = useState('');
    const [base, setBase] = useState(null);          /* updatedAt of the version being edited */
    const [others, setOthers] = useState([]);
    const [errors, setErrors] = useState([]);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(() => localStorage.getItem('pv-open') !== '0');
    const [confirm, setConfirm] = useState(null);
    const [hasPassword, setHasPassword] = useState(true);
    const leaving = useRef(false);
    /* the preview needs room: below 1100px it moves to its own tab */
    const [wide, setWide] = useState(() => matchMedia('(min-width: 1100px)').matches);
    useEffect(() => {
        const mq = matchMedia('(min-width: 1100px)');
        const on = () => setWide(mq.matches);
        mq.addEventListener('change', on);
        return () => mq.removeEventListener('change', on);
    }, []);
    const previewOn = showPreview && wide;

    /* ---- load ---- */
    function take(proj) {
        setP(proj);
        setSaved(JSON.stringify(strip(proj)));
        setBase(proj.updatedAt);
    }
    useEffect(() => {
        let live = true;
        setP(null); setErrors([]); leaving.current = false;
        api.get(id).then(proj => {
            if (!live) return;
            take(proj);
            api.list(proj.site).then(l => live && setOthers(l.filter(o => o.id !== proj.id))).catch(() => {});
        }).catch(e => { if (!live) return; toast.error(e.message); leaving.current = true; nav('/', { replace: true }); });
        api.settings().then(s => live && setHasPassword(s.hasPassword)).catch(() => {});
        return () => { live = false; };
    }, [id, nav]);

    const dirty = !!p && JSON.stringify(strip(p)) !== saved;
    const errMap = useMemo(() => Object.fromEntries(errors.map(e => [e.field, e.message])), [errors]);

    /* ---- the preview follows every edit, a beat later ---- */
    useEffect(() => {
        if (!p || !dirty) return;
        const t = setTimeout(() => {
            api.draft({ ...p, _base: base }).then(() => notifyPreview({ type: 'changed', site: p.site, id: p.id })).catch(() => {});
        }, 260);
        return () => clearTimeout(t);
    }, [p, dirty, base]);
    /* leaving drops the unsaved state from the preview */
    useEffect(() => () => { api.dropDraft(id).catch(() => {}); }, [id]);

    /* ---- save ---- */
    const save = useCallback(async ({ force = false } = {}) => {
        if (!p || saving) return false;
        setSaving(true);
        try {
            const out = await api.save({ ...strip(p), _base: base }, force);
            take(out);
            setErrors([]);
            notifyPreview({ type: 'changed', site: out.site, id: out.id });
            toast.success(out.status === 'published' ? 'Salvat și publicat' : 'Salvat ca draft');
            return true;
        } catch (e) {
            if (e.status === 422) {
                setErrors(e.errors);
                toast.error(p.status === 'published' ? 'Nu se poate publica încă' : 'Date invalide', {
                    description: e.errors.slice(0, 3).map(x => x.message).join(' · ')
                });
            } else if (e.status === 409) {
                setConfirm({ kind: 'conflict', current: e.current });
            } else if (e.status === 404) {
                toast.error(e.message);
                leaving.current = true;
                nav('/' + p.site, { replace: true });
            } else toast.error(e.message);
            return false;
        } finally { setSaving(false); }
    }, [p, saving, base, nav]);

    useEffect(() => {
        const key = e => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (dirty) save(); }
        };
        const unload = e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
        addEventListener('keydown', key);
        addEventListener('beforeunload', unload);
        return () => { removeEventListener('keydown', key); removeEventListener('beforeunload', unload); };
    }, [save, dirty]);

    /* ---- leaving with unsaved changes asks first, whichever way it goes ---- */
    const blocker = useBlocker(({ currentLocation, nextLocation }) =>
        dirty && !leaving.current && currentLocation.pathname !== nextLocation.pathname);

    function back() { nav('/' + (p ? p.site : '')); }
    function go(to) { leaving.current = true; nav(to); }
    async function duplicate() {
        try { const c = await api.duplicate(p.id); toast.success('Duplicat'); go('/p/' + c.id); }
        catch (e) { toast.error(e.message); }
    }
    async function remove() {
        try { await api.remove(p.id); toast.success('Proiect șters'); go('/' + p.site); }
        catch (e) { toast.error(e.message); }
    }
    function togglePreview(v) {
        setShowPreview(v);
        try { localStorage.setItem('pv-open', v ? '1' : '0'); } catch (e) {}
    }

    if (!p) {
        return <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
    }

    const Form = p.site === 'arch' ? ArchForm : ConceptsForm;
    const publishedSaved = JSON.parse(saved || '{}').status === 'published';

    return (
        <div className="flex h-full flex-col">
            {/* ---- the bar ---- */}
            <header className="glass relative z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b px-3 py-2">
                <Button variant="ghost" size="sm" onClick={back} className="text-muted-foreground"><ChevronLeft />{p.site === 'arch' ? 'Architecture' : 'Concepts'}</Button>
                <div className="h-5 w-px bg-border" />
                <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold tracking-tight">{projectName(p)}</div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {p.site === 'arch' ? categoryLabel(p.category) : (p.wallSlot ? 'Perete ' + p.wallSlot : 'Nu e pe perete')}
                        <span>·</span>
                        {saving ? <span className="inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" />Se salvează</span>
                            : dirty ? <span className="inline-flex items-center gap-1 text-[oklch(0.55_0.13_70)]"><span className="size-1.5 rounded-full bg-current" />Modificări nesalvate</span>
                            : <span className="inline-flex items-center gap-1"><Check className="size-3" />Salvat</span>}
                    </div>
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2.5">
                    <Tooltip content={p.protected
                        ? (hasPassword ? 'Pagina se deschide doar cu parola din Setări' : 'Protejat, dar nu e setată nicio parolă în Setări')
                        : 'Oricine poate deschide pagina'}>
                        <label className={cn('flex h-8 cursor-pointer items-center gap-2 rounded-lg border bg-card px-2.5 text-[12px] font-medium',
                            p.protected && !hasPassword && 'border-[oklch(0.8_0.12_70)]')}>
                            {p.protected ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5 text-muted-foreground" />}
                            <span className="hidden sm:inline">Parolă</span>
                            <Switch checked={!!p.protected} onCheckedChange={v => setP(c => ({ ...c, protected: v }))} className="scale-90" />
                        </label>
                    </Tooltip>
                    <Segmented value={p.status} onChange={v => setP(c => ({ ...c, status: v }))}
                        options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: <><span className={cn('size-1.5 rounded-full', p.status === 'published' ? 'bg-success' : 'bg-muted-foreground/50')} />Publicat</> }]} />
                    <Button onClick={() => save()} disabled={saving || !dirty} className="min-w-[92px]">
                        {saving ? <Loader2 className="animate-spin" /> : null}
                        {p.status === 'published' && !publishedSaved ? 'Publică' : 'Salvează'}
                    </Button>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Mai multe"><MoreHorizontal /></Button></DropdownMenuTrigger>
                        <DropdownMenuContent>
                            <DropdownMenuItem onSelect={() => window.open('/preview/' + p.site + '.html?id=' + p.id, '_blank')}><ExternalLink />Preview în tab nou</DropdownMenuItem>
                            {!showPreview && wide && <DropdownMenuItem onSelect={() => togglePreview(true)}><PanelRightOpen />Arată preview-ul</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => dirty ? setConfirm({ kind: 'dup' }) : duplicate()}><Copy />Duplică</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem destructive onSelect={() => setConfirm({ kind: 'delete' })}><Trash2 />Șterge proiectul</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* ---- form | preview ---- */}
            <div className="flex min-h-0 flex-1">
                <div className={cn('min-h-0 min-w-0 shrink-0 overflow-x-hidden overflow-y-auto border-r bg-background scroll-thin', previewOn ? 'w-[clamp(420px,40vw,600px)]' : 'flex-1')}>
                    <div className={cn(!previewOn && 'mx-auto max-w-[720px]')}>
                        {errors.length > 0 && (
                            <div className="mx-6 mt-5 flex gap-2.5 rounded-xl border border-destructive/25 bg-destructive/[0.05] px-3.5 py-3">
                                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                                <div className="text-[13px]">
                                    <div className="font-medium">{p.status === 'published' ? 'Ce mai lipsește pentru publicare' : 'De corectat'}</div>
                                    <ul className="mt-1 grid gap-0.5 text-muted-foreground">
                                        {errors.map((e, i) => <li key={i}>{e.message}</li>)}
                                    </ul>
                                </div>
                            </div>
                        )}
                        <Form key={p.id} p={p} set={setP} errors={errMap} others={others} />
                        <div className="flex items-center justify-between px-6 py-6 text-[12px] text-muted-foreground">
                            <span>Ctrl/⌘ + S salvează</span>
                            {p.status === 'published' && <Badge variant="success">Publicat</Badge>}
                        </div>
                    </div>
                </div>
                {previewOn && (
                    <div className="min-w-0 flex-1">
                        <PreviewPane site={p.site} id={p.id} onHide={() => togglePreview(false)} />
                    </div>
                )}
            </div>

            <Confirm open={!!confirm && confirm.kind === 'delete'} onOpenChange={o => !o && setConfirm(null)}
                title={'Ștergi „' + projectName(p) + '”?'}
                description="Proiectul și pozele lui sunt șterse definitiv de pe server. Acțiunea nu poate fi anulată."
                confirmLabel="Șterge definitiv" destructive onConfirm={remove} />
            {/* closing the dialog fires after the confirm: it must not undo it */}
            <Confirm open={blocker.state === 'blocked'} onOpenChange={o => !o && !leaving.current && blocker.state === 'blocked' && blocker.reset()}
                title="Pleci fără să salvezi?"
                description="Modificările nesalvate se pierd."
                confirmLabel="Pleacă fără salvare" destructive
                onConfirm={() => { leaving.current = true; if (blocker.state === 'blocked') blocker.proceed(); }} />
            <Confirm open={!!confirm && confirm.kind === 'dup'} onOpenChange={o => !o && setConfirm(null)}
                title="Duplici fără modificările nesalvate?"
                description="Copia se face după ultima versiune salvată."
                confirmLabel="Duplică" onConfirm={duplicate} />
            <Confirm open={!!confirm && confirm.kind === 'conflict'} onOpenChange={o => !o && setConfirm(null)}
                title="Proiectul a fost salvat între timp"
                description="Cineva (sau alt tab) a salvat acest proiect după ce l-ai deschis. Poți păstra versiunea ta, peste cealaltă, sau poți încărca versiunea salvată și pierzi modificările tale."
                confirmLabel="Păstrează versiunea mea" onConfirm={() => save({ force: true })}
                secondary={{ label: 'Încarcă versiunea salvată', onClick: () => { if (confirm && confirm.current) take(confirm.current); setErrors([]); } }} />
        </div>
    );
}
