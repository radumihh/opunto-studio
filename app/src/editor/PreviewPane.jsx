import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Monitor, Laptop, Smartphone, RotateCw, ExternalLink, UserRound, PanelRightClose } from 'lucide-react';
import { Segmented, Button, Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

const DEVICES = {
    desktop: { w: 1440, h: 900, label: <Monitor />, title: 'Desktop 1440×900' },
    laptop:  { w: 1280, h: 760, label: <Laptop />, title: 'Laptop 1280×760' },
    mobile:  { w: 390, h: 844, label: <Smartphone />, title: 'Telefon 390×844' }
};

/* THE SITE, IN A FRAME. The frame is given the real size of the screen
   being imitated — 1440 wide is 1440 wide to the page, so its breakpoints
   and its measured type behave exactly as they will live — and is then
   scaled down to fit the panel. Edits reach it over the preview channel;
   it only reloads when asked to. */
export function PreviewPane({ site, id, onHide }) {
    const box = useRef(null);
    const [device, setDevice] = useState(() => localStorage.getItem('pv-device') || 'desktop');
    const [visitor, setVisitor] = useState(false);
    const [nonce, setNonce] = useState(0);
    const [scale, setScale] = useState(0.5);
    const [loading, setLoading] = useState(true);
    const d = DEVICES[device] || DEVICES.desktop;

    useEffect(() => { try { localStorage.setItem('pv-device', device); } catch (e) {} }, [device]);

    useLayoutEffect(() => {
        const el = box.current;
        if (!el) return;
        const fit = () => {
            const r = el.getBoundingClientRect();
            setScale(Math.min((r.width - 40) / d.w, (r.height - 40) / d.h, 1));
        };
        fit();
        const ro = new ResizeObserver(fit);
        ro.observe(el);
        return () => ro.disconnect();
    }, [d.w, d.h]);

    const src = '/preview/' + site + '.html?id=' + id + (visitor ? '&visitor=1' : '') + '&n=' + nonce;
    useEffect(() => setLoading(true), [src]);

    return (
        <div className="flex h-full min-w-0 flex-col bg-[oklch(0.955_0_0)]">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/70 px-3">
                <span className="mr-1 text-[12px] font-medium text-muted-foreground">Preview</span>
                <Segmented size="sm" value={device} onChange={setDevice}
                    options={Object.entries(DEVICES).map(([k, v]) => ({ value: k, label: v.label, title: v.title }))} />
                <Tooltip content="Cum vede un vizitator: doar proiectele publicate, iar la cele protejate apare parola">
                    <button type="button" onClick={() => setVisitor(v => !v)}
                        className={cn('inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium transition-colors [&_svg]:size-3.5',
                            visitor ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                        <UserRound />Vizitator
                    </button>
                </Tooltip>
                <div className="ml-auto flex items-center gap-0.5">
                    <span className="mr-2 font-mono text-[10px] text-muted-foreground tabular-nums">{d.w}×{d.h} · {Math.round(scale * 100)}%</span>
                    <Tooltip content="Reîncarcă (reia animația de deschidere)">
                        <Button variant="ghost" size="icon-sm" onClick={() => setNonce(n => n + 1)} aria-label="Reîncarcă"><RotateCw /></Button>
                    </Tooltip>
                    <Tooltip content="Deschide pe tot ecranul, în tab nou">
                        <Button variant="ghost" size="icon-sm" onClick={() => window.open(src.replace(/&n=\d+/, ''), '_blank')} aria-label="Tab nou"><ExternalLink /></Button>
                    </Tooltip>
                    {onHide && (
                        <Tooltip content="Ascunde preview-ul">
                            <Button variant="ghost" size="icon-sm" onClick={onHide} aria-label="Ascunde preview"><PanelRightClose /></Button>
                        </Tooltip>
                    )}
                </div>
            </div>
            <div ref={box} className="relative min-h-0 flex-1 overflow-hidden">
                <div className="absolute top-1/2 left-1/2" style={{ width: d.w * scale, height: d.h * scale, transform: 'translate(-50%,-50%)' }}>
                    <div className={cn('overflow-hidden bg-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.35),0_0_0_1px_rgb(0_0_0/0.06)]',
                        device === 'mobile' ? 'rounded-[28px]' : 'rounded-lg')}
                        style={{ width: d.w, height: d.h, transform: 'scale(' + scale + ')', transformOrigin: '0 0' }}>
                        <iframe key={src} data-preview title="Preview" src={src} onLoad={() => setLoading(false)}
                            className="size-full border-0" style={{ width: d.w, height: d.h }} />
                    </div>
                    {loading && <div className="absolute inset-0 animate-pulse rounded-lg bg-white/60" />}
                </div>
            </div>
        </div>
    );
}
