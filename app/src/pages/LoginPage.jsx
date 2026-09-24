import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { auth } from '@/lib/api';
import { Button, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export default function LoginPage({ onIn }) {
    const [pw, setPw] = useState('');
    const [err, setErr] = useState('');
    const [busy, setBusy] = useState(false);
    async function submit(e) {
        e.preventDefault();
        setBusy(true); setErr('');
        try { await auth.login(pw); onIn(); }
        catch (x) { setErr(x.message); setPw(''); }
        setBusy(false);
    }
    return (
        <div className="grid h-full place-items-center bg-[oklch(0.97_0_0)] px-4">
            <form onSubmit={submit} className="w-full max-w-[340px] animate-in">
                <div className="mb-8 grid justify-items-center gap-3 text-center">
                    <div className="grid size-12 place-items-center rounded-[14px] bg-primary shadow-lg">
                        <div className="size-5 rounded-full border-[3.5px] border-white" />
                    </div>
                    <div>
                        <h1 className="font-display text-[22px] font-semibold tracking-tight">Opunto Studio</h1>
                        <p className="mt-0.5 text-[13px] text-muted-foreground">Introdu parola ca să intri.</p>
                    </div>
                </div>
                <div className="grid gap-2.5">
                    <Input type="password" autoFocus autoComplete="current-password" placeholder="Parolă" value={pw}
                        onChange={e => setPw(e.target.value)} aria-invalid={!!err || undefined} className={cn('h-10 text-center text-[14px]')} />
                    <Button type="submit" size="lg" disabled={busy || !pw}>{busy ? <Loader2 className="animate-spin" /> : 'Intră'}</Button>
                    <p className="min-h-5 text-center text-[12px] text-destructive" role="alert">{err}</p>
                </div>
            </form>
        </div>
    );
}
