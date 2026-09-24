import { cn } from '@/lib/utils';
import { Label, Input, Textarea } from '@/components/ui/primitives';

/* A labelled form row: label, the control, a hint under it, a character
   count when the field has a limit, and the server's message when it
   refused the value. */
export function Field({ label, hint, error, count, max, children, className, htmlFor, aside }) {
    const over = max && count > max;
    return (
        <div className={cn('grid gap-1.5', className)}>
            {(label || aside) && (
                <div className="flex items-baseline justify-between gap-2">
                    {label && <Label htmlFor={htmlFor}>{label}</Label>}
                    {aside}
                </div>
            )}
            {children}
            {(hint || error || max) && (
                <div className="flex items-start justify-between gap-3 text-[12px] leading-snug">
                    <span className={error ? 'text-destructive' : 'text-muted-foreground'}>{error || hint}</span>
                    {max ? <span className={cn('shrink-0 tabular-nums', over ? 'text-destructive' : 'text-muted-foreground/70')}>{count || 0}/{max}</span> : null}
                </div>
            )}
        </div>
    );
}

export function TextField({ label, hint, error, value, onChange, max, placeholder, id, list, className }) {
    const v = value || '';
    return (
        <Field label={label} hint={hint} error={error} max={max} count={v.length} htmlFor={id} className={className}>
            <Input id={id} value={v} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error || undefined} list={list} />
        </Field>
    );
}

export function AreaField({ label, hint, error, value, onChange, max, placeholder, id, rows = 4 }) {
    const v = value || '';
    return (
        <Field label={label} hint={hint} error={error} max={max} count={v.length} htmlFor={id}>
            <Textarea id={id} rows={rows} value={v} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-invalid={!!error || undefined} />
        </Field>
    );
}

/* a titled group of fields, the unit the form is read in */
export function Section({ title, description, children, action, id }) {
    return (
        <section id={id} className="scroll-mt-4 border-b px-6 py-6 last:border-b-0">
            <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
                    {description && <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
                </div>
                {action}
            </div>
            <div className="grid gap-4">{children}</div>
        </section>
    );
}
