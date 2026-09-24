/* shadcn/ui overlays: Select, Dialog, AlertDialog, DropdownMenu, Popover-less. */
import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from './primitives';

const pop = 'z-50 animate-in rounded-xl border bg-popover text-popover-foreground shadow-[0_10px_38px_-10px_rgb(0_0_0/0.25),0_10px_20px_-15px_rgb(0_0_0/0.15)]';

/* ---- Select --------------------------------------------------------- */
export function Select({ value, onValueChange, options, placeholder, className, invalid }) {
    return (
        <SelectPrimitive.Root value={value == null ? undefined : String(value)} onValueChange={onValueChange}>
            <SelectPrimitive.Trigger aria-invalid={invalid || undefined}
                className={cn('flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-[13px] shadow-[0_1px_1px_rgb(0_0_0/0.02)] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 data-[placeholder]:text-muted-foreground cursor-pointer aria-invalid:border-destructive [&>span]:truncate', className)}>
                <SelectPrimitive.Value placeholder={placeholder} />
                <SelectPrimitive.Icon asChild><ChevronDown className="size-4 opacity-50" /></SelectPrimitive.Icon>
            </SelectPrimitive.Trigger>
            <SelectPrimitive.Portal>
                <SelectPrimitive.Content position="popper" sideOffset={4}
                    className={cn(pop, 'max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1')}>
                    <SelectPrimitive.Viewport>
                        {options.map(o => (
                            <SelectPrimitive.Item key={String(o.value)} value={String(o.value)}
                                className="relative flex cursor-pointer items-center rounded-md py-1.5 pr-8 pl-2 text-[13px] outline-none select-none data-[highlighted]:bg-accent">
                                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center"><Check className="size-3.5" /></SelectPrimitive.ItemIndicator>
                            </SelectPrimitive.Item>
                        ))}
                    </SelectPrimitive.Viewport>
                </SelectPrimitive.Content>
            </SelectPrimitive.Portal>
        </SelectPrimitive.Root>
    );
}

/* ---- Dialog --------------------------------------------------------- */
export const Dialog = DialogPrimitive.Root;
export function DialogContent({ className, children, title, description, ...props }) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] data-[state=open]:animate-[fade_.15s]" />
            <DialogPrimitive.Content className={cn(pop, 'fixed top-1/2 left-1/2 z-50 grid w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 gap-4 p-5 outline-none', className)} {...props}>
                <div className="grid gap-1 pr-6">
                    <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</DialogPrimitive.Title>
                    {description
                        ? <DialogPrimitive.Description className="text-[13px] text-muted-foreground">{description}</DialogPrimitive.Description>
                        : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
                </div>
                {children}
                <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100 cursor-pointer">
                    <X className="size-4" /><span className="sr-only">Închide</span>
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

/* ---- Confirm (AlertDialog) ------------------------------------------ */
export function Confirm({ open, onOpenChange, title, description, confirmLabel = 'Confirmă', destructive, onConfirm, secondary }) {
    return (
        <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialogPrimitive.Portal>
                <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]" />
                <AlertDialogPrimitive.Content className={cn(pop, 'fixed top-1/2 left-1/2 z-50 grid w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 gap-4 p-5')}>
                    <div className="grid gap-1.5">
                        <AlertDialogPrimitive.Title className="text-[15px] font-semibold tracking-tight">{title}</AlertDialogPrimitive.Title>
                        <AlertDialogPrimitive.Description className="text-[13px] leading-relaxed text-muted-foreground">{description}</AlertDialogPrimitive.Description>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                        <AlertDialogPrimitive.Cancel className={buttonVariants({ variant: secondary ? 'ghost' : 'outline' })}>Anulează</AlertDialogPrimitive.Cancel>
                        {secondary && (
                            <AlertDialogPrimitive.Action className={buttonVariants({ variant: 'outline' })} onClick={secondary.onClick}>{secondary.label}</AlertDialogPrimitive.Action>
                        )}
                        <AlertDialogPrimitive.Action className={buttonVariants({ variant: destructive ? 'destructive' : 'default' })} onClick={onConfirm}>
                            {confirmLabel}
                        </AlertDialogPrimitive.Action>
                    </div>
                </AlertDialogPrimitive.Content>
            </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
    );
}

/* ---- DropdownMenu --------------------------------------------------- */
export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ className, align = 'end', ...props }) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content align={align} sideOffset={6} className={cn(pop, 'min-w-44 p-1', className)} {...props} />
        </DropdownMenuPrimitive.Portal>
    );
}
export function DropdownMenuItem({ className, destructive, ...props }) {
    return <DropdownMenuPrimitive.Item
        className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] outline-none select-none data-[highlighted]:bg-accent [&_svg]:size-4 [&_svg]:opacity-70',
            destructive && 'text-destructive data-[highlighted]:bg-destructive/8 [&_svg]:opacity-100', className)} {...props} />;
}
export function DropdownMenuSeparator() {
    return <DropdownMenuPrimitive.Separator className="-mx-1 my-1 h-px bg-border" />;
}
