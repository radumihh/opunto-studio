import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Sparkles, Settings, LogOut } from 'lucide-react';
import { auth } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV = [
    { to: '/arch', label: 'Architecture', hint: '#arch', icon: Building2 },
    { to: '/concepts', label: 'Concepts', hint: '#concepts', icon: Sparkles }
];

function Item({ to, icon: Icon, label, hint }) {
    return (
        <NavLink to={to}
            className={({ isActive }) => cn('group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors',
                isActive ? 'bg-card text-foreground shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_0.5px_rgb(0_0_0/0.05)]' : 'text-muted-foreground hover:bg-black/[0.035] hover:text-foreground')}>
            <Icon className="size-4 opacity-80" strokeWidth={1.8} />
            <span className="flex-1">{label}</span>
            {hint && <span className="font-mono text-[10px] opacity-50">{hint}</span>}
        </NavLink>
    );
}

export default function Layout() {
    const [authOn, setAuthOn] = useState(false);
    useEffect(() => {
        const check = () => auth.me().then(m => setAuthOn(m.authOn)).catch(() => {});
        check();
        addEventListener('opunto:auth-changed', check);
        return () => removeEventListener('opunto:auth-changed', check);
    }, []);
    async function out() {
        await auth.logout().catch(() => {});
        dispatchEvent(new Event('opunto:signed-out'));
    }
    return (
        <div className="flex h-full flex-col md:flex-row">
            {/* phones: the same links, as a bar across the top */}
            <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-[oklch(0.97_0_0)] px-2 py-2 md:hidden">
                {[...NAV, { to: '/settings', label: 'Setări', icon: Settings }].map(n => (
                    <NavLink key={n.to} to={n.to} className={({ isActive }) => cn('flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium whitespace-nowrap',
                        isActive ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
                        <n.icon className="size-4" strokeWidth={1.8} />{n.label}
                    </NavLink>
                ))}
                {authOn && <button type="button" onClick={out} className="ml-auto cursor-pointer rounded-lg p-1.5 text-muted-foreground" aria-label="Ieșire"><LogOut className="size-4" /></button>}
            </nav>
            <aside className="hidden w-[232px] shrink-0 flex-col border-r bg-[oklch(0.97_0_0)] px-3 py-4 md:flex">
                <div className="mb-6 flex items-center gap-2.5 px-2.5">
                    <div className="grid size-7 place-items-center rounded-[8px] bg-primary">
                        <div className="size-3 rounded-full border-[2.5px] border-white" />
                    </div>
                    <div className="leading-tight">
                        <div className="font-display text-[14px] font-semibold tracking-tight">Opunto Studio</div>
                        <div className="text-[11px] text-muted-foreground">Proiecte</div>
                    </div>
                </div>
                <div className="px-2.5 pb-1.5 text-[11px] font-medium text-muted-foreground/80">Site-uri</div>
                <nav className="grid gap-0.5">{NAV.map(n => <Item key={n.to} {...n} />)}</nav>
                <div className="mt-auto grid gap-0.5">
                    <Item to="/settings" icon={Settings} label="Setări" />
                    {authOn && (
                        <button type="button" onClick={out}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-black/[0.035] hover:text-foreground">
                            <LogOut className="size-4 opacity-80" strokeWidth={1.8} />Ieșire
                        </button>
                    )}
                </div>
            </aside>
            <main className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto scroll-thin">
                <Outlet />
            </main>
        </div>
    );
}
