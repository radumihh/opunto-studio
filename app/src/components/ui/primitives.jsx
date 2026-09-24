/* shadcn/ui components, written out here rather than generated, on the
   same Radix primitives and the same class conventions. */
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

/* ---- Button --------------------------------------------------------- */
export const buttonVariants = cva(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium transition-[background,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-45 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:scale-[0.98] [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer select-none',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/88',
                destructive: 'bg-destructive text-white shadow-sm hover:bg-destructive/90',
                outline: 'border bg-card shadow-[0_1px_1px_rgb(0_0_0/0.03)] hover:bg-accent',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
                ghost: 'hover:bg-accent hover:text-accent-foreground',
                link: 'text-primary underline-offset-4 hover:underline'
            },
            size: {
                default: 'h-8 px-3',
                sm: 'h-7 rounded-md px-2.5 text-xs',
                lg: 'h-10 rounded-lg px-5 text-sm',
                icon: 'size-8',
                'icon-sm': 'size-7 rounded-md'
            }
        },
        defaultVariants: { variant: 'default', size: 'default' }
    }
);
export const Button = React.forwardRef(function Button({ className, variant, size, asChild = false, ...props }, ref) {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />;
});

/* ---- Inputs --------------------------------------------------------- */
const field = 'w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[13px] shadow-[0_1px_1px_rgb(0_0_0/0.02)] outline-none transition-[border,box-shadow] placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15';

export const Input = React.forwardRef(function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(field, 'h-9', className)} {...props} />;
});

export const Textarea = React.forwardRef(function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(field, 'min-h-24 py-2 leading-relaxed resize-y field-sizing-content', className)} {...props} />;
});

export const Label = React.forwardRef(function Label({ className, ...props }, ref) {
    return <LabelPrimitive.Root ref={ref} className={cn('text-[13px] font-medium leading-none select-none', className)} {...props} />;
});

/* ---- Switch --------------------------------------------------------- */
export const Switch = React.forwardRef(function Switch({ className, ...props }, ref) {
    return (
        <SwitchPrimitive.Root ref={ref}
            className={cn('peer inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=checked]:bg-success data-[state=unchecked]:bg-input disabled:opacity-50', className)}
            {...props}>
            <SwitchPrimitive.Thumb className="pointer-events-none block size-[18px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.2)] transition-transform duration-200 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
        </SwitchPrimitive.Root>
    );
});

/* ---- Badge ---------------------------------------------------------- */
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap [&_svg]:size-3', {
    variants: {
        variant: {
            default: 'bg-primary text-primary-foreground',
            secondary: 'bg-secondary text-secondary-foreground',
            outline: 'border text-foreground',
            success: 'bg-success/12 text-[oklch(0.45_0.13_150)]',
            warning: 'bg-[oklch(0.8_0.15_80/0.18)] text-[oklch(0.5_0.12_70)]'
        }
    },
    defaultVariants: { variant: 'default' }
});
export function Badge({ className, variant, ...props }) {
    return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ---- Separator ------------------------------------------------------ */
export function Separator({ className, orientation = 'horizontal', ...props }) {
    return <SeparatorPrimitive.Root decorative orientation={orientation}
        className={cn('shrink-0 bg-border', orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px', className)} {...props} />;
}

/* ---- Tooltip -------------------------------------------------------- */
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ content, children, side = 'bottom' }) {
    if (!content) return children;
    return (
        <TooltipPrimitive.Root delayDuration={350}>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content side={side} sideOffset={6}
                    className="z-50 animate-in rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-md">
                    {content}
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}

/* ---- Segmented control (Apple-style tabs for small choices) --------- */
export function Segmented({ value, onChange, options, className, size = 'default' }) {
    return (
        <div role="radiogroup" className={cn('inline-flex rounded-lg bg-secondary p-0.5', className)}>
            {options.map(o => {
                const on = o.value === value;
                return (
                    <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
                        title={o.title}
                        className={cn('inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all cursor-pointer [&_svg]:size-3.5',
                            size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-3 text-xs',
                            on ? 'bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)]' : 'text-muted-foreground hover:text-foreground')}>
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/* ---- Card ----------------------------------------------------------- */
export function Card({ className, ...props }) {
    return <div className={cn('rounded-xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.03)]', className)} {...props} />;
}
