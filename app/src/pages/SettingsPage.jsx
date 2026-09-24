import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Lock, LockOpen, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Input, Label, Card, Badge } from '@/components/ui/primitives';
import { Confirm } from '@/components/ui/overlays';

export default function SettingsPage() {
    const [has, setHas] = useState(null);
    const [pw, setPw] = useState('');
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [clearing, setClearing] = useState(false);

    useEffect(() => { api.settings().then(s => setHas(s.hasPassword)).catch(e => toast.error(e.message)); }, []);

    async function save(e) {
        e.preventDefault();
        if (pw.length < 4) { toast.error('Minim 4 caractere'); return; }
        setBusy(true);
        try { const s = await api.setPassword(pw); setHas(s.hasPassword); setPw(''); toast.success('Parola a fost schimbată'); }
        catch (err) { toast.error(err.message); }
        setBusy(false);
    }
    async function clear() {
        try { const s = await api.setPassword(''); setHas(s.hasPassword); toast.success('Parola a fost scoasă'); }
        catch (err) { toast.error(err.message); }
    }

    return (
        <div className="mx-auto max-w-[720px] px-8 pt-8 pb-16">
            <h1 className="font-display text-[28px] font-semibold tracking-[-0.022em]">Setări</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">Setările comune ambelor site-uri.</p>

            <Card className="mt-6 p-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                            Parola proiectelor protejate
                            {has === null ? null : has
                                ? <Badge variant="success"><Lock />Setată</Badge>
                                : <Badge variant="warning"><LockOpen />Nesetată</Badge>}
                        </div>
                        <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">
                            O singură parolă pentru toate proiectele. În fiecare proiect alegi doar dacă e protejat sau nu.
                            Vizitatorii văd cardul, iar pagina se deschide numai după ce introduc parola.
                            Dacă schimbi parola, cei care au deschis deja un proiect trebuie să o introducă din nou.
                        </p>
                    </div>
                </div>
                <form onSubmit={save} className="mt-5 grid gap-2">
                    <Label htmlFor="pw">{has ? 'Parolă nouă' : 'Parolă'}</Label>
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Input id="pw" type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)}
                                placeholder="Minim 4 caractere" autoComplete="new-password" className="pr-9" />
                            <button type="button" onClick={() => setShow(s => !s)} aria-label={show ? 'Ascunde' : 'Arată'}
                                className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-1 text-muted-foreground hover:text-foreground">
                                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                        <Button type="submit" disabled={busy || !pw}>{has ? 'Schimbă' : 'Setează'}</Button>
                    </div>
                    {has && <button type="button" onClick={() => setClearing(true)} className="mt-1 justify-self-start cursor-pointer text-xs text-destructive hover:underline">Scoate parola</button>}
                </form>
            </Card>

            <Confirm open={clearing} onOpenChange={setClearing} title="Scoți parola?"
                description="Proiectele marcate ca protejate nu vor mai putea fi deschise de nimeni până setezi o parolă nouă."
                confirmLabel="Scoate parola" destructive onConfirm={clear} />
        </div>
    );
}
