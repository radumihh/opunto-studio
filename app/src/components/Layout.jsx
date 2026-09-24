import { NavLink, Outlet } from 'react-router-dom';
import { Building2, Sparkles, Settings } from 'lucide-react';
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
    return (
        <div className="flex h-full">
            <aside className="flex w-[232px] shrink-0 flex-col border-r bg-[oklch(0.97_0_0)] px-3 py-4">
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
                </div>
            </aside>
            <main className="min-w-0 flex-1 overflow-y-auto scroll-thin">
                <Outlet />
            </main>
        </div>
    );
}
