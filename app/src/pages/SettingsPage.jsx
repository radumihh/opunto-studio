import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, LockOpen, Eye, EyeOff, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Label, Card, Badge } from '@/components/ui/primitives';
import { Confirm } from '@/components/ui/overlays';

function PasswordInput({ id, value, onChange, placeholder, autoComplete = 'new-password' }) {
    const [show, setShow] = useState(false);
    return (
        <div className="relative flex-1">
            <Input id={id} type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder} autoComplete={autoComplete} className="pr-9" />
            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ascunde' : 'Arată'}
                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
        </div>
    );
}

export default function SettingsPage() {
    const [s, setS] = useState(null);
    const [pw, setPw] = useState('');
    const [busy, setBusy] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [cur, setCur] = useState('');
    const [next, setNext] = useState('');

    useEffect(() => { api.settings().then(setS).catch(e => toast.error(e.message)); }, []);

    async function save(e) {
        e.preventDefault();
        if (pw.length < 4) { toast.error('Minim 4 caractere'); return; }
        setBusy(true);
        try { const r = await api.setPassword(pw); setS(x => ({ ...x, ...r })); setPw(''); toast.success('Parola proiectelor a fost setată'); }
        catch (err) { toast.error(err.message); }
        setBusy(false);
    }
    async function clear() {
        try { const r = await api.setPassword(''); setS(x => ({ ...x, ...r })); toast.success('Parola a fost scoasă'); }
        catch (err) { toast.error(err.message); }
    }
    async function saveAdmin(e) {
        e.preventDefault();
        if (next.length < 8) { toast.error('Parola nouă: minim 8 caractere'); return; }
        setBusy(true);
        try { await api.setAdmin(cur, next); setCur(''); setNext(''); setS(x => ({ ...x, hasAdmin: true, adminFromEnv: false })); dispatchEvent(new Event('opunto:auth-changed')); toast.success('Parola de acces a fost schimbată'); }
        catch (err) { toast.error(err.message); }
        setBusy(false);
    }
    const has = s && s.hasPassword;

    return (
        <div className="mx-auto max-w-[720px] px-4 pt-6 pb-16 md:px-8 md:pt-8">
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.022em]">Setări</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Setările comune ambelor site-uri.</p>

            <Card className="mt-6 p-5">
                <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                    Parola proiectelor protejate
                    {s && (has ? <Badge variant="success"><Lock />Setată</Badge> : <Badge variant="warning"><LockOpen />Nesetată</Badge>)}
                </div>
                <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                    O singură parolă pentru toate proiectele. În fiecare proiect alegi doar dacă e protejat.
                    Vizitatorii văd cardul, iar pagina se deschide numai cu parola. Dacă o schimbi, cine a deschis deja un proiect trebuie să o introducă din nou.
                </p>
                <form onSubmit={save} className="mt-5 grid gap-2">
                    <Label htmlFor="pw">{has ? 'Parolă nouă' : 'Parolă'}</Label>
                    <div className="flex gap-2">
                        <PasswordInput id="pw" value={pw} onChange={setPw} placeholder="Minim 4 caractere" />
                        <Button type="submit" disabled={busy || !pw}>{has ? 'Schimbă' : 'Setează'}</Button>
                    </div>
                    {has && <button type="button" onClick={() => setClearing(true)} className="mt-1 cursor-pointer justify-self-start text-xs text-destructive hover:underline">Scoate parola</button>}
                </form>
            </Card>

            <Card className="mt-4 p-5">
                <div className="text-[15px] font-semibold tracking-tight">Parola de acces în Studio</div>
                <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                    {s && !s.hasAdmin
                        ? 'Studio-ul e deschis fără parolă, pentru că rulează doar pe acest calculator. Setează una înainte să-l pui pe un server.'
                        : 'Parola cu care se intră în Studio. După schimbare, celelalte sesiuni deschise se închid.'}
                </p>
                <form onSubmit={saveAdmin} className="mt-5 grid gap-3">
                    {s && s.hasAdmin && (
                        <div className="grid gap-2">
                            <Label htmlFor="cur">Parola actuală</Label>
                            <PasswordInput id="cur" value={cur} onChange={setCur} autoComplete="current-password" />
                        </div>
                    )}
                    <div className="grid gap-2">
                        <Label htmlFor="next">Parolă nouă</Label>
                        <div className="flex gap-2">
                            <PasswordInput id="next" value={next} onChange={setNext} placeholder="Minim 8 caractere" />
                            <Button type="submit" disabled={busy || !next || (s && s.hasAdmin && !cur)}>Salvează</Button>
                        </div>
                    </div>
                </form>
            </Card>

            <Card className="mt-4 flex items-center justify-between gap-4 p-5">
                <div>
                    <div className="text-[15px] font-semibold tracking-tight">Exportă portofoliul</div>
                    <p className="mt-1 text-[13px] text-muted-foreground">Un singur fișier .zip cu toate proiectele, textele și pozele. Pe acesta îl trimiți când portofoliul e gata.</p>
                </div>
                <Button asChild><a href="/api/export" download><Download />Exportă .zip</a></Button>
            </Card>

            <Confirm open={clearing} onOpenChange={setClearing} title="Scoți parola?"
                description="Proiectele marcate ca protejate nu vor mai putea fi deschise de nimeni până setezi o parolă nouă."
                confirmLabel="Scoate parola" destructive onConfirm={clear} />
        </div>
    );
}
